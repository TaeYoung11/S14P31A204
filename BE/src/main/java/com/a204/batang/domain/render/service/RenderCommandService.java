package com.a204.batang.domain.render.service;

import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.render.dto.CreateRenderRequest;
import com.a204.batang.domain.render.dto.CreateRenderResponse;
import com.a204.batang.domain.render.dto.RenderStatusSseResponse;
import com.a204.batang.domain.render.entity.RenderJob;
import com.a204.batang.domain.render.entity.RenderJobStep;
import com.a204.batang.domain.render.messaging.SdRenderCommandPublisher;
import com.a204.batang.domain.render.messaging.dto.SdRenderCommandMessage;
import com.a204.batang.domain.render.repository.RenderJobRepository;
import com.a204.batang.domain.render.repository.RenderJobStepRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
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
    private static final String COMMAND_ROUTING_KEY = "command.sd-render.generate";

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;
    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final RenderJobRepository renderJobRepository;
    private final RenderJobStepRepository renderJobStepRepository;
    private final SdRenderCommandPublisher sdRenderCommandPublisher;
    private final NotificationSseService notificationSseService;
    private final ObjectMapper objectMapper;

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

        String sourceIfcStorageUrl = workspace.getIfcStorageUrl();
        if (sourceIfcStorageUrl == null || sourceIfcStorageUrl.isBlank()) {
            throw new CustomException(ErrorCode.RENDER_SOURCE_NOT_FOUND);
        }

        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID expectedOutputArtifactId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        UUID sourceRevisionId = project.getLatestRevisionId();
        String idempotencyKey = jobId + ":step-1:sd-render";
        String outputImageStorageUrl = buildOutputImageStorageUrl(projectId, expectedOutputArtifactId);
        LocalDateTime now = LocalDateTime.now();

        JsonNode requestPayload = objectMapper.valueToTree(request);
        JsonNode inputPayload = objectMapper.valueToTree(buildStepInputPayload(
                sourceIfcStorageUrl,
                request.cameraState(),
                expectedOutputArtifactId,
                outputImageStorageUrl
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
                COMMAND_ROUTING_KEY,
                idempotencyKey,
                inputPayload,
                now
        );

        renderJobRepository.save(job);
        renderJobStepRepository.save(step);

        SdRenderCommandMessage command = new SdRenderCommandMessage(
                UUID.randomUUID(),
                1,
                "COMMAND",
                "SD_RENDER_GENERATE",
                COMMAND_ROUTING_KEY,
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
                buildExpectedOutput(outputImageStorageUrl),
                buildWorkerPayload(request),
                1,
                3,
                idempotencyKey,
                correlationId,
                OffsetDateTime.now()
        );

        log.info("[📤 RabbitMQ] 명령 발행 - JobId: {}, ProjectId: {}", jobId, projectId);
        sdRenderCommandPublisher.publish(command);

        sendRenderSse(project, "RENDER_QUEUED", new RenderStatusSseResponse(
                "RENDER_QUEUED",
                projectId,
                jobId,
                jobStepId,
                "QUEUED",
                0,
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
            String outputImageStorageUrl
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sourceIfcStorageUrl", sourceIfcStorageUrl);
        putIfNotNull(payload, "cameraState", cameraState);
        payload.put("expectedOutputArtifactId", expectedOutputArtifactId.toString());
        payload.put("outputImageStorageUrl", outputImageStorageUrl);
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

    private Map<String, Object> buildExpectedOutput(String outputImageStorageUrl) {
        Map<String, Object> expectedOutput = new LinkedHashMap<>();
        expectedOutput.put("outputImageStorageUrl", outputImageStorageUrl);
        return expectedOutput;
    }

    /**
     * 변경 가능성이 큰 렌더 옵션은 command payload 조립부로 한정한다.
     */
    private Map<String, Object> buildWorkerPayload(CreateRenderRequest request) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("prompt", request.prompt());
        putIfNotNull(payload, "negativePrompt", request.negativePrompt());
        putIfNotNull(payload, "style", request.style());
        payload.put("width", request.width() == null ? 1024 : request.width());
        payload.put("height", request.height() == null ? 1024 : request.height());
        return payload;
    }

    private void putIfNotNull(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }

    private String buildOutputImageStorageUrl(UUID projectId, UUID artifactId) {
        return "s3://batang/projects/%s/renders/%s.png".formatted(projectId, artifactId);
    }

    private void sendRenderSse(Project project, String eventName, Object payload) {
        // 렌더링 SSE는 기존 notification 스트림으로 전송한다.
        Set<UUID> targetUserIds = projectAccessService.resolveProjectMemberUserIds(project);
        notificationSseService.sendToUsers(targetUserIds, eventName, payload);
    }
}
