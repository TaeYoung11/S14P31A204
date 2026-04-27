package com.a204.batang.domain.render.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.render.dto.ProjectRenderResponse;
import com.a204.batang.domain.render.entity.RenderArtifact;
import com.a204.batang.domain.render.entity.RenderJob;
import com.a204.batang.domain.render.repository.RenderArtifactRepository;
import com.a204.batang.domain.render.repository.RenderJobRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Constructor;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RenderQueryServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @Mock
    private RenderJobRepository renderJobRepository;

    @Mock
    private RenderArtifactRepository renderArtifactRepository;

    @InjectMocks
    private RenderQueryService renderQueryService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private UUID projectId;
    private Project project;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        project = Project.create("render-project", "desc");
        ReflectionTestUtils.setField(project, "projectId", projectId);
    }

    @Test
    void getProjectRenders_throwsWhenProjectDoesNotExist() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> renderQueryService.getProjectRenders(projectId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_NOT_FOUND);
    }

    @Test
    void getProjectRenders_propagatesForbiddenAccess() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(UUID.randomUUID());

        org.mockito.Mockito.doThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS))
                .when(projectAccessService)
                .validateProjectOwnerOrThrow(eq(project), any());

        assertThatThrownBy(() -> renderQueryService.getProjectRenders(projectId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);
    }

    @Test
    void getProjectRenders_returnsEmptyListWhenNoJobsExist() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(null);
        given(renderJobRepository.findByProjectIdAndJobTypeOrderByCreatedAtDescJobIdDesc(projectId, "RENDER"))
                .willReturn(List.of());

        List<ProjectRenderResponse> result = renderQueryService.getProjectRenders(projectId);

        assertThat(result).isEmpty();
        verify(renderArtifactRepository, never())
                .findByProjectIdAndJobIdInAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(any(), any(), any());
    }

    @Test
    void getProjectRenders_mapsJobsAndSelectsLatestArtifact() throws Exception {
        UUID firstJobId = UUID.randomUUID();
        UUID secondJobId = UUID.randomUUID();

        RenderJob firstJob = createJob(
                firstJobId,
                projectId,
                "success",
                "{\"style\":{\"time_of_day\":\"evening\",\"viewpoint\":\"exterior\",\"season\":\"spring\",\"weather\":\"clear\"}}",
                LocalDateTime.of(2026, 4, 15, 16, 50, 0),
                LocalDateTime.of(2026, 4, 15, 16, 50, 28)
        );
        RenderJob secondJob = createJob(
                secondJobId,
                projectId,
                "running",
                "{\"style\":{\"timeOfDay\":\"morning\",\"viewpoint\":\"interior\"}}",
                LocalDateTime.of(2026, 4, 14, 10, 0, 0),
                null
        );

        RenderArtifact latestArtifact = createArtifact(
                UUID.randomUUID(),
                projectId,
                firstJobId,
                "https://minio.local/renderings/render-latest.png",
                LocalDateTime.of(2026, 4, 15, 16, 50, 30)
        );
        RenderArtifact olderArtifact = createArtifact(
                UUID.randomUUID(),
                projectId,
                firstJobId,
                "https://minio.local/renderings/render-old.png",
                LocalDateTime.of(2026, 4, 15, 16, 50, 10)
        );

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(null);
        given(renderJobRepository.findByProjectIdAndJobTypeOrderByCreatedAtDescJobIdDesc(projectId, "RENDER"))
                .willReturn(List.of(firstJob, secondJob));
        given(renderArtifactRepository.findByProjectIdAndJobIdInAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                eq(projectId),
                any(),
                eq("RENDER_IMAGE")
        )).willReturn(List.of(latestArtifact, olderArtifact));

        List<ProjectRenderResponse> result = renderQueryService.getProjectRenders(projectId);

        assertThat(result).hasSize(2);

        ProjectRenderResponse first = result.get(0);
        assertThat(first.renderId()).isEqualTo(firstJobId);
        assertThat(first.imageUrl()).isEqualTo("https://minio.local/renderings/render-latest.png");
        assertThat(first.status()).isEqualTo("SUCCESS");
        assertThat(first.createdAt()).isEqualTo("2026-04-15T07:50:00Z");
        assertThat(first.completedAt()).isEqualTo("2026-04-15T07:50:28Z");
        assertThat(first.style()).isNotNull();
        assertThat(first.style().timeOfDay()).isEqualTo("EVENING");
        assertThat(first.style().viewpoint()).isEqualTo("EXTERIOR");
        assertThat(first.style().season()).isEqualTo("SPRING");
        assertThat(first.style().weather()).isEqualTo("CLEAR");

        ProjectRenderResponse second = result.get(1);
        assertThat(second.renderId()).isEqualTo(secondJobId);
        assertThat(second.imageUrl()).isNull();
        assertThat(second.status()).isEqualTo("RUNNING");
        assertThat(second.createdAt()).isEqualTo("2026-04-14T01:00:00Z");
        assertThat(second.completedAt()).isNull();
        assertThat(second.style()).isNotNull();
        assertThat(second.style().timeOfDay()).isEqualTo("MORNING");
        assertThat(second.style().viewpoint()).isEqualTo("INTERIOR");
        assertThat(second.style().season()).isNull();
        assertThat(second.style().weather()).isNull();
    }

    private RenderJob createJob(
            UUID jobId,
            UUID projectId,
            String status,
            String requestPayload,
            LocalDateTime createdAt,
            LocalDateTime finishedAt
    ) throws Exception {
        RenderJob job = instantiate(RenderJob.class);
        ReflectionTestUtils.setField(job, "jobId", jobId);
        ReflectionTestUtils.setField(job, "projectId", projectId);
        ReflectionTestUtils.setField(job, "jobType", "RENDER");
        ReflectionTestUtils.setField(job, "status", status);
        ReflectionTestUtils.setField(job, "requestPayload", objectMapper.readTree(requestPayload));
        ReflectionTestUtils.setField(job, "createdAt", createdAt);
        ReflectionTestUtils.setField(job, "finishedAt", finishedAt);
        return job;
    }

    private RenderArtifact createArtifact(
            UUID artifactId,
            UUID projectId,
            UUID jobId,
            String storageUrl,
            LocalDateTime createdAt
    ) throws Exception {
        RenderArtifact artifact = instantiate(RenderArtifact.class);
        ReflectionTestUtils.setField(artifact, "artifactId", artifactId);
        ReflectionTestUtils.setField(artifact, "projectId", projectId);
        ReflectionTestUtils.setField(artifact, "jobId", jobId);
        ReflectionTestUtils.setField(artifact, "artifactType", "RENDER_IMAGE");
        ReflectionTestUtils.setField(artifact, "storageUrl", storageUrl);
        ReflectionTestUtils.setField(artifact, "createdAt", createdAt);
        return artifact;
    }

    private <T> T instantiate(Class<T> type) throws Exception {
        Constructor<T> constructor = type.getDeclaredConstructor();
        constructor.setAccessible(true);
        return constructor.newInstance();
    }
}
