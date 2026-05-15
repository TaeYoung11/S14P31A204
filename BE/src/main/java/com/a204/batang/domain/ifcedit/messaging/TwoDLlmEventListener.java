package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.dto.IfcEditStatusSseResponse;
import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditEventMessage;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditWorkerError;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditCommandPublishRequestedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditStatusChangedEvent;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.a204.batang.domain.ifcedit.service.IfcEditStoragePathBuilder;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.*;

@Slf4j
@Component
@RequiredArgsConstructor
public class TwoDLlmEventListener {

    private final IfcEditJobRepository ifcEditJobRepository;
    private final IfcEditJobStepRepository ifcEditJobStepRepository;
    private final RevisionRepository revisionRepository;
    private final IfcEditStoragePathBuilder pathBuilder;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    public void handle(IfcEditEventMessage event) {
        if (event == null || event.eventType() == null) {
            throw new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID);
        }

        log.info("2D LLM worker 이벤트를 수신했습니다. eventType={}, projectId={}, jobId={}, jobStepId={}",
                event.eventType(), event.projectId(), event.jobId(), event.jobStepId());

        switch (event.eventType()) {
            case EVENT_TWO_D_LLM_STARTED -> handleStarted(event);
            case EVENT_TWO_D_LLM_PROGRESS -> handleProgress(event);
            case EVENT_TWO_D_LLM_COMPLETED -> handleCompleted(event);
            case EVENT_TWO_D_LLM_FAILED -> handleFailed(event);
            case EVENT_TWO_D_LLM_CLARIFICATION_REQUIRED -> handleClarificationRequired(event);
            default -> {
            }
        }
    }

    @Transactional
    @RabbitListener(queues = RabbitMqConfig.TWO_D_LLM_DLQ)
    public void consumeDlq(Message message) {
        IfcEditCommandMessage commandMessage;
        try {
            commandMessage = objectMapper.readValue(message.getBody(), IfcEditCommandMessage.class);
        } catch (Exception exception) {
            log.error("2D LLM DLQ message parse failed. headers={}", message.getMessageProperties().getHeaders(), exception);
            return;
        }

        if (commandMessage.jobId() == null || commandMessage.jobStepId() == null) {
            log.error("2D LLM DLQ message missing identifiers. jobId={}, jobStepId={}",
                    commandMessage.jobId(), commandMessage.jobStepId());
            return;
        }

        IfcEditJob job = ifcEditJobRepository.findByJobIdAndJobType(
                commandMessage.jobId(), JOB_TYPE_TWO_D_TO_IFC_EDIT
        ).orElse(null);
        IfcEditJobStep step = ifcEditJobStepRepository.findByJobStepIdAndJobId(
                commandMessage.jobStepId(), commandMessage.jobId()
        ).orElse(null);

        if (job == null || step == null) {
            log.warn("2D LLM DLQ message ignored because job state not found. jobId={}, jobStepId={}",
                    commandMessage.jobId(), commandMessage.jobStepId());
            return;
        }
        if (job.isTerminal() || step.isTerminal()) {
            log.info("2D LLM DLQ message ignored because state is already terminal. jobId={}, jobStepId={}",
                    commandMessage.jobId(), commandMessage.jobStepId());
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        String failureMessage = ErrorCode.IFC_EDIT_COMMAND_DLQ.getMessage();
        JsonNode outputPayload = buildDlqPayload(RabbitMqConfig.TWO_D_LLM_DLQ);
        step.markFailed(ErrorCode.IFC_EDIT_COMMAND_DLQ.getCode(), failureMessage, outputPayload, now);
        job.markFailed(failureMessage, outputPayload, now);
        ifcEditJobStepRepository.save(step);
        ifcEditJobRepository.save(job);

        log.warn("2D LLM DLQ message marked job failed. projectId={}, jobId={}, jobStepId={}",
                job.getProjectId(), job.getJobId(), step.getJobStepId());

        publishStatusEvent(job.getProjectId(), SSE_IFC_EDIT_FAILED, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_FAILED,
                job.getProjectId(),
                job.getJobId(),
                step.getJobStepId(),
                null,
                job.getJobType(),
                "FAILED",
                0,
                failureMessage
        ));
    }

    private void handleStarted(IfcEditEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        IfcEditJob job = findJob(event);
        IfcEditJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info("2D LLM started 이벤트를 무시합니다. jobId={}, reason=terminal-state", event.jobId());
            return;
        }

        job.markRunning(now);
        step.markRunning(now);
        Integer progress = resolveProgress(event.progress(), 1);
        job.updateProgress(progress);
        step.updateProgress(progress);

        publishStatusEvent(event.projectId(), SSE_IFC_EDIT_STARTED, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_STARTED, event.projectId(), event.jobId(), event.jobStepId(),
                null, job.getJobType(), "RUNNING", progress, "2D LLM 작업이 시작되었습니다."
        ));
    }

    private void handleProgress(IfcEditEventMessage event) {
        IfcEditJob job = findJob(event);
        IfcEditJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info("2D LLM progress 이벤트를 무시합니다. jobId={}, reason=terminal-state", event.jobId());
            return;
        }

        Integer progress = resolveProgress(event.progress(), 0);
        job.updateProgress(progress);
        step.updateProgress(progress);

        publishStatusEvent(event.projectId(), SSE_IFC_EDIT_PROGRESS, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_PROGRESS, event.projectId(), event.jobId(), event.jobStepId(),
                null, job.getJobType(), "RUNNING", progress, "2D LLM 작업이 진행 중입니다."
        ));
    }

    private void handleCompleted(IfcEditEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        IfcEditJob job = ifcEditJobRepository.findByJobIdAndJobType(event.jobId(), JOB_TYPE_TWO_D_TO_IFC_EDIT)
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_JOB_NOT_FOUND));
        IfcEditJobStep step1 = ifcEditJobStepRepository.findByJobIdAndStepNo(event.jobId(), 1)
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_STEP_NOT_FOUND));

        if (job.isTerminal() || step1.isTerminal()) {
            log.info("2D LLM completed 이벤트를 무시합니다. jobId={}, reason=terminal-state", event.jobId());
            return;
        }

        String commandJsonStorageUrl = extractRequiredString(event.output(), "storage_url");

        String sourceIfcUrl = extractJsonText(step1.getInputPayload(), "sourceIfcStorageUrl");
        String sourceRevisionIdStr = extractJsonText(step1.getInputPayload(), "sourceRevisionId");
        UUID sourceRevisionId = UUID.fromString(sourceRevisionIdStr);

        Map<String, Object> step1OutputMap = new LinkedHashMap<>();
        step1OutputMap.put("editPlanStorageUrl", commandJsonStorageUrl);
        if (event.workerId() != null) {
            step1OutputMap.put("workerId", event.workerId());
        }
        step1.markSucceeded(objectMapper.valueToTree(step1OutputMap), now);

        UUID step2Id = UUID.randomUUID();
        UUID targetRevisionId = UUID.randomUUID();
        UUID outputArtifactId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        String idempotencyKey2 = job.getJobId() + ":step-2:ifc-edit-apply";

        int nextRevisionNo = revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(event.projectId())
                .map(r -> r.getRevisionNo() + 1)
                .orElse(1);
        String outputIfcUrl = pathBuilder.buildOutputIfcStorageUrl(event.projectId(), targetRevisionId);
        String validationUrl = pathBuilder.buildValidationReportStorageUrl(event.projectId(), job.getJobId(), 2);
        String sceneSnapshotUrl = pathBuilder.buildSceneSnapshotStorageUrl(event.projectId(), targetRevisionId, job.getSourceSceneType());

        Revision revision = Revision.createCreating(
                targetRevisionId, event.projectId(), sourceRevisionId,
                nextRevisionNo, job.getRequestedBy(), null, null, now
        );

        Map<String, Object> step2InputMap = new LinkedHashMap<>();
        step2InputMap.put("sourceRevisionId", sourceRevisionIdStr);
        step2InputMap.put("targetRevisionId", targetRevisionId.toString());
        step2InputMap.put("expectedOutputArtifactId", outputArtifactId.toString());
        step2InputMap.put("sourceIfcStorageUrl", sourceIfcUrl);
        step2InputMap.put("commandJsonStorageUrl", commandJsonStorageUrl);
        step2InputMap.put("ifcStorageUrl", outputIfcUrl);
        step2InputMap.put("validationReportStorageUrl", validationUrl);
        step2InputMap.put("sceneSnapshotStorageUrl", sceneSnapshotUrl);
        step2InputMap.put("revisionNo", nextRevisionNo);
        IfcEditJobStep step2 = IfcEditJobStep.createQueued(
                step2Id, job.getJobId(), 2,
                WORKER_TYPE_IFC_EDIT_APPLY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY,
                idempotencyKey2, objectMapper.valueToTree(step2InputMap), now
        );

        revisionRepository.save(revision);
        ifcEditJobStepRepository.save(step2);

        Map<String, Object> payloadMap = new LinkedHashMap<>();
        payloadMap.put("commandJsonStorageUrl", commandJsonStorageUrl);
        IfcEditCommandMessage cmd = new IfcEditCommandMessage(
                UUID.randomUUID(), MESSAGE_SCHEMA_VERSION, MESSAGE_TYPE_COMMAND,
                COMMAND_TYPE_IFC_EDIT_APPLY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY,
                job.getJobId(), step2Id, 2, TOTAL_STEPS_LLM,
                event.projectId(), job.getRequestedBy(),
                sourceRevisionId, job.getSourceSceneStateId(), job.getSourceSceneType(),
                targetRevisionId, outputArtifactId,
                Map.of("source_ifc_storage_url", sourceIfcUrl),
                new IfcEditCommandMessage.ExpectedOutput(outputIfcUrl, validationUrl, null, null),
                objectMapper.valueToTree(payloadMap), ATTEMPT_NO, MAX_ATTEMPTS,
                idempotencyKey2, correlationId, OffsetDateTime.now(ZoneOffset.UTC)
        );

        log.info("2D LLM completed 후 IFC Edit step 2를 생성했습니다. jobId={}, step2Id={}, targetRevisionId={}",
                job.getJobId(), step2Id, targetRevisionId);

        eventPublisher.publishEvent(new IfcEditCommandPublishRequestedEvent(cmd));
        publishStatusEvent(event.projectId(), SSE_IFC_EDIT_STARTED, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_STARTED, event.projectId(), job.getJobId(), step2Id, targetRevisionId,
                job.getJobType(), "RUNNING", 50, "LLM 처리가 완료되어 IFC 편집을 진행합니다."
        ));
    }

    private void handleClarificationRequired(IfcEditEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        IfcEditJob job = ifcEditJobRepository.findByJobIdAndJobType(event.jobId(), JOB_TYPE_TWO_D_TO_IFC_EDIT)
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_JOB_NOT_FOUND));
        IfcEditJobStep step1 = ifcEditJobStepRepository.findByJobIdAndStepNo(event.jobId(), 1)
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_STEP_NOT_FOUND));

        if (job.isTerminal() || step1.isTerminal()) {
            log.info("2D LLM clarification 이벤트를 무시합니다. jobId={}, reason=terminal-state", event.jobId());
            return;
        }

        String errorMessage = event.error() != null && event.error().message() != null
                ? event.error().message() : "추가 정보가 필요합니다.";
        String detailStorageUrl = event.error() != null ? event.error().detailStorageUrl() : null;

        com.fasterxml.jackson.databind.node.ObjectNode outputPayload = objectMapper.createObjectNode();
        outputPayload.put("eventType", event.eventType());
        outputPayload.put("errorCode", "CLARIFICATION_REQUIRED");
        outputPayload.put("errorMessage", errorMessage);
        outputPayload.put("clarificationPossible", true);
        if (detailStorageUrl != null) outputPayload.put("detailStorageUrl", detailStorageUrl);

        step1.markFailed("CLARIFICATION_REQUIRED", errorMessage, outputPayload, now);
        job.markFailed(errorMessage, outputPayload, now);

        log.info("2D LLM clarification 이벤트를 반영했습니다. jobId={}, detailStorageUrl={}", event.jobId(), detailStorageUrl);

        publishStatusEvent(event.projectId(), SSE_IFC_EDIT_FAILED, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_FAILED, event.projectId(), event.jobId(), event.jobStepId(),
                null, job.getJobType(), "FAILED", 0, errorMessage
        ));
    }

    private void handleFailed(IfcEditEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        IfcEditJob job = ifcEditJobRepository.findByJobIdAndJobType(event.jobId(), JOB_TYPE_TWO_D_TO_IFC_EDIT)
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_JOB_NOT_FOUND));
        IfcEditJobStep step1 = ifcEditJobStepRepository.findByJobIdAndStepNo(event.jobId(), 1)
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_STEP_NOT_FOUND));

        if (job.isTerminal() || step1.isTerminal()) {
            log.info("2D LLM failed 이벤트를 무시합니다. jobId={}, reason=terminal-state", event.jobId());
            return;
        }

        String errorCode = event.error() != null && event.error().code() != null
                ? event.error().code() : "TWO_D_LLM_FAILED";
        String errorMessage = event.error() != null && event.error().message() != null
                ? event.error().message() : "2D LLM 작업이 실패했습니다.";

        JsonNode outputPayload = buildFailedPayload(event);
        step1.markFailed(errorCode, errorMessage, outputPayload, now);
        job.markFailed(errorMessage, outputPayload, now);

        log.warn("2D LLM failed 이벤트를 반영했습니다. errorCode={}", errorCode);

        publishStatusEvent(event.projectId(), SSE_IFC_EDIT_FAILED, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_FAILED, event.projectId(), event.jobId(), event.jobStepId(),
                null, job.getJobType(), "FAILED", 0, errorMessage
        ));
    }

    private IfcEditJob findJob(IfcEditEventMessage event) {
        return ifcEditJobRepository.findByJobIdAndJobType(event.jobId(), JOB_TYPE_TWO_D_TO_IFC_EDIT)
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_JOB_NOT_FOUND));
    }

    private IfcEditJobStep findStep(IfcEditEventMessage event) {
        return ifcEditJobStepRepository.findByJobStepIdAndJobId(event.jobStepId(), event.jobId())
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_STEP_NOT_FOUND));
    }

    private void publishStatusEvent(UUID projectId, String eventName, IfcEditStatusSseResponse payload) {
        eventPublisher.publishEvent(new IfcEditStatusChangedEvent(projectId, eventName, payload));
    }

    private Integer resolveProgress(Double progress, Integer fallback) {
        if (progress == null) {
            return fallback;
        }
        int resolved = (int) Math.round(progress * 100);
        return Math.max(0, Math.min(resolved, 100));
    }

    private String extractRequiredString(Map<String, Object> output, String key) {
        String value = extractString(output, key);
        if (value == null || value.isBlank()) {
            throw new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID);
        }
        return value;
    }

    private String extractString(Map<String, Object> output, String key) {
        if (output == null || !output.containsKey(key) || output.get(key) == null) {
            return null;
        }
        return String.valueOf(output.get(key));
    }

    private String extractJsonText(JsonNode node, String key) {
        if (node == null) {
            return null;
        }
        JsonNode value = node.get(key);
        if (value == null || value.isNull()) {
            return null;
        }
        return value.asText();
    }

    private JsonNode buildFailedPayload(IfcEditEventMessage event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", event.eventType());
        IfcEditWorkerError error = event.error();
        if (error != null) {
            payload.put("errorCode", error.code());
            payload.put("errorMessage", error.message());
            payload.put("retryable", error.retryable());
            payload.put("clarificationPossible", error.clarificationPossible());
            payload.put("detailStorageUrl", error.detailStorageUrl());
        }
        return objectMapper.valueToTree(payload);
    }

    private JsonNode buildDlqPayload(String deadLetterQueue) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", "DLQ_FAILED");
        payload.put("errorCode", ErrorCode.IFC_EDIT_COMMAND_DLQ.getCode());
        payload.put("errorMessage", ErrorCode.IFC_EDIT_COMMAND_DLQ.getMessage());
        payload.put("deadLetterQueue", deadLetterQueue);
        return objectMapper.valueToTree(payload);
    }
}
