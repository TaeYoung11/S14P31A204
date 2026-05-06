package com.a204.batang.domain.ifcedit.service;

import com.a204.batang.domain.ifcedit.dto.DirectIfcEditRequest;
import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.dto.IfcEditStatusSseResponse;
import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditCommandPublishRequestedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditStatusChangedEvent;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
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

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class DirectIfcEditCommandService {

    private final ProjectRepository projectRepository;
    private final RevisionRepository revisionRepository;
    private final ProjectAccessService projectAccessService;
    private final IfcEditJobRepository ifcEditJobRepository;
    private final IfcEditJobStepRepository ifcEditJobStepRepository;
    private final IfcEditStoragePathBuilder pathBuilder;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @Transactional
    public IfcEditJobResponse createDirectIfcEdit(UUID projectId, UUID userId, DirectIfcEditRequest request) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = Optional.ofNullable(userId)
                .orElseGet(projectAccessService::resolveCurrentUserIdOrThrow);
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

        boolean hasActive = ifcEditJobRepository.existsByProjectIdAndJobTypeInAndStatusIn(
                projectId,
                List.of(JOB_TYPE_IFC_EDIT, JOB_TYPE_TWO_D_TO_IFC_EDIT, JOB_TYPE_THREE_D_TO_IFC_EDIT),
                List.of("QUEUED", "RUNNING")
        );
        if (hasActive) {
            throw new CustomException(ErrorCode.IFC_EDIT_JOB_CONFLICT);
        }

        revisionRepository.findById(request.baseRevisionId())
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND));

        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID targetRevisionId = UUID.randomUUID();
        UUID expectedOutputArtifactId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        String idempotencyKey = jobId + ":step-1:ifc-edit-apply";

        int nextRevisionNo = revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId)
                .map(r -> r.getRevisionNo() + 1)
                .orElse(1);

        String sourceIfcUrl = pathBuilder.buildSourceIfcStorageUrl(projectId, request.baseRevisionId());
        String outputIfcUrl = pathBuilder.buildOutputIfcStorageUrl(projectId, targetRevisionId);
        String validationUrl = pathBuilder.buildValidationReportStorageUrl(jobId, 1);
        String sceneSnapshotUrl = pathBuilder.buildSceneSnapshotStorageUrl(projectId, targetRevisionId);

        Map<String, Object> inputMap = new LinkedHashMap<>();
        inputMap.put("sourceRevisionId", request.baseRevisionId().toString());
        inputMap.put("targetRevisionId", targetRevisionId.toString());
        inputMap.put("expectedOutputArtifactId", expectedOutputArtifactId.toString());
        inputMap.put("sourceIfcStorageUrl", sourceIfcUrl);
        inputMap.put("ifcStorageUrl", outputIfcUrl);
        inputMap.put("validationReportStorageUrl", validationUrl);
        inputMap.put("sceneSnapshotStorageUrl", sceneSnapshotUrl);
        inputMap.put("revisionNo", nextRevisionNo);
        JsonNode inputPayload = objectMapper.valueToTree(inputMap);

        Map<String, Object> payloadMap = new LinkedHashMap<>();
        payloadMap.put("engine_request", request.engineRequest());
        JsonNode requestPayload = objectMapper.valueToTree(payloadMap);

        LocalDateTime now = LocalDateTime.now();
        Revision revision = Revision.createCreating(
                targetRevisionId, projectId, project.getLatestRevisionId(),
                nextRevisionNo, currentUserId, null, null, now
        );
        IfcEditJob job = IfcEditJob.createQueued(
                jobId, projectId, currentUserId,
                request.sourceSceneStateId(), request.baseRevisionId(),
                request.sourceSceneType(), JOB_TYPE_IFC_EDIT, requestPayload, now
        );
        IfcEditJobStep step = IfcEditJobStep.createQueued(
                jobStepId, jobId, 1,
                WORKER_TYPE_IFC_EDIT_APPLY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY,
                idempotencyKey, inputPayload, now
        );

        revisionRepository.save(revision);
        ifcEditJobRepository.save(job);
        ifcEditJobStepRepository.save(step);

        IfcEditCommandMessage cmd = new IfcEditCommandMessage(
                UUID.randomUUID(), MESSAGE_SCHEMA_VERSION, MESSAGE_TYPE_COMMAND,
                COMMAND_TYPE_IFC_EDIT_APPLY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY,
                jobId, jobStepId, 1, TOTAL_STEPS_DIRECT, projectId, currentUserId,
                request.baseRevisionId(), request.sourceSceneStateId(), request.sourceSceneType(),
                targetRevisionId, expectedOutputArtifactId,
                Map.of("source_ifc_storage_url", sourceIfcUrl),
                new IfcEditCommandMessage.ExpectedOutput(outputIfcUrl, validationUrl, null),
                requestPayload, ATTEMPT_NO, MAX_ATTEMPTS, idempotencyKey, correlationId,
                OffsetDateTime.now(ZoneOffset.UTC)
        );

        log.info("IFC Edit 작업을 예약합니다. projectId={}, jobId={}, jobStepId={}, targetRevisionId={}, jobType={}",
                projectId, jobId, jobStepId, targetRevisionId, JOB_TYPE_IFC_EDIT);
        log.info("IFC Edit command 발행을 예약합니다. routingKey={}, correlationId={}",
                RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY, correlationId);

        eventPublisher.publishEvent(new IfcEditCommandPublishRequestedEvent(cmd));
        eventPublisher.publishEvent(new IfcEditStatusChangedEvent(
                projectId,
                SSE_IFC_EDIT_QUEUED,
                new IfcEditStatusSseResponse(
                        SSE_IFC_EDIT_QUEUED, projectId, jobId, jobStepId, targetRevisionId,
                        JOB_TYPE_IFC_EDIT, "QUEUED", 0, null
                )
        ));

        return new IfcEditJobResponse(
                projectId, jobId, jobStepId, targetRevisionId, expectedOutputArtifactId,
                JOB_TYPE_IFC_EDIT, "QUEUED", 0
        );
    }
}
