package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.dto.IfcEditStatusSseResponse;
import com.a204.batang.domain.ifcedit.entity.IfcEditArtifact;
import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import com.a204.batang.domain.ifcedit.entity.RevisionSceneState;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditEventMessage;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditWorkerError;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditCommandPublishRequestedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditPublishFailedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditStatusChangedEvent;
import com.a204.batang.domain.ifcedit.repository.IfcEditArtifactRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.a204.batang.domain.ifcedit.repository.RevisionSceneStateRepository;
import com.a204.batang.domain.notification.service.NotificationSseService;
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
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.*;

@Slf4j
@Component
@RequiredArgsConstructor
public class IfcEditApplyEventListener {

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;
    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final RevisionRepository revisionRepository;
    private final IfcEditJobRepository ifcEditJobRepository;
    private final IfcEditJobStepRepository ifcEditJobStepRepository;
    private final IfcEditArtifactRepository ifcEditArtifactRepository;
    private final RevisionSceneStateRepository revisionSceneStateRepository;
    private final NotificationSseService notificationSseService;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @RabbitListener(queues = RabbitMqConfig.BE_JOB_EVENTS_QUEUE)
    @Transactional
    public void handle(IfcEditEventMessage event) {
        if (event == null || event.eventType() == null) {
            throw new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID);
        }

        if (!event.eventType().startsWith(EVENT_PREFIX_IFC_EDIT_APPLY)) {
            return;
        }

        log.info("IFC Edit worker 이벤트를 수신했습니다. eventType={}, projectId={}, jobId={}, jobStepId={}",
                event.eventType(), event.projectId(), event.jobId(), event.jobStepId());

