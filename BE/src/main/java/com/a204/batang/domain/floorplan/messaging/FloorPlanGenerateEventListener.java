package com.a204.batang.domain.floorplan.messaging;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
import com.a204.batang.domain.floorplan.dto.FloorPlanStatusSseResponse;
import com.a204.batang.domain.floorplan.entity.FloorPlanArtifact;
import com.a204.batang.domain.floorplan.entity.FloorPlanJob;
import com.a204.batang.domain.floorplan.entity.FloorPlanJobStep;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateEventMessage;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanWorkerError;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanCommandPublishRequestedEvent;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanPublishFailedEvent;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanStatusChangedEvent;
import com.a204.batang.domain.floorplan.repository.FloorPlanArtifactRepository;
import com.a204.batang.domain.floorplan.repository.FloorPlanJobRepository;
import com.a204.batang.domain.floorplan.repository.FloorPlanJobStepRepository;
import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.service.WorkspaceFloorPlanRealtimeService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

/**
 * IFC generate worker event와 publish failure를 floor-plan 상태 반영으로 연결한다.
 *
 * worker event 처리와 publish failure 처리를 한 클래스에 둔 이유는 job/job_step/revision의
 * 상태 전이 규칙을 한 곳에서 유지하기 위해서다. publish failure와 worker failed event는
 * 서로 독립 경로이며, 둘 중 하나가 먼저 terminal 상태를 만들면 나머지는 무시한다.
 *
 * SSE는 AFTER_COMMIT에서만 전송한다. DB 상태 반영이 끝나기 전에 성공 알림이 먼저 나가면
 * 운영자가 상태를 잘못 해석할 수 있기 때문이다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FloorPlanGenerateEventListener {

    private static final String EVENT_PREFIX = FloorPlanConstants.EVENT_PREFIX_IFC_GENERATE_FROM_BUBBLE;
    private static final String EVENT_PUBLISH_FAILED = "PUBLISH_FAILED";
    private static final String EVENT_STARTED = FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_STARTED;
    private static final String EVENT_PROGRESS = FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_PROGRESS;
    private static final String EVENT_COMPLETED = FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_COMPLETED;
    private static final String EVENT_FAILED = FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_FAILED;
    private static final String EVENT_CLARIFICATION_REQUIRED = "IFC_GENERATE_FROM_BUBBLE_CLARIFICATION_REQUIRED";

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;
    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final RevisionRepository revisionRepository;
    private final FloorPlanJobRepository floorPlanJobRepository;
    private final FloorPlanJobStepRepository floorPlanJobStepRepository;
    private final FloorPlanArtifactRepository floorPlanArtifactRepository;
    private final NotificationSseService notificationSseService;
    private final WorkspaceFloorPlanRealtimeService workspaceFloorPlanRealtimeService;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @Transactional
    public void handle(FloorPlanGenerateEventMessage event) {
        if (event == null || event.eventType() == null) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID);
        }

        if (!event.eventType().startsWith(EVENT_PREFIX)) {
            return;
        }

        log.info(
                "Floor-plan worker 이벤트를 수신했습니다. eventType={}, projectId={}, jobId={}, jobStepId={}, targetRevisionId={}, correlationId={}",
                event.eventType(),
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                event.targetRevisionId(),
                event.correlationId()
        );

        switch (event.eventType()) {
            case EVENT_STARTED -> handleStarted(event);
            case EVENT_PROGRESS -> handleProgress(event);
            case EVENT_COMPLETED -> handleCompleted(event);
            case EVENT_FAILED -> handleFailed(event);
            case EVENT_CLARIFICATION_REQUIRED -> handleClarificationRequired(event);
            default -> {
            }
        }
    }

    @Async("floorPlanPublishFailureExecutor")
    @EventListener
    @Transactional
    public void handlePublishFailed(FloorPlanPublishFailedEvent event) {
        FloorPlanGenerateCommandMessage message = event.message();
        log.warn(
                "Floor-plan command publish 실패 이벤트를 처리합니다. projectId={}, jobId={}, jobStepId={}, targetRevisionId={}, returned={}, attemptNo={}, maxAttempts={}, routingKey={}, cause={}",
                message.projectId(),
                message.jobId(),
                message.jobStepId(),
                message.targetRevisionId(),
                event.returned(),
                message.attemptNo(),
                message.maxAttempts(),
                message.routingKey(),
                event.cause()
        );

        FloorPlanJob job = floorPlanJobRepository.findByJobIdAndJobType(
                        message.jobId(),
                        FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE
                )
                .orElse(null);
        if (job == null) {
            return;
        }

        FloorPlanJobStep step = floorPlanJobStepRepository.findByJobStepIdAndJobId(message.jobStepId(), message.jobId())
                .orElse(null);
        Revision revision = revisionRepository.findByRevisionId(message.targetRevisionId()).orElse(null);

        if (step == null || revision == null || job.isTerminal() || step.isTerminal() || revision.isTerminal()) {
            log.info(
                    "Floor-plan publish failure를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=missing-state-or-terminal",
                    message.projectId(),
                    message.jobId(),
                    message.jobStepId()
            );
            return;
        }

        if (!event.returned() && message.attemptNo() < message.maxAttempts()) {
            log.info(
                    "Floor-plan command NACK 재시도를 수행합니다. projectId={}, jobId={}, jobStepId={}, nextAttempt={}, maxAttempts={}, routingKey={}",
                    message.projectId(),
                    message.jobId(),
                    message.jobStepId(),
                    message.attemptNo() + 1,
                    message.maxAttempts(),
                    message.routingKey()
            );

            eventPublisher.publishEvent(new FloorPlanCommandPublishRequestedEvent(new FloorPlanGenerateCommandMessage(
                    message.messageId(),
                    message.schemaVersion(),
                    message.messageType(),
                    message.commandType(),
                    message.routingKey(),
                    message.jobId(),
                    message.jobStepId(),
                    message.stepNo(),
                    message.totalSteps(),
                    message.projectId(),
                    message.requestedBy(),
                    message.sourceRevisionId(),
                    message.sourceSceneStateId(),
                    message.sourceSceneType(),
                    message.targetRevisionId(),
                    message.expectedOutputArtifactId(),
                    message.input(),
                    message.expectedOutput(),
                    message.payload(),
                    message.attemptNo() + 1,
                    message.maxAttempts(),
                    message.idempotencyKey(),
                    message.correlationId(),
                    message.createdAt()
            )));
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        String errorCode = event.returned()
                ? ErrorCode.FLOOR_PLAN_COMMAND_RETURNED.getCode()
                : ErrorCode.FLOOR_PLAN_COMMAND_CONFIRM_NACK.getCode();
        String errorMessage = event.returned()
                ? "메시지가 큐로 라우팅되지 않아 작업이 중단되었습니다."
                : "메시지 발행 실패로 작업이 중단되었습니다.";
        JsonNode outputPayload = objectMapper.valueToTree(buildPublishFailedPayload(event));

        step.markFailed(errorCode, errorMessage, outputPayload, now);
        job.markFailed(errorMessage, outputPayload, now);
        revision.markFailed();

        publishStatusEvent(message.projectId(), FloorPlanConstants.SSE_FLOOR_PLAN_FAILED, new FloorPlanStatusSseResponse(
                FloorPlanConstants.SSE_FLOOR_PLAN_FAILED,
                message.projectId(),
                message.jobId(),
                message.jobStepId(),
                message.targetRevisionId(),
                "FAILED",
                0,
                errorMessage
        ));
    }

    private void handleStarted(FloorPlanGenerateEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        FloorPlanJob job = findJob(event);
        FloorPlanJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info(
                    "Floor-plan started 이벤트를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=terminal-state",
                    event.projectId(),
                    event.jobId(),
                    event.jobStepId()
            );
            return;
        }

        job.markRunning(now);
        step.markRunning(now);

        Integer progress = resolveProgress(event.progress(), 1);
        job.updateProgress(progress);
        step.updateProgress(progress);

        log.info(
                "Floor-plan started 이벤트를 반영했습니다. projectId={}, jobId={}, jobStepId={}, targetRevisionId={}, progress={}",
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                event.targetRevisionId(),
                progress
        );

        publishStatusEvent(event.projectId(), FloorPlanConstants.SSE_FLOOR_PLAN_STARTED, new FloorPlanStatusSseResponse(
                FloorPlanConstants.SSE_FLOOR_PLAN_STARTED,
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                event.targetRevisionId(),
                "RUNNING",
                progress,
                "Floor-plan 생성 작업이 시작되었습니다."
        ));
    }

    private void handleProgress(FloorPlanGenerateEventMessage event) {
        FloorPlanJob job = findJob(event);
        FloorPlanJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info(
                    "Floor-plan progress 이벤트를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=terminal-state",
                    event.projectId(),
                    event.jobId(),
                    event.jobStepId()
            );
            return;
        }

        Integer progress = resolveProgress(event.progress(), 0);
        job.updateProgress(progress);
        step.updateProgress(progress);

        log.info(
                "Floor-plan progress 이벤트를 반영했습니다. projectId={}, jobId={}, jobStepId={}, targetRevisionId={}, progress={}",
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                event.targetRevisionId(),
                progress
        );

        publishStatusEvent(event.projectId(), FloorPlanConstants.SSE_FLOOR_PLAN_PROGRESS, new FloorPlanStatusSseResponse(
                FloorPlanConstants.SSE_FLOOR_PLAN_PROGRESS,
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                event.targetRevisionId(),
                "RUNNING",
                progress,
                "Floor-plan 생성 작업이 진행 중입니다."
        ));
    }

    private void handleCompleted(FloorPlanGenerateEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        FloorPlanJob job = findJob(event);
        FloorPlanJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info(
                    "Floor-plan completed 이벤트를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=terminal-state",
                    event.projectId(),
                    event.jobId(),
                    event.jobStepId()
            );
            return;
        }

        Revision revision = findRevision(event.targetRevisionId());
        // reserved revision/artifact id와 worker 결과를 대조하는 최종 방어선이다.
        // 여기서 mismatch를 놓치면 잘못된 결과를 다른 작업에 반영할 수 있다.
        validateCompletionIds(event, revision, job, step);

        String storageUrl = extractRequiredString(event.output(), "storage_url");
        String validationReportStorageUrl = extractString(event.output(), "validation_report_storage_url");

        JsonNode outputPayload = objectMapper.valueToTree(buildCompletedPayload(event, storageUrl, validationReportStorageUrl));
        step.markSucceeded(outputPayload, now);
        job.markSucceeded(outputPayload, now);
        revision.markSucceeded();

        if (floorPlanArtifactRepository.findByArtifactId(event.outputArtifactId()).isEmpty()) {
            floorPlanArtifactRepository.save(FloorPlanArtifact.createIfcModel(
                    event.outputArtifactId(),
                    event.projectId(),
                    revision.getRevisionId(),
                    event.jobId(),
                    "model.v1.ifc",
                    "application/octet-stream",
                    storageUrl,
                    objectMapper.valueToTree(Map.of(
                            "workerId", event.workerId(),
                            "eventType", event.eventType()
                    )),
                    now
            ));
        }

        if (validationReportStorageUrl != null
                && !validationReportStorageUrl.isBlank()
                && !floorPlanArtifactRepository.existsByProjectIdAndJobIdAndArtifactType(
                event.projectId(), event.jobId(), FloorPlanConstants.ARTIFACT_TYPE_VALIDATION_REPORT
        )) {
            floorPlanArtifactRepository.save(FloorPlanArtifact.createValidationReport(
                    UUID.randomUUID(),
                    event.projectId(),
                    revision.getRevisionId(),
                    event.jobId(),
                    "validation-report.v1.json",
                    "application/json",
                    validationReportStorageUrl,
                    objectMapper.valueToTree(Map.of(
                            "workerId", event.workerId(),
                            "eventType", event.eventType()
                    )),
                    now
            ));
        }

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(event.projectId())
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(event.projectId())
                .orElseThrow(() -> new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID, "workspace를 찾을 수 없습니다."));

        project.updateLatestRevisionId(revision.getRevisionId());
        workspace.updateIfcOutput(storageUrl, revision.getRevisionId());
        publishFloorPlanWebSocketSyncOnCompleted(event.projectId(), revision, storageUrl);

        log.info(
                "Floor-plan completed 이벤트를 반영했습니다. projectId={}, jobId={}, jobStepId={}, targetRevisionId={}, outputArtifactId={}, validationReportIncluded={}",
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                revision.getRevisionId(),
                event.outputArtifactId(),
                validationReportStorageUrl != null && !validationReportStorageUrl.isBlank()
        );

        publishStatusEvent(event.projectId(), FloorPlanConstants.SSE_FLOOR_PLAN_COMPLETED, new FloorPlanStatusSseResponse(
                FloorPlanConstants.SSE_FLOOR_PLAN_COMPLETED,
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                revision.getRevisionId(),
                "SUCCEEDED",
                100,
                "Floor-plan 생성 작업이 완료되었습니다."
        ));
    }

    private void publishFloorPlanWebSocketSyncOnCompleted(UUID projectId, Revision revision, String storageUrl) {
        try {
            workspaceFloorPlanRealtimeService.publishFloorPlanUpdatedFromGenerate(
                    projectId,
                    revision.getRevisionId(),
                    revision.getParentRevisionId(),
                    storageUrl
            );
        } catch (Exception exception) {
            log.warn("Floor-plan websocket sync broadcast from generate completion failed. projectId={}, revisionId={}",
                    projectId, revision.getRevisionId(), exception);
        }
    }

    private void handleFailed(FloorPlanGenerateEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        FloorPlanJob job = findJob(event);
        FloorPlanJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info(
                    "Floor-plan failed 이벤트를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=terminal-state",
                    event.projectId(),
                    event.jobId(),
                    event.jobStepId()
            );
            return;
        }

        Revision revision = findRevision(event.targetRevisionId());
        JsonNode outputPayload = objectMapper.valueToTree(buildFailedPayload(event, event.error(), event.eventType()));

        String errorCode = event.error() != null && event.error().code() != null
                ? event.error().code()
                : "IFC_GENERATE_FROM_BUBBLE_FAILED";
        String errorMessage = event.error() != null && event.error().message() != null
                ? event.error().message()
                : "Floor-plan 생성 작업이 실패했습니다.";

        step.markFailed(errorCode, errorMessage, outputPayload, now);
        job.markFailed(errorMessage, outputPayload, now);
        revision.markFailed();

        log.warn(
                "Floor-plan failed 이벤트를 반영했습니다. projectId={}, jobId={}, jobStepId={}, targetRevisionId={}, errorCode={}",
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                revision.getRevisionId(),
                errorCode
        );

        publishStatusEvent(event.projectId(), FloorPlanConstants.SSE_FLOOR_PLAN_FAILED, new FloorPlanStatusSseResponse(
                FloorPlanConstants.SSE_FLOOR_PLAN_FAILED,
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                revision.getRevisionId(),
                "FAILED",
                resolveProgress(event.progress(), 0),
                errorMessage
        ));
    }

    private void handleClarificationRequired(FloorPlanGenerateEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        FloorPlanJob job = findJob(event);
        FloorPlanJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            log.info(
                    "Floor-plan clarification_required 이벤트를 무시합니다. projectId={}, jobId={}, jobStepId={}, reason=terminal-state",
                    event.projectId(),
                    event.jobId(),
                    event.jobStepId()
            );
            return;
        }

        Revision revision = findRevision(event.targetRevisionId());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", event.eventType());
        payload.put("errorCode", ErrorCode.FLOOR_PLAN_EVENT_INVALID.getCode());
        payload.put("errorMessage", "clarification_required 이벤트는 아직 지원하지 않습니다.");
        JsonNode outputPayload = objectMapper.valueToTree(payload);

        step.markFailed(
                ErrorCode.FLOOR_PLAN_EVENT_INVALID.getCode(),
                "clarification_required 이벤트는 아직 지원하지 않습니다.",
                outputPayload,
                now
        );
        job.markFailed("clarification_required 이벤트는 아직 지원하지 않습니다.", outputPayload, now);
        revision.markFailed();

        log.warn(
                "Floor-plan clarification_required 이벤트를 실패로 닫았습니다. projectId={}, jobId={}, jobStepId={}, targetRevisionId={}",
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                revision.getRevisionId()
        );

        publishStatusEvent(event.projectId(), FloorPlanConstants.SSE_FLOOR_PLAN_FAILED, new FloorPlanStatusSseResponse(
                FloorPlanConstants.SSE_FLOOR_PLAN_FAILED,
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                revision.getRevisionId(),
                "FAILED",
                resolveProgress(event.progress(), 0),
                "clarification_required 이벤트는 아직 지원하지 않습니다."
        ));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleFloorPlanStatusChanged(FloorPlanStatusChangedEvent event) {
        try {
            Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(event.projectId()).orElse(null);
            if (project == null) {
                return;
            }

            Set<UUID> targetUserIds = projectAccessService.resolveProjectMemberUserIds(project);
            notificationSseService.sendToUsers(targetUserIds, event.eventName(), event.payload());
        } catch (Exception e) {
            log.warn("Floor-plan SSE 전송에 실패했습니다. projectId={}, eventName={}", event.projectId(), event.eventName(), e);
        }
    }

    private FloorPlanJob findJob(FloorPlanGenerateEventMessage event) {
        return floorPlanJobRepository.findByJobIdAndJobType(
                        event.jobId(),
                        FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE
                )
                .orElseThrow(() -> new CustomException(ErrorCode.FLOOR_PLAN_JOB_NOT_FOUND));
    }

    private FloorPlanJobStep findStep(FloorPlanGenerateEventMessage event) {
        return floorPlanJobStepRepository.findByJobStepIdAndJobId(event.jobStepId(), event.jobId())
                .orElseThrow(() -> new CustomException(ErrorCode.FLOOR_PLAN_STEP_NOT_FOUND));
    }

    private Revision findRevision(UUID targetRevisionId) {
        if (targetRevisionId == null) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID);
        }

        return revisionRepository.findByRevisionId(targetRevisionId)
                .orElseThrow(() -> new CustomException(ErrorCode.FLOOR_PLAN_REVISION_NOT_FOUND));
    }

    private void validateCompletionIds(
            FloorPlanGenerateEventMessage event,
            Revision revision,
            FloorPlanJob job,
            FloorPlanJobStep step
    ) {
        if (event.outputArtifactId() == null) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID);
        }

        if (!revision.getProjectId().equals(event.projectId())) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID, "target revision의 프로젝트가 이벤트와 일치하지 않습니다.");
        }

        JsonNode inputPayload = step.getInputPayload();
        String expectedTargetRevisionId = extractJsonText(inputPayload, "targetRevisionId");
        String expectedArtifactId = extractJsonText(inputPayload, "expectedOutputArtifactId");

        if (expectedTargetRevisionId == null || !expectedTargetRevisionId.equals(revision.getRevisionId().toString())) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID, "target_revision_id가 예약값과 일치하지 않습니다.");
        }
        if (expectedArtifactId == null || !expectedArtifactId.equals(event.outputArtifactId().toString())) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID, "output_artifact_id가 예약값과 일치하지 않습니다.");
        }
        if (!job.getProjectId().equals(event.projectId())) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID, "job projectId가 이벤트와 일치하지 않습니다.");
        }
    }

    private Map<String, Object> buildCompletedPayload(
            FloorPlanGenerateEventMessage event,
            String storageUrl,
            String validationReportStorageUrl
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("storageUrl", storageUrl);
        if (validationReportStorageUrl != null && !validationReportStorageUrl.isBlank()) {
            payload.put("validationReportStorageUrl", validationReportStorageUrl);
        }
        payload.put("workerId", event.workerId());
        payload.put("eventType", event.eventType());
        return payload;
    }

    private Map<String, Object> buildFailedPayload(
            FloorPlanGenerateEventMessage event,
            FloorPlanWorkerError error,
            String eventType
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", eventType);
        if (error != null) {
            payload.put("errorCode", error.code());
            payload.put("errorMessage", error.message());
            payload.put("retryable", error.retryable());
            payload.put("detailStorageUrl", error.detailStorageUrl());
            payload.put("clarificationPossible", error.clarificationPossible());
        }
        return payload;
    }

    private Map<String, Object> buildPublishFailedPayload(FloorPlanPublishFailedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", EVENT_PUBLISH_FAILED);
        payload.put("failureType", event.returned() ? "RETURNED" : "NACK");
        payload.put("errorCode", event.returned()
                ? ErrorCode.FLOOR_PLAN_COMMAND_RETURNED.getCode()
                : ErrorCode.FLOOR_PLAN_COMMAND_CONFIRM_NACK.getCode());
        payload.put("errorMessage", event.cause());
        payload.put("returned", event.returned());
        payload.put("attemptNo", event.message().attemptNo());
        payload.put("maxAttempts", event.message().maxAttempts());
        payload.put("routingKey", event.message().routingKey());
        payload.put("jobStepId", event.message().jobStepId());
        return payload;
    }

    private void publishStatusEvent(UUID projectId, String eventName, FloorPlanStatusSseResponse payload) {
        eventPublisher.publishEvent(new FloorPlanStatusChangedEvent(projectId, eventName, payload));
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
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID);
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
}
