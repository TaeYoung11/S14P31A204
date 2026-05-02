package com.a204.batang.domain.render.messaging;

import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.render.dto.RenderStatusSseResponse;
import com.a204.batang.domain.render.entity.RenderArtifact;
import com.a204.batang.domain.render.entity.RenderJob;
import com.a204.batang.domain.render.entity.RenderJobStep;
import com.a204.batang.domain.render.messaging.dto.SdRenderEventMessage;
import com.a204.batang.domain.render.messaging.event.SdRenderPublishFailedEvent;
import com.a204.batang.domain.render.repository.RenderArtifactRepository;
import com.a204.batang.domain.render.repository.RenderJobRepository;
import com.a204.batang.domain.render.repository.RenderJobStepRepository;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * SD render worker event를 수신해 DB 상태와 SSE를 갱신한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SdRenderEventListener {

    private static final String EVENT_STARTED = "SD_RENDER_STARTED";
    private static final String EVENT_PROGRESS = "SD_RENDER_PROGRESS";
    private static final String EVENT_COMPLETED = "SD_RENDER_COMPLETED";
    private static final String EVENT_FAILED = "SD_RENDER_FAILED";
    private static final String JOB_TYPE_SD_RENDER = "SD_RENDER";

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;
    private final RenderJobRepository renderJobRepository;
    private final RenderJobStepRepository renderJobStepRepository;
    private final RenderArtifactRepository renderArtifactRepository;
    private final SdRenderCommandPublisher sdRenderCommandPublisher;
    private final NotificationSseService notificationSseService;
    private final ObjectMapper objectMapper;

    /**
     * sd-render 외 event는 무시하고, render event만 상태 전이 처리한다.
     */
    @RabbitListener(queues = RabbitMqConfig.BE_JOB_EVENTS_QUEUE)
    @Transactional
    public void handle(SdRenderEventMessage event) {
        if (event == null || event.eventType() == null) {
            throw new CustomException(ErrorCode.RENDER_EVENT_INVALID);
        }

        log.info("[📥 RabbitMQ] 이벤트 수신 - Type: {}, JobId: {}", event.eventType(), event.jobId());

        if (!event.eventType().startsWith("SD_RENDER_")) {
            return;
        }

        switch (event.eventType()) {
            case EVENT_STARTED -> handleStarted(event);
            case EVENT_PROGRESS -> handleProgress(event);
            case EVENT_COMPLETED -> handleCompleted(event);
            case EVENT_FAILED -> handleFailed(event);
            default -> {
            }
        }
    }

    /**
     * RabbitMQ 발행 실패(NACK 등) 이벤트를 수신하여 재시도하거나 실패 처리한다.
     */
    @EventListener
    @Transactional
    public void handlePublishFailed(SdRenderPublishFailedEvent event) {
        var message = event.getMessage();
        log.warn("[⚠️ RabbitMQ] 발행 실패 이벤트 감지 - JobId: {}, Cause: {}", message.jobId(), event.getCause());

        RenderJob job = renderJobRepository.findById(message.jobId()).orElse(null);
        if (job == null || job.isTerminal()) {
            return;
        }

        // 재시도 횟수 확인 (SdRenderCommandMessage에 이미 attemptNo 정보가 있음)
        if (message.attemptNo() < message.maxAttempts()) {
            log.info("[🔄 RabbitMQ] 재시도 시도 중... ({} / {})", message.attemptNo() + 1, message.maxAttempts());
            
            // 재시도 횟수가 증가된 새 메시지 생성 (record이므로 새로 생성)
            var retryMessage = new com.a204.batang.domain.render.messaging.dto.SdRenderCommandMessage(
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
                    message.sourceSceneType(),
                    message.expectedOutputArtifactId(),
                    message.input(),
                    message.expectedOutput(),
                    message.payload(),
                    message.attemptNo() + 1,
                    message.maxAttempts(),
                    message.idempotencyKey(),
                    message.correlationId(),
                    message.createdAt()
            );
            
            sdRenderCommandPublisher.publish(retryMessage);
        } else {
            log.error("[💀 RabbitMQ] 최대 재시도 횟수 초과. 작업을 실패 상태로 변경합니다.");
            
            String errorMessage = "메시지 발행 실패: " + event.getCause();
            job.markFailed(errorMessage, null, LocalDateTime.now());
            
            sendSse(job.getProjectId(), "RENDER_FAILED", new RenderStatusSseResponse(
                    "RENDER_FAILED",
                    job.getProjectId(),
                    job.getJobId(),
                    null,
                    "FAILED",
                    0,
                    null,
                    "메시지 전송 실패로 인해 작업을 중단합니다."
            ));
        }
    }

    private void handleStarted(SdRenderEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        RenderJob job = findJob(event);
        RenderJobStep step = findStep(event);

        // 중복 started/progress가 뒤늦게 들어와도 terminal 상태는 되돌리지 않는다.
        if (job.isTerminal() || step.isTerminal()) {
            return;
        }

        job.markRunning(now);
        step.markRunning(now);

        sendSse(event.projectId(), "RENDER_STARTED", new RenderStatusSseResponse(
                "RENDER_STARTED",
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                "RUNNING",
                safeProgress(event.progress(), 1),
                null,
                "렌더링이 시작되었습니다."
        ));
    }

    private void handleProgress(SdRenderEventMessage event) {
        RenderJob job = findJob(event);
        RenderJobStep step = findStep(event);

        // terminal 이후 progress 이벤트는 무시한다.
        if (job.isTerminal() || step.isTerminal()) {
            return;
        }

        Integer progress = safeProgress(event.progress(), 1);
        job.updateProgress(progress);
        step.updateProgress(progress);

        sendSse(event.projectId(), "RENDER_PROGRESS", new RenderStatusSseResponse(
                "RENDER_PROGRESS",
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                "RUNNING",
                progress,
                null,
                extractString(event.output(), "message", "렌더링 진행 중입니다.")
        ));
    }

    private void handleCompleted(SdRenderEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        RenderJob job = findJob(event);
        RenderJobStep step = findStep(event);

        // 완료 이후 재수신된 completed/failed 이벤트는 상태를 다시 덮어쓰지 않는다.
        if (job.isTerminal() || step.isTerminal()) {
            return;
        }

        UUID artifactId = event.outputArtifactId();
        if (artifactId == null) {
            throw new CustomException(ErrorCode.RENDER_EVENT_INVALID);
        }

        String imageUrl = extractRequiredString(event.output(), "outputImageStorageUrl");
        String mimeType = extractString(event.output(), "mimeType", "image/png");
        String summary = extractString(event.output(), "summary", "실사 렌더링 이미지 생성 완료");
        JsonNode outputPayload = objectMapper.valueToTree(event.output());

        step.markSucceeded(outputPayload, now);
        job.markSucceeded(outputPayload, now);

        // artifact 저장은 멱등하게 처리한다.
        if (!renderArtifactRepository.existsByArtifactId(artifactId)) {
            RenderArtifact artifact = RenderArtifact.createRenderImage(
                    artifactId,
                    event.projectId(),
                    event.sourceRevisionId(),
                    event.jobId(),
                    "render-" + artifactId + ".png",
                    mimeType,
                    imageUrl,
                    objectMapper.valueToTree(buildArtifactMetadata(event, job, summary)),
                    now
            );
            renderArtifactRepository.save(artifact);
        }

        sendSse(event.projectId(), "RENDER_COMPLETED", new RenderStatusSseResponse(
                "RENDER_COMPLETED",
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                "SUCCEEDED",
                100,
                imageUrl,
                summary
        ));
    }

    private void handleFailed(SdRenderEventMessage event) {
        LocalDateTime now = LocalDateTime.now();
        RenderJob job = findJob(event);
        RenderJobStep step = findStep(event);

        // 이미 종료된 작업은 실패 이벤트로 다시 오염시키지 않는다.
        if (job.isTerminal() || step.isTerminal()) {
            return;
        }

        String errorCode = event.error() != null && event.error().code() != null
                ? event.error().code()
                : "SD_RENDER_FAILED";
        String errorMessage = event.error() != null && event.error().message() != null
                ? event.error().message()
                : "렌더링에 실패했습니다.";

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("errorCode", errorCode);
        output.put("errorMessage", errorMessage);
        JsonNode outputPayload = objectMapper.valueToTree(output);

        step.markFailed(errorCode, errorMessage, outputPayload, now);
        job.markFailed(errorMessage, outputPayload, now);

        sendSse(event.projectId(), "RENDER_FAILED", new RenderStatusSseResponse(
                "RENDER_FAILED",
                event.projectId(),
                event.jobId(),
                event.jobStepId(),
                "FAILED",
                safeProgress(event.progress(), 0),
                null,
                errorMessage
        ));
    }

    /**
     * worker output을 우선 사용하고, 빠진 렌더 옵션은 request payload에서 복원한다.
     */
    private Map<String, Object> buildArtifactMetadata(SdRenderEventMessage event, RenderJob job, String summary) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        putIfPresent(metadata, "width", extractInteger(event.output(), "width"));
        putIfPresent(metadata, "height", extractInteger(event.output(), "height"));
        putIfPresent(metadata, "workerId", event.workerId());
        putIfPresent(metadata, "summary", summary);

        // prompt/style은 worker event에 없을 수 있으므로 요청 원본을 fallback source로 사용한다.
        String prompt = firstNonBlank(
                extractString(event.output(), "prompt", null),
                extractRequestPayloadText(job.getRequestPayload(), "prompt")
        );
        putIfPresent(metadata, "prompt", prompt);

        Object style = extractFirstPresent(
                event.output() != null ? event.output().get("style") : null,
                convertRequestPayloadNode(job.getRequestPayload(), "style")
        );
        putIfPresent(metadata, "style", style);

        return metadata;
    }

    private String extractRequestPayloadText(JsonNode requestPayload, String key) {
        if (requestPayload == null) {
            return null;
        }

        JsonNode value = requestPayload.path(key);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }

        String text = value.asText(null);
        return text == null || text.isBlank() ? null : text;
    }

    private Object convertRequestPayloadNode(JsonNode requestPayload, String key) {
        if (requestPayload == null) {
            return null;
        }

        JsonNode value = requestPayload.path(key);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }

        return objectMapper.convertValue(value, Object.class);
    }

    private Object extractFirstPresent(Object primary, Object fallback) {
        return primary != null ? primary : fallback;
    }

    /**
     * 빈 문자열이 아닌 첫 번째 값을 선택한다.
     */
    private String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary;
        }
        if (fallback != null && !fallback.isBlank()) {
            return fallback;
        }
        return null;
    }

    private RenderJob findJob(SdRenderEventMessage event) {
        return renderJobRepository.findByJobIdAndJobType(event.jobId(), JOB_TYPE_SD_RENDER)
                .orElseThrow(() -> new CustomException(ErrorCode.RENDER_JOB_NOT_FOUND));
    }

    /**
     * job id와 step id를 함께 확인해 잘못된 이벤트 매핑을 막는다.
     */
    private RenderJobStep findStep(SdRenderEventMessage event) {
        return renderJobStepRepository.findByJobStepIdAndJobId(event.jobStepId(), event.jobId())
                .orElseThrow(() -> new CustomException(ErrorCode.RENDER_STEP_NOT_FOUND));
    }

    private void sendSse(UUID projectId, String eventName, RenderStatusSseResponse payload) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        // 렌더링 이벤트는 별도 채널을 만들지 않고 기존 notification SSE를 재사용한다.
        Set<UUID> targetUserIds = projectAccessService.resolveProjectMemberUserIds(project);
        notificationSseService.sendToUsers(targetUserIds, eventName, payload);
    }

    private Integer safeProgress(Integer progress, Integer fallback) {
        if (progress == null) {
            return fallback;
        }
        return Math.max(0, Math.min(progress, 100));
    }

    /**
     * 필수 문자열 필드가 비어 있으면 잘못된 worker event로 본다.
     */
    private String extractRequiredString(Map<String, Object> output, String key) {
        String value = extractString(output, key, null);
        if (value == null || value.isBlank()) {
            throw new CustomException(ErrorCode.RENDER_EVENT_INVALID);
        }
        return value;
    }

    private String extractString(Map<String, Object> output, String key, String fallback) {
        if (output == null || !output.containsKey(key) || output.get(key) == null) {
            return fallback;
        }
        return String.valueOf(output.get(key));
    }

    private Integer extractInteger(Map<String, Object> output, String key) {
        if (output == null || output.get(key) == null) {
            return null;
        }

        Object value = output.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }

        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private void putIfPresent(Map<String, Object> metadata, String key, Object value) {
        if (value != null) {
            metadata.put(key, value);
        }
    }
}
