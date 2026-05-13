package com.a204.batang.domain.ifcedit.service;

import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.dto.IfcEditStatusSseResponse;
import com.a204.batang.domain.ifcedit.dto.LlmIfcEditRequest;
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
public class TwoDLlmIfcEditCommandService {

    private final ProjectRepository projectRepository;
    private final RevisionRepository revisionRepository;
    private final ProjectAccessService projectAccessService;
    private final IfcEditJobRepository ifcEditJobRepository;
    private final IfcEditJobStepRepository ifcEditJobStepRepository;
    private final IfcEditStoragePathBuilder pathBuilder;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @Transactional
    public IfcEditJobResponse createTwoDLlmIfcEdit(UUID projectId, UUID userId, LlmIfcEditRequest request) {
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
        UUID expectedOutputArtifactId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        String idempotencyKey = jobId + ":step-1:two-d-llm";

        String sourceIfcUrl = pathBuilder.buildSourceIfcStorageUrl(projectId, request.baseRevisionId());
        String editPlanUrl = pathBuilder.buildTwoDPlannerOutputStorageUrl(projectId, jobId, 1);

        // step 1 inputPayload — step 2 생성 시 필요한 값 저장 (Revision은 step 1 완료 후 생성)
        Map<String, Object> inputMap = new LinkedHashMap<>();
        inputMap.put("sourceRevisionId", request.baseRevisionId().toString());
        inputMap.put("expectedOutputArtifactId", expectedOutputArtifactId.toString());
        inputMap.put("sourceIfcStorageUrl", sourceIfcUrl);
        inputMap.put("editPlanStorageUrl", editPlanUrl);
        JsonNode inputPayload = objectMapper.valueToTree(inputMap);

        // 2D LLM worker에 전달할 payload
        Map<String, Object> payloadMap = new LinkedHashMap<>();
        if (request.userInstruction() != null) payloadMap.put("user_instruction", request.userInstruction());
        if (request.sourceSceneStorageUrl() != null) payloadMap.put("source_scene_storage_url", request.sourceSceneStorageUrl());
        if (request.sourceScene() != null) payloadMap.put("source_scene", request.sourceScene());
        if (request.conversationHistory() != null) payloadMap.put("conversation_history", request.conversationHistory());
        if (request.plannerOptions() != null) payloadMap.put("planner_options", request.plannerOptions());
        JsonNode requestPayload = objectMapper.valueToTree(payloadMap);

        LocalDateTime now = LocalDateTime.now();
        // Revision 없음 — TWO_D_LLM step 1 완료 시점에 생성
        IfcEditJob job = IfcEditJob.createQueued(
                jobId, projectId, currentUserId,
                request.sourceSceneStateId(), request.baseRevisionId(),
                request.sourceSceneType(), JOB_TYPE_TWO_D_TO_IFC_EDIT, requestPayload, now
        );
        IfcEditJobStep step = IfcEditJobStep.createQueued(
                jobStepId, jobId, 1,
                WORKER_TYPE_TWO_D_LLM, RabbitMqConfig.TWO_D_LLM_COMMAND_ROUTING_KEY,
                idempotencyKey, inputPayload, now
        );

        ifcEditJobRepository.save(job);
        ifcEditJobStepRepository.save(step);

        IfcEditCommandMessage cmd = new IfcEditCommandMessage(
                UUID.randomUUID(), MESSAGE_SCHEMA_VERSION, MESSAGE_TYPE_COMMAND,
                COMMAND_TYPE_TWO_D_LLM_GENERATE, RabbitMqConfig.TWO_D_LLM_COMMAND_ROUTING_KEY,
                jobId, jobStepId, 1, TOTAL_STEPS_LLM, projectId, currentUserId,
                request.baseRevisionId(), request.sourceSceneStateId(), request.sourceSceneType(),
                null, expectedOutputArtifactId,
                Map.of("source_ifc_storage_url", sourceIfcUrl),
                new IfcEditCommandMessage.ExpectedOutput(null, null, editPlanUrl, null),
                requestPayload, ATTEMPT_NO, MAX_ATTEMPTS, idempotencyKey, correlationId,
                OffsetDateTime.now(ZoneOffset.UTC)
        );

        log.info("2D LLM IFC Edit 작업을 예약합니다. projectId={}, jobId={}, jobStepId={}, jobType={}",
                projectId, jobId, jobStepId, JOB_TYPE_TWO_D_TO_IFC_EDIT);
        log.info("2D LLM command 발행을 예약합니다. routingKey={}, correlationId={}",
                RabbitMqConfig.TWO_D_LLM_COMMAND_ROUTING_KEY, correlationId);

        eventPublisher.publishEvent(new IfcEditCommandPublishRequestedEvent(cmd));
        eventPublisher.publishEvent(new IfcEditStatusChangedEvent(
                projectId, SSE_IFC_EDIT_QUEUED,
                new IfcEditStatusSseResponse(
                        SSE_IFC_EDIT_QUEUED, projectId, jobId, jobStepId, null,
                        JOB_TYPE_TWO_D_TO_IFC_EDIT, "QUEUED", 0, null
                )
        ));

        return new IfcEditJobResponse(
                projectId, jobId, jobStepId, null, expectedOutputArtifactId,
                JOB_TYPE_TWO_D_TO_IFC_EDIT, "QUEUED", 0
        );
    }
}
