package com.a204.batang.domain.floorplan.messaging;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
import com.a204.batang.domain.floorplan.dto.FloorPlanStatusSseResponse;
import com.a204.batang.domain.floorplan.entity.FloorPlanArtifact;
import com.a204.batang.domain.floorplan.entity.FloorPlanJob;
import com.a204.batang.domain.floorplan.entity.FloorPlanJobStep;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateEventMessage;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanWorkerError;
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
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.ApplicationEventPublisher;
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
 * IFC generate worker event를 수신해 floor-plan 상태와 결과물을 반영한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FloorPlanGenerateEventListener {

    private static final String EVENT_PREFIX = "IFC_GENERATE_FROM_BUBBLE_";
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
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @RabbitListener(queues = RabbitMqConfig.BE_JOB_EVENTS_QUEUE)
    @Transactional
    public void handle(FloorPlanGenerateEventMessage event) {
        if (event == null || event.eventType() == null) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID);
        }

        if (!event.eventType().startsWith(EVENT_PREFIX)) {
            return;
        }

        log.info("Floor-plan worker 이벤트를 수신했습니다. eventType={}, jobId={}, jobStepId={}",
                event.eventType(), event.jobId(), event.jobStepId());

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

    private void handleStarted(FloorPlanGenerateEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        FloorPlanJob job = findJob(event);
        FloorPlanJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
            return;
        }

        job.markRunning(now);
        step.markRunning(now);

        Integer progress = resolveProgress(event.progress(), 1);
        job.updateProgress(progress);
        step.updateProgress(progress);

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
            return;
        }

        Integer progress = resolveProgress(event.progress(), 0);
        job.updateProgress(progress);
        step.updateProgress(progress);

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
            return;
        }

        Revision revision = findRevision(event.targetRevisionId());
        validateCompletionIds(event, revision, job);

        String storageUrl = extractRequiredString(event.output(), "storage_url");
        String validationReportStorageUrl = extractString(event.output(), "validation_report_storage_url");

        JsonNode outputPayload = objectMapper.valueToTree(buildCompletedPayload(event, storageUrl, validationReportStorageUrl));
        step.markSucceeded(outputPayload, now);
        job.markSucceeded(outputPayload, now);
        revision.markSucceeded();

        if (!floorPlanArtifactRepository.findByArtifactId(event.outputArtifactId()).isPresent()) {
            floorPlanArtifactRepository.save(FloorPlanArtifact.createIfcModel(
                    event.outputArtifactId(),
                    event.projectId(),
                    revision.getRevisionId(),
                    event.jobId(),
                    "model.ifc",
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
                    "validation-report.json",
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

    private void handleFailed(FloorPlanGenerateEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        FloorPlanJob job = findJob(event);
        FloorPlanJobStep step = findStep(event);

        if (job.isTerminal() || step.isTerminal()) {
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
            return;
        }

        Revision revision = findRevision(event.targetRevisionId());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", event.eventType());
        payload.put("errorCode", ErrorCode.FLOOR_PLAN_EVENT_INVALID.getCode());
        payload.put("errorMessage", "clarification_required 이벤트는 아직 지원하지 않습니다.");
        JsonNode outputPayload = objectMapper.valueToTree(payload);

        step.markFailed(ErrorCode.FLOOR_PLAN_EVENT_INVALID.getCode(),
                "clarification_required 이벤트는 아직 지원하지 않습니다.", outputPayload, now);
        job.markFailed("clarification_required 이벤트는 아직 지원하지 않습니다.", outputPayload, now);
        revision.markFailed();

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
            log.warn("Floor-plan SSE 전송에 실패했습니다. projectId={}, eventName={}",
                    event.projectId(), event.eventName(), e);
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

    private void validateCompletionIds(FloorPlanGenerateEventMessage event, Revision revision, FloorPlanJob job) {
        if (event.outputArtifactId() == null) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID);
        }

        if (!revision.getProjectId().equals(event.projectId())) {
            throw new CustomException(ErrorCode.FLOOR_PLAN_EVENT_INVALID, "target revision이 예약된 프로젝트와 일치하지 않습니다.");
        }

        JsonNode inputPayload = findStep(event).getInputPayload();
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