        switch (event.eventType()) {
            case EVENT_IFC_EDIT_APPLY_STARTED -> handleStarted(event);
            case EVENT_IFC_EDIT_APPLY_PROGRESS -> handleProgress(event);
            case EVENT_IFC_EDIT_APPLY_COMPLETED -> handleCompleted(event);
            case EVENT_IFC_EDIT_APPLY_FAILED -> handleFailed(event);
            default -> {
            }
        }
    }

    @Async("ifcEditPublishFailureExecutor")
    @EventListener
    @Transactional
    public void handlePublishFailed(IfcEditPublishFailedEvent event) {
        IfcEditCommandMessage message = event.message();
        log.warn(
                "IFC Edit command publish 실패 이벤트를 처리합니다. projectId={}, jobId={}, jobStepId={}, returned={}, attemptNo={}, maxAttempts={}, cause={}",
                message.projectId(), message.jobId(), message.jobStepId(),
                event.returned(), message.attemptNo(), message.maxAttempts(), event.cause()
        );

        IfcEditJob job = ifcEditJobRepository.findByJobId(message.jobId()).orElse(null);
        if (job == null) {
            return;
        }

        IfcEditJobStep step = ifcEditJobStepRepository.findByJobStepIdAndJobId(message.jobStepId(), message.jobId()).orElse(null);
        Revision revision = message.targetRevisionId() != null
                ? revisionRepository.findById(message.targetRevisionId()).orElse(null)
                : null;

        if (step == null || job.isTerminal() || step.isTerminal()) {
            log.info("IFC Edit publish failure를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=missing-state-or-terminal",
                    message.projectId(), message.jobId(), message.jobStepId());
            return;
        }

        if (!event.returned() && message.attemptNo() < message.maxAttempts()) {
            log.info("IFC Edit command NACK 재시도를 수행합니다. projectId={}, jobId={}, nextAttempt={}, maxAttempts={}",
                    message.projectId(), message.jobId(), message.attemptNo() + 1, message.maxAttempts());

            IfcEditCommandMessage retry = new IfcEditCommandMessage(
                    message.messageId(), message.schemaVersion(), message.messageType(),
                    message.commandType(), message.routingKey(),
                    message.jobId(), message.jobStepId(), message.stepNo(), message.totalSteps(),
                    message.projectId(), message.requestedBy(),
                    message.sourceRevisionId(), message.sourceSceneStateId(), message.sourceSceneType(),
                    message.targetRevisionId(), message.expectedOutputArtifactId(),
                    message.input(), message.expectedOutput(), message.payload(),
                    message.attemptNo() + 1, message.maxAttempts(),
                    message.idempotencyKey(), message.correlationId(), message.createdAt()
            );
            eventPublisher.publishEvent(new IfcEditCommandPublishRequestedEvent(retry));
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        String errorCode = event.returned()
                ? ErrorCode.IFC_EDIT_COMMAND_RETURNED.getCode()
                : ErrorCode.IFC_EDIT_COMMAND_CONFIRM_NACK.getCode();
        String errorMessage = event.returned()
                ? "메시지가 큐로 라우팅되지 않아 작업이 중단되었습니다."
                : "메시지 발행 실패로 작업이 중단되었습니다.";
        JsonNode outputPayload = objectMapper.valueToTree(buildPublishFailedPayload(event));

        step.markFailed(errorCode, errorMessage, outputPayload, now);
        job.markFailed(errorMessage, outputPayload, now);
        if (revision != null && !revision.isTerminal()) {
            revision.markFailed();
        }

        publishStatusEvent(message.projectId(), SSE_IFC_EDIT_FAILED, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_FAILED, message.projectId(), message.jobId(), message.jobStepId(),
                message.targetRevisionId(), job.getJobType(), "FAILED", 0, errorMessage
        ));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleIfcEditStatusChanged(IfcEditStatusChangedEvent event) {
        try {
            Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(event.projectId()).orElse(null);
            if (project == null) {
                return;
            }
            Set<UUID> targetUserIds = projectAccessService.resolveProjectMemberUserIds(project);
            notificationSseService.sendToUsers(targetUserIds, event.eventName(), event.payload());
        } catch (Exception e) {
            log.warn("IFC Edit SSE 전송에 실패했습니다. projectId={}, eventName={}", event.projectId(), event.eventName(), e);
        }
    }

    private void handleStarted(IfcEditEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        IfcEditJob job = findJob(event);
        IfcEditJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info("IFC Edit started 이벤트를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=terminal-state",
                    event.projectId(), event.jobId(), event.jobStepId());
            return;
        }

        job.markRunning(now);
        step.markRunning(now);
        Integer progress = resolveProgress(event.progress(), 1);
        job.updateProgress(progress);
        step.updateProgress(progress);

        publishStatusEvent(event.projectId(), SSE_IFC_EDIT_STARTED, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_STARTED, event.projectId(), event.jobId(), event.jobStepId(),
                event.targetRevisionId(), job.getJobType(), "RUNNING", progress, "IFC 편집 작업이 시작되었습니다."
        ));
    }

    private void handleProgress(IfcEditEventMessage event) {
        IfcEditJob job = findJob(event);
        IfcEditJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info("IFC Edit progress 이벤트를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=terminal-state",
                    event.projectId(), event.jobId(), event.jobStepId());
            return;
        }

        Integer progress = resolveProgress(event.progress(), 0);
        job.updateProgress(progress);
        step.updateProgress(progress);

        publishStatusEvent(event.projectId(), SSE_IFC_EDIT_PROGRESS, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_PROGRESS, event.projectId(), event.jobId(), event.jobStepId(),
                event.targetRevisionId(), job.getJobType(), "RUNNING", progress, "IFC 편집 작업이 진행 중입니다."
        ));
    }

    private void handleCompleted(IfcEditEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        // findByJobId: 타입 필터 없음 — IFC_EDIT / TWO_D_TO_IFC_EDIT / THREE_D_TO_IFC_EDIT 모두 처리
        IfcEditJob job = findJob(event);
        IfcEditJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info("IFC Edit completed 이벤트를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=terminal-state",
                    event.projectId(), event.jobId(), event.jobStepId());
            return;
        }

        Revision revision = findRevision(event.targetRevisionId());
        validateCompletionIds(event, revision, job, step);

        String ifcUrl = extractRequiredString(event.output(), "storage_url");
        String validationUrl = extractString(event.output(), "validation_report_storage_url");
        // sceneSnapshotStorageUrl은 이벤트 스키마에 없으므로 inputPayload에서 회수
        String sceneSnapshotUrl = extractJsonText(step.getInputPayload(), "sceneSnapshotStorageUrl");

        JsonNode outputPayload = objectMapper.valueToTree(buildCompletedPayload(event, ifcUrl, validationUrl));
        step.markSucceeded(outputPayload, now);
        job.markSucceeded(outputPayload, now);
        revision.markSucceeded();

        if (ifcEditArtifactRepository.findByArtifactId(event.outputArtifactId()).isEmpty()) {
            ifcEditArtifactRepository.save(IfcEditArtifact.createIfcModel(
                    event.outputArtifactId(), event.projectId(), revision.getRevisionId(), event.jobId(), ifcUrl, now
            ));
        }

        if (validationUrl != null && !validationUrl.isBlank()
                && !ifcEditArtifactRepository.existsByProjectIdAndJobIdAndArtifactType(
                event.projectId(), event.jobId(), ARTIFACT_TYPE_VALIDATION_REPORT)) {
            ifcEditArtifactRepository.save(IfcEditArtifact.createValidationReport(
                    UUID.randomUUID(), event.projectId(), revision.getRevisionId(), event.jobId(), validationUrl, now
            ));
        }

        if (sceneSnapshotUrl != null && !sceneSnapshotUrl.isBlank()) {
            revisionSceneStateRepository.save(RevisionSceneState.createIfcModel(
                    UUID.randomUUID(), revision.getRevisionId(), event.projectId(), sceneSnapshotUrl, now
            ));
        }

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(event.projectId())
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(event.projectId())
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID));

        project.updateLatestRevisionId(revision.getRevisionId());
        workspace.updateIfcOutput(ifcUrl, revision.getRevisionId());

        log.info("IFC Edit completed 이벤트를 반영했습니다. targetRevisionId={}, outputArtifactId={}",
                revision.getRevisionId(), event.outputArtifactId());

        publishStatusEvent(event.projectId(), SSE_IFC_EDIT_COMPLETED, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_COMPLETED, event.projectId(), event.jobId(), event.jobStepId(),
                revision.getRevisionId(), job.getJobType(), "SUCCEEDED", 100, "IFC 편집 작업이 완료되었습니다."
        ));
    }

    private void handleFailed(IfcEditEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        IfcEditJob job = findJob(event);
        IfcEditJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info("IFC Edit failed 이벤트를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=terminal-state",
                    event.projectId(), event.jobId(), event.jobStepId());
            return;
        }

        Revision revision = findRevision(event.targetRevisionId());
        JsonNode outputPayload = objectMapper.valueToTree(buildFailedPayload(event));

        String errorCode = event.error() != null && event.error().code() != null
                ? event.error().code() : "IFC_EDIT_APPLY_FAILED";
        String errorMessage = event.error() != null && event.error().message() != null
                ? event.error().message() : "IFC 편집 작업이 실패했습니다.";

        step.markFailed(errorCode, errorMessage, outputPayload, now);
        job.markFailed(errorMessage, outputPayload, now);
        revision.markFailed();

        log.warn("IFC Edit failed 이벤트를 반영했습니다. errorCode={}", errorCode);

        publishStatusEvent(event.projectId(), SSE_IFC_EDIT_FAILED, new IfcEditStatusSseResponse(
                SSE_IFC_EDIT_FAILED, event.projectId(), event.jobId(), event.jobStepId(),
                revision.getRevisionId(), job.getJobType(), "FAILED", resolveProgress(event.progress(), 0), errorMessage
        ));
    }

    private IfcEditJob findJob(IfcEditEventMessage event) {
        return ifcEditJobRepository.findByJobId(event.jobId())
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_JOB_NOT_FOUND));
    }

    private IfcEditJobStep findStep(IfcEditEventMessage event) {
        return ifcEditJobStepRepository.findByJobStepIdAndJobId(event.jobStepId(), event.jobId())
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_STEP_NOT_FOUND));
    }

    private Revision findRevision(UUID targetRevisionId) {
        if (targetRevisionId == null) {
            throw new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID);
        }
        return revisionRepository.findById(targetRevisionId)
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_REVISION_NOT_FOUND));
    }

    private void validateCompletionIds(IfcEditEventMessage event, Revision revision, IfcEditJob job, IfcEditJobStep step) {
        if (event.outputArtifactId() == null) {
            throw new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID);
        }
        if (!revision.getProjectId().equals(event.projectId())) {
            throw new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID);
        }

        JsonNode inputPayload = step.getInputPayload();
        String expectedTargetRevisionId = extractJsonText(inputPayload, "targetRevisionId");
        String expectedArtifactId = extractJsonText(inputPayload, "expectedOutputArtifactId");

        if (expectedTargetRevisionId == null || !expectedTargetRevisionId.equals(revision.getRevisionId().toString())) {
            throw new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID);
        }
        if (expectedArtifactId == null || !expectedArtifactId.equals(event.outputArtifactId().toString())) {
            throw new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID);
        }
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

    private Map<String, Object> buildCompletedPayload(IfcEditEventMessage event, String ifcUrl, String validationUrl) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ifcStorageUrl", ifcUrl);
        if (validationUrl != null && !validationUrl.isBlank()) {
            payload.put("validationReportStorageUrl", validationUrl);
        }
        payload.put("workerId", event.workerId());
        payload.put("eventType", event.eventType());
        return payload;
    }

    private Map<String, Object> buildFailedPayload(IfcEditEventMessage event) {
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
        return payload;
    }

    private Map<String, Object> buildPublishFailedPayload(IfcEditPublishFailedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", "PUBLISH_FAILED");
        payload.put("failureType", event.returned() ? "RETURNED" : "NACK");
        payload.put("errorCode", event.returned()
                ? ErrorCode.IFC_EDIT_COMMAND_RETURNED.getCode()
                : ErrorCode.IFC_EDIT_COMMAND_CONFIRM_NACK.getCode());
        payload.put("errorMessage", event.cause());
        payload.put("returned", event.returned());
        payload.put("attemptNo", event.message().attemptNo());
        payload.put("maxAttempts", event.message().maxAttempts());
        return payload;
    }
}
