package com.a204.batang.domain.render.messaging;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.render.entity.RenderArtifact;
import com.a204.batang.domain.render.entity.RenderJob;
import com.a204.batang.domain.render.entity.RenderJobStep;
import com.a204.batang.domain.render.messaging.dto.SdRenderError;
import com.a204.batang.domain.render.messaging.dto.SdRenderEventMessage;
import com.a204.batang.domain.render.messaging.event.RenderStatusChangedEvent;
import com.a204.batang.domain.render.repository.RenderArtifactRepository;
import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.render.repository.RenderJobRepository;
import com.a204.batang.domain.render.repository.RenderJobStepRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Constructor;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class SdRenderEventListenerTest {

    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private ProjectAccessService projectAccessService;
    @Mock
    private RenderJobRepository renderJobRepository;
    @Mock
    private RenderJobStepRepository renderJobStepRepository;
    @Mock
    private RenderArtifactRepository renderArtifactRepository;
    @Mock
    private SdRenderCommandPublisher sdRenderCommandPublisher;
    @Mock
    private NotificationSseService notificationSseService;
    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private SdRenderEventListener listener;

    private Project project;
    private RenderJob job;
    private RenderJobStep step;
    private UUID projectId;
    private UUID jobId;
    private UUID jobStepId;
    private UUID artifactId;

    @BeforeEach
    void setUp() throws Exception {
        projectId = UUID.randomUUID();
        jobId = UUID.randomUUID();
        jobStepId = UUID.randomUUID();
        artifactId = UUID.randomUUID();

        project = Project.create("project", "desc");
        ReflectionTestUtils.setField(project, "projectId", projectId);

        job = instantiate(RenderJob.class);
        ReflectionTestUtils.setField(job, "jobId", jobId);
        ReflectionTestUtils.setField(job, "projectId", projectId);
        ReflectionTestUtils.setField(job, "jobType", "SD_RENDER");
        ReflectionTestUtils.setField(job, "status", "QUEUED");
        ReflectionTestUtils.setField(job, "createdAt", LocalDateTime.now());
        ReflectionTestUtils.setField(job, "requestPayload", objectMapper.readTree("""
                {
                  "prompt": "남산 숲과 어울리는 조용한 도서관 외관",
                  "style": {
                    "timeOfDay": "DAY",
                    "viewpoint": "EXTERIOR"
                  }
                }
                """));

        step = instantiate(RenderJobStep.class);
        ReflectionTestUtils.setField(step, "jobStepId", jobStepId);
        ReflectionTestUtils.setField(step, "jobId", jobId);
        ReflectionTestUtils.setField(step, "status", "QUEUED");
        ReflectionTestUtils.setField(step, "createdAt", LocalDateTime.now());

        lenient().when(renderJobRepository.findByJobIdAndJobType(jobId, "SD_RENDER")).thenReturn(Optional.of(job));
        lenient().when(renderJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).thenReturn(Optional.of(step));
        lenient().when(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).thenReturn(Optional.of(project));
        lenient().when(projectAccessService.resolveProjectMemberUserIds(project)).thenReturn(Set.of(UUID.randomUUID()));
    }

    @Test
    void handleStarted_updatesRunningStateAndSendsSse() {
        listener.handle(event("SD_RENDER_STARTED", "event.sd-render.started", 1, null, null));

        assertThat(job.getStatus()).isEqualTo("RUNNING");
        assertThat(step.getStatus()).isEqualTo("RUNNING");
        verify(eventPublisher, times(1)).publishEvent(any(RenderStatusChangedEvent.class));
    }

    @Test
    void handleProgress_updatesProgressAndSendsSse() {
        listener.handle(event(
                "SD_RENDER_PROGRESS",
                "event.sd-render.progress",
                45,
                Map.of("message", "이미지 생성 중"),
                null
        ));

        assertThat(job.getStatus()).isEqualTo("RUNNING");
        assertThat(step.getStatus()).isEqualTo("RUNNING");
        assertThat(job.getProgress()).isEqualTo(45);
        assertThat(step.getProgress()).isEqualTo(45);
        verify(eventPublisher, times(1)).publishEvent(any(RenderStatusChangedEvent.class));
    }

    @Test
    void handleCompleted_marksSucceededAndCreatesArtifactWithFallbackMetadata() {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("outputImageStorageUrl", "s3://batang/projects/" + projectId + "/renders/" + artifactId + ".png");
        output.put("mimeType", "image/png");
        output.put("width", 1024);
        output.put("height", 1024);
        output.put("summary", "실사 렌더링 이미지 생성 완료");
        given(renderArtifactRepository.existsById(artifactId)).willReturn(false);

        listener.handle(event("SD_RENDER_COMPLETED", "event.sd-render.completed", 100, output, null));

        assertThat(job.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(step.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(job.getProgress()).isEqualTo(100);
        assertThat(step.getProgress()).isEqualTo(100);

        ArgumentCaptor<RenderArtifact> artifactCaptor = ArgumentCaptor.forClass(RenderArtifact.class);
        verify(renderArtifactRepository).save(artifactCaptor.capture());
        JsonNode metadata = artifactCaptor.getValue().getMetadataJson();
        assertThat(metadata.path("width").asInt()).isEqualTo(1024);
        assertThat(metadata.path("height").asInt()).isEqualTo(1024);
        assertThat(metadata.path("workerId").asText()).isEqualTo("sd-render-worker-1");
        assertThat(metadata.path("summary").asText()).isEqualTo("실사 렌더링 이미지 생성 완료");
        assertThat(metadata.path("prompt").asText()).isEqualTo("남산 숲과 어울리는 조용한 도서관 외관");
        assertThat(metadata.path("style").path("timeOfDay").asText()).isEqualTo("DAY");
        assertThat(metadata.path("style").path("viewpoint").asText()).isEqualTo("EXTERIOR");

        verify(eventPublisher, times(1)).publishEvent(any(RenderStatusChangedEvent.class));
    }

    @Test
    void handleFailed_marksFailedAndDoesNotCreateArtifact() {
        listener.handle(event(
                "SD_RENDER_FAILED",
                "event.sd-render.failed",
                60,
                null,
                new SdRenderError("SD_RENDER_FAILED", "Stable Diffusion rendering failed", false, false, null)
        ));

        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        verify(renderArtifactRepository, never()).save(any());
        verify(eventPublisher, times(1)).publishEvent(any(RenderStatusChangedEvent.class));
    }

    @Test
    void handleCompleted_ignoresWhenAlreadyTerminal() {
        ReflectionTestUtils.setField(job, "status", "SUCCEEDED");
        ReflectionTestUtils.setField(step, "status", "SUCCEEDED");

        Map<String, Object> output = Map.of(
                "outputImageStorageUrl",
                "s3://batang/projects/" + projectId + "/renders/" + artifactId + ".png"
        );
        listener.handle(event("SD_RENDER_COMPLETED", "event.sd-render.completed", 100, output, null));

        assertThat(job.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(step.getStatus()).isEqualTo("SUCCEEDED");
        verify(renderArtifactRepository, never()).save(any());
        verify(eventPublisher, never()).publishEvent(any(RenderStatusChangedEvent.class));
    }

    @Test
    void handleFailed_ignoresWhenAlreadyTerminal() {
        ReflectionTestUtils.setField(job, "status", "FAILED");
        ReflectionTestUtils.setField(step, "status", "FAILED");

        listener.handle(event(
                "SD_RENDER_FAILED",
                "event.sd-render.failed",
                60,
                null,
                new SdRenderError("SD_RENDER_FAILED", "Stable Diffusion rendering failed", false, false, null)
        ));

        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        verify(renderArtifactRepository, never()).save(any());
        verify(eventPublisher, never()).publishEvent(any(RenderStatusChangedEvent.class));
    }

    @Test
    void handle_ignoresNonRenderEvent() {
        listener.handle(new SdRenderEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                "OTHER_EVENT",
                "event.other",
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                "OTHER",
                "worker",
                null,
                artifactId,
                "RUNNING",
                10,
                null,
                null,
                "idempotency",
                UUID.randomUUID(),
                OffsetDateTime.now()
        ));

        verify(eventPublisher, never()).publishEvent(any(RenderStatusChangedEvent.class));
    }

    private SdRenderEventMessage event(
            String eventType,
            String routingKey,
            Integer progress,
            Map<String, Object> output,
            SdRenderError error
    ) {
        return new SdRenderEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                eventType,
                routingKey,
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                "SD_RENDER",
                "sd-render-worker-1",
                UUID.randomUUID(),
                artifactId,
                progress != null && progress == 100 ? "COMPLETED" : "RUNNING",
                progress,
                output,
                error,
                jobId + ":step-1:sd-render",
                UUID.randomUUID(),
                OffsetDateTime.now()
        );
    }

    private <T> T instantiate(Class<T> type) throws Exception {
        Constructor<T> constructor = type.getDeclaredConstructor();
        constructor.setAccessible(true);
        return constructor.newInstance();
    }
}
