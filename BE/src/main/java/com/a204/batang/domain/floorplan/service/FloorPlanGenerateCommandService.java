package com.a204.batang.domain.floorplan.service;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
import com.a204.batang.domain.floorplan.dto.CreateFloorPlanGenerateRequest;
import com.a204.batang.domain.floorplan.dto.CreateFloorPlanGenerateResponse;
import com.a204.batang.domain.floorplan.dto.FloorPlanStatusSseResponse;
import com.a204.batang.domain.floorplan.dto.LayoutImportV2Payload;
import com.a204.batang.domain.floorplan.entity.FloorPlanJob;
import com.a204.batang.domain.floorplan.entity.FloorPlanJobStep;
import com.a204.batang.domain.floorplan.messaging.FloorPlanGenerateCommandPublisher;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanCommandPublishRequestedEvent;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanPublishFailedEvent;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanStatusChangedEvent;
import com.a204.batang.domain.floorplan.repository.FloorPlanJobRepository;
import com.a204.batang.domain.floorplan.repository.FloorPlanJobStepRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Floor-plan generate command 예약과 커밋 이후 RabbitMQ 발행을 담당한다.
 *
 * request_payload에는 FE 원본 body가 아니라 worker에 실제로 전달할 정규화된
 * layout_import_v2 payload를 저장한다. 그래야 저장된 예약 정보와 실제 발행 메시지가
 * 달라지는 문제를 막을 수 있다.
 *
 * input_payload에는 예약 시점에 확정된 revision/artifact/storage path를 함께 저장한다.
 * 이후 worker event가 들어왔을 때 reserved id와 결과를 대조하는 최종 방어선으로 쓴다.
 *
 * 실제 RabbitMQ publish는 AFTER_COMMIT에서 수행한다. 그래야 publish 성공 후 DB rollback으로
 * 예약 row가 사라지는 orphan message 문제를 피할 수 있다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FloorPlanGenerateCommandService {

    private static final int STEP_NO = 1;
    private static final int TOTAL_STEPS = 1;
    private static final int ATTEMPT_NO = 1;
    private static final int MAX_ATTEMPTS = 3;
    private static final String MESSAGE_SCHEMA_VERSION = "v1";
    private static final String MESSAGE_TYPE_COMMAND = "COMMAND";
    private static final String STATUS_QUEUED = "QUEUED";

    private final ProjectRepository projectRepository;
    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final RevisionRepository revisionRepository;
    private final ProjectAccessService projectAccessService;
    private final FloorPlanJobRepository floorPlanJobRepository;
    private final FloorPlanJobStepRepository floorPlanJobStepRepository;
    private final FloorPlanLayoutImportMapper floorPlanLayoutImportMapper;
    private final FloorPlanStoragePathBuilder floorPlanStoragePathBuilder;
    private final FloorPlanGenerateCommandPublisher floorPlanGenerateCommandPublisher;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @Transactional
    public CreateFloorPlanGenerateResponse createFloorPlanGenerate(
            UUID projectId,
            UUID userId,
            CreateFloorPlanGenerateRequest request
    ) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = Optional.ofNullable(userId)
                .orElseGet(projectAccessService::resolveCurrentUserIdOrThrow);
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

        LayoutImportResolution resolution = resolveLayoutImport(project, request);
        LayoutImportV2Payload layoutImportPayload = resolution.payload();

        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID targetRevisionId = UUID.randomUUID();
        UUID expectedOutputArtifactId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        String idempotencyKey = jobId + ":step-1:ifc-generate";

        int nextRevisionNo = revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId)
                .map(revision -> revision.getRevisionNo() + 1)
                .orElse(1);

        String ifcStorageUrl = floorPlanStoragePathBuilder.buildIfcStorageUrl(projectId, targetRevisionId);
        String validationReportStorageUrl = floorPlanStoragePathBuilder.buildValidationReportStorageUrl(jobId, STEP_NO);

        // request_payload와 실제 worker payload를 같은 정규화 결과로 고정해
        // 저장된 예약 정보와 실제 발행 메시지의 불일치를 막는다.
        FloorPlanGenerateCommandMessage.Payload commandPayload =
                new FloorPlanGenerateCommandMessage.Payload(layoutImportPayload);
        JsonNode requestPayload = objectMapper.valueToTree(commandPayload);
        JsonNode inputPayload = objectMapper.valueToTree(buildInputPayload(
                resolution.inputSource(),
                targetRevisionId,
                expectedOutputArtifactId,
                ifcStorageUrl,
                validationReportStorageUrl,
                layoutImportPayload.schemaVersion(),
                nextRevisionNo
        ));

        LocalDateTime now = LocalDateTime.now();
        Revision revision = Revision.createCreating(
                targetRevisionId,
                projectId,
                project.getLatestRevisionId(),
                nextRevisionNo,
                currentUserId,
                null,
                null,
                now
        );
        FloorPlanJob job = FloorPlanJob.createQueued(
                jobId,
                projectId,
                currentUserId,
                null,
                null,
                FloorPlanConstants.SOURCE_SCENE_TYPE_LAYOUT_IMPORT,
                FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE,
                requestPayload,
                now
        );
        FloorPlanJobStep step = FloorPlanJobStep.createQueued(
                jobStepId,
                jobId,
                STEP_NO,
                FloorPlanConstants.WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE,
                RabbitMqConfig.IFC_GENERATE_COMMAND_ROUTING_KEY,
                idempotencyKey,
                inputPayload,
                now
        );

        revisionRepository.save(revision);
        floorPlanJobRepository.save(job);
        floorPlanJobStepRepository.save(step);

        FloorPlanGenerateCommandMessage commandMessage = new FloorPlanGenerateCommandMessage(
                UUID.randomUUID(),
                MESSAGE_SCHEMA_VERSION,
                MESSAGE_TYPE_COMMAND,
                FloorPlanConstants.COMMAND_TYPE_IFC_GENERATE_FROM_BUBBLE,
                RabbitMqConfig.IFC_GENERATE_COMMAND_ROUTING_KEY,
                jobId,
                jobStepId,
                STEP_NO,
                TOTAL_STEPS,
                projectId,
                currentUserId,
                null,
                null,
                FloorPlanConstants.SOURCE_SCENE_TYPE_LAYOUT_IMPORT,
                targetRevisionId,
                expectedOutputArtifactId,
                null,
                new FloorPlanGenerateCommandMessage.ExpectedOutput(ifcStorageUrl, validationReportStorageUrl),
                commandPayload,
                ATTEMPT_NO,
                MAX_ATTEMPTS,
                idempotencyKey,
                correlationId,
                OffsetDateTime.now(ZoneOffset.UTC)
        );

        log.info(
                "Floor-plan generate 작업을 예약합니다. projectId={}, jobId={}, jobStepId={}, targetRevisionId={}, correlationId={}, inputSource={}",
                projectId,
                jobId,
                jobStepId,
                targetRevisionId,
                correlationId,
                resolution.inputSource()
        );
        log.info(
                "Floor-plan command 발행을 예약합니다. projectId={}, jobId={}, jobStepId={}, routingKey={}, correlationId={}",
                projectId,
                jobId,
                jobStepId,
                RabbitMqConfig.IFC_GENERATE_COMMAND_ROUTING_KEY,
                correlationId
        );

        eventPublisher.publishEvent(new FloorPlanCommandPublishRequestedEvent(commandMessage));

        FloorPlanStatusSseResponse statusPayload = new FloorPlanStatusSseResponse(
                FloorPlanConstants.SSE_FLOOR_PLAN_QUEUED,
                projectId,
                jobId,
                jobStepId,
                targetRevisionId,
                STATUS_QUEUED,
                0,
                null
        );
        eventPublisher.publishEvent(new FloorPlanStatusChangedEvent(
                projectId,
                FloorPlanConstants.SSE_FLOOR_PLAN_QUEUED,
                statusPayload
        ));

        return new CreateFloorPlanGenerateResponse(
                projectId,
                jobId,
                jobStepId,
                targetRevisionId,
                expectedOutputArtifactId,
                resolution.inputSource(),
                STATUS_QUEUED,
                0
        );
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleCommandPublishRequested(FloorPlanCommandPublishRequestedEvent event) {
        FloorPlanGenerateCommandMessage message = event.message();
        try {
            floorPlanGenerateCommandPublisher.publish(message);
        } catch (CustomException e) {
            eventPublisher.publishEvent(new FloorPlanPublishFailedEvent(
                    message,
                    e.getMessage(),
                    false
            ));
        }
    }

    private LayoutImportResolution resolveLayoutImport(Project project, CreateFloorPlanGenerateRequest request) {
        if (request != null && request.layoutImport() != null && !request.layoutImport().isNull()) {
            log.info(
                    "Floor-plan 입력원으로 raw layoutImport를 사용합니다. projectId={}, inputSource={}",
                    project.getProjectId(),
                    FloorPlanConstants.INPUT_SOURCE_RAW_REQUEST
            );
            return new LayoutImportResolution(
                    FloorPlanConstants.INPUT_SOURCE_RAW_REQUEST,
                    floorPlanLayoutImportMapper.fromRawRequest(
                            project.getProjectId(),
                            project.getName(),
                            request.layoutImport()
                    )
            );
        }

        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(project.getProjectId())
                .orElseThrow(() -> new CustomException(ErrorCode.FLOOR_PLAN_SNAPSHOT_NOT_FOUND));
        JsonNode snapshotNode = workspace.getBubbleSnapshotJson();
        if (snapshotNode == null || snapshotNode.isNull()) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_SNAPSHOT_NOT_FOUND);
        }

        log.info(
                "Floor-plan 입력원으로 workspace snapshot fallback을 사용합니다. projectId={}, inputSource={}",
                project.getProjectId(),
                FloorPlanConstants.INPUT_SOURCE_WORKSPACE_SNAPSHOT
        );

        return new LayoutImportResolution(
                FloorPlanConstants.INPUT_SOURCE_WORKSPACE_SNAPSHOT,
                floorPlanLayoutImportMapper.fromBubbleSnapshot(
                        project.getProjectId(),
                        project.getName(),
                        snapshotNode
                )
        );
    }

    private Map<String, Object> buildInputPayload(
            String inputSource,
            UUID targetRevisionId,
            UUID expectedOutputArtifactId,
            String ifcStorageUrl,
            String validationReportStorageUrl,
            String layoutImportSchemaVersion,
            int revisionNo
    ) {
        Map<String, Object> inputPayload = new LinkedHashMap<>();
        inputPayload.put("inputSource", inputSource);
        inputPayload.put("targetRevisionId", targetRevisionId);
        inputPayload.put("expectedOutputArtifactId", expectedOutputArtifactId);
        inputPayload.put("ifcStorageUrl", ifcStorageUrl);
        inputPayload.put("validationReportStorageUrl", validationReportStorageUrl);
        inputPayload.put("layoutImportSchemaVersion", layoutImportSchemaVersion);
        inputPayload.put("revisionNo", revisionNo);
        return inputPayload;
    }

    private record LayoutImportResolution(
            String inputSource,
            LayoutImportV2Payload payload
    ) {
    }
}
