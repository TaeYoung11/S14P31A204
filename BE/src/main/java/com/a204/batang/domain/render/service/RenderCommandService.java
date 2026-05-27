package com.a204.batang.domain.render.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.render.dto.CreateRenderRequest;
import com.a204.batang.domain.render.dto.CreateRenderResponse;
import com.a204.batang.domain.render.dto.RenderStyleRequest;
import com.a204.batang.domain.render.dto.RenderStatusSseResponse;
import com.a204.batang.domain.render.entity.RenderJob;
import com.a204.batang.domain.render.entity.RenderJobStep;
import com.a204.batang.domain.render.messaging.SdRenderCommandPublisher;
import com.a204.batang.domain.render.messaging.dto.SdRenderCommandMessage;
import com.a204.batang.domain.render.messaging.event.RenderStatusChangedEvent;
import com.a204.batang.domain.render.repository.RenderJobRepository;
import com.a204.batang.domain.render.repository.RenderJobStepRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 렌더링 요청을 생성하고 worker command를 발행한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RenderCommandService {

    private static final String JOB_TYPE_SD_RENDER = "SD_RENDER";
    private static final String WORKER_TYPE_SD_RENDER = "SD_RENDER";
    private static final String SOURCE_SCENE_TYPE_IFC_MODEL = "IFC_MODEL";
    private static final String DEFAULT_IFC2IMG_TIME_OF_DAY = "DAY";

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;
    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final RenderJobRepository renderJobRepository;
    private final RenderJobStepRepository renderJobStepRepository;
    private final SdRenderCommandPublisher sdRenderCommandPublisher;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @Value("${app.aws.s3.bucket}")
    private String configuredBucket;

    /**
     * 프로젝트 권한과 IFC source를 검증한 뒤 render job/step을 생성하고 command를 발행한다.
     */
    @Transactional
    public CreateRenderResponse createRender(UUID projectId, CreateRenderRequest request) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.RENDER_SOURCE_NOT_FOUND));

        String sourceIfcStorageUrl = toWorkerStorageUrl(workspace.getIfcStorageUrl());
        if (sourceIfcStorageUrl == null || sourceIfcStorageUrl.isBlank()) {
            throw new CustomException(ErrorCode.RENDER_SOURCE_NOT_FOUND);
        }

        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID expectedOutputArtifactId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        UUID sourceRevisionId = project.getLatestRevisionId();
        String idempotencyKey = jobId + ":step-1:sd-render";
        String outputPrefix = buildOutputPrefix(projectId, expectedOutputArtifactId);
        String outputManifestStorageUrl = outputPrefix + "/manifest.v1.json";
        String outputLeftPhotoStorageUrl = outputPrefix + "/photo_front_diagonal_left.png";
        String outputRightPhotoStorageUrl = outputPrefix + "/photo_front_diagonal_right.png";
        LocalDateTime now = LocalDateTime.now();

        JsonNode requestPayload = objectMapper.valueToTree(request);
        JsonNode inputPayload = objectMapper.valueToTree(buildStepInputPayload(
                sourceIfcStorageUrl,
                request.cameraState(),
                expectedOutputArtifactId,
                outputManifestStorageUrl,
                outputLeftPhotoStorageUrl,
                outputRightPhotoStorageUrl
        ));

        RenderJob job = RenderJob.createQueued(
                jobId,
                projectId,
                currentUserId,
                sourceRevisionId,
                SOURCE_SCENE_TYPE_IFC_MODEL,
                JOB_TYPE_SD_RENDER,
                requestPayload,
                now
        );

        RenderJobStep step = RenderJobStep.createQueued(
                jobStepId,
                jobId,
                1,
                WORKER_TYPE_SD_RENDER,
                RabbitMqConfig.SD_RENDER_COMMAND_ROUTING_KEY,
                idempotencyKey,
                inputPayload,
                now
        );

        renderJobRepository.save(job);
        renderJobStepRepository.save(step);

        SdRenderCommandMessage command = new SdRenderCommandMessage(
                UUID.randomUUID(),
                "v1",
                "COMMAND",
                "SD_RENDER_GENERATE",
                RabbitMqConfig.SD_RENDER_COMMAND_ROUTING_KEY,
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                currentUserId,
                sourceRevisionId,
                SOURCE_SCENE_TYPE_IFC_MODEL,
                expectedOutputArtifactId,
                buildWorkerInput(sourceIfcStorageUrl, request),
                buildExpectedOutput(outputManifestStorageUrl, outputLeftPhotoStorageUrl, outputRightPhotoStorageUrl),
                buildWorkerPayload(request),
                0,
                3,
                idempotencyKey,
                correlationId,
                OffsetDateTime.now()
        );

        try {
            log.info("[📤 RabbitMQ] 명령 발행 - JobId: {}, ProjectId: {}", jobId, projectId);
            sdRenderCommandPublisher.publish(command);
        } catch (Exception e) {
            log.error("[❌ RabbitMQ] 명령 발행 중 예외 발생 - JobId: {}", jobId, e);
            throw e;
        }

        sendRenderSse("RENDER_QUEUED", new RenderStatusSseResponse(
                "RENDER_QUEUED",
                projectId,
                jobId,
                jobStepId,
                "QUEUED",
                0,
                null,
                null,
                null
        ));

        return new CreateRenderResponse(
                jobId,
                jobStepId,
                projectId,
                sourceRevisionId,
                expectedOutputArtifactId,
                "QUEUED",
                0
        );
    }

    /**
     * job_steps.input_payload에는 worker 실행 전에 확인할 준비 데이터를 기록한다.
     */
    private Map<String, Object> buildStepInputPayload(
            String sourceIfcStorageUrl,
            Object cameraState,
            UUID expectedOutputArtifactId,
            String outputManifestStorageUrl,
            String outputLeftPhotoStorageUrl,
            String outputRightPhotoStorageUrl
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sourceIfcStorageUrl", sourceIfcStorageUrl);
        putIfNotNull(payload, "cameraState", cameraState);
        payload.put("expectedOutputArtifactId", expectedOutputArtifactId.toString());
        payload.put("renderManifestStorageUrl", outputManifestStorageUrl);
        payload.put("renderPhotoFrontDiagonalLeftStorageUrl", outputLeftPhotoStorageUrl);
        payload.put("renderPhotoFrontDiagonalRightStorageUrl", outputRightPhotoStorageUrl);
        return payload;
    }

    /**
     * FE 요청 계약과 worker input 계약을 직접 결합하지 않기 위해 여기서 변환한다.
     */
    private Map<String, Object> buildWorkerInput(String sourceIfcStorageUrl, CreateRenderRequest request) {
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("sourceIfcStorageUrl", sourceIfcStorageUrl);
        putIfNotNull(input, "cameraState", request.cameraState());
        putIfNotNull(input, "sourceImageStorageUrl", request.sourceImageStorageUrl());
        return input;
    }

    private Map<String, Object> buildExpectedOutput(
            String outputManifestStorageUrl,
            String outputImageStorageUrl,
            String outputSecondaryImageStorageUrl
    ) {
        Map<String, Object> expectedOutput = new LinkedHashMap<>();
        expectedOutput.put("renderManifestStorageUrl", outputManifestStorageUrl);
        expectedOutput.put("renderPhotoFrontDiagonalLeftStorageUrl", outputImageStorageUrl);
        expectedOutput.put("renderPhotoFrontDiagonalRightStorageUrl", outputSecondaryImageStorageUrl);
        return expectedOutput;
    }

    /**
     * 변경 가능성이 큰 렌더 옵션은 command payload 조립부로 한정한다.
     */
    private Map<String, Object> buildWorkerPayload(CreateRenderRequest request) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("renderMode", "ifc2img");
        payload.put("prompt", request.prompt());
        payload.put("timeOfDay", resolveWorkerTimeOfDay(request.style()));
        putIfNotNull(payload, "negativePrompt", request.negativePrompt());
        putIfNotNull(payload, "sourceImageStorageUrl", request.sourceImageStorageUrl());
        return payload;
    }

    private String resolveWorkerTimeOfDay(RenderStyleRequest style) {
        if (style == null || style.timeOfDay() == null || style.timeOfDay().isBlank()) {
            return DEFAULT_IFC2IMG_TIME_OF_DAY;
        }

        return switch (style.timeOfDay().trim().toUpperCase()) {
            case "NIGHT", "DUSK", "EVENING" -> "NIGHT";
            default -> "DAY";
        };
    }

    private void putIfNotNull(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }

    private String buildOutputPrefix(UUID projectId, UUID artifactId) {
        return "s3://%s/projects/%s/renders/%s".formatted(configuredBucket, projectId, artifactId);
    }

    private String toWorkerStorageUrl(String storageUrl) {
        if (storageUrl == null || storageUrl.isBlank()) {
            return storageUrl;
        }

        String normalizedStorageUrl = storageUrl.trim();
        if (normalizedStorageUrl.startsWith("s3://")
                || normalizedStorageUrl.startsWith("http://")
                || normalizedStorageUrl.startsWith("https://")) {
            return normalizedStorageUrl;
        }

        return "s3://%s/%s".formatted(configuredBucket, normalizedStorageUrl);
    }

    private void sendRenderSse(String eventName, RenderStatusSseResponse payload) {
        // 트랜잭션 정합성을 위해 커밋 후 SSE 발송되도록 이벤트로 위임한다.
        eventPublisher.publishEvent(new RenderStatusChangedEvent(
                payload.projectId(), eventName, payload));
    }
}
