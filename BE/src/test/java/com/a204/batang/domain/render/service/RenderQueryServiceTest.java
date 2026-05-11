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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.lang.reflect.Constructor;
import java.net.URI;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
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

    private RenderQueryService renderQueryService;

    @Mock
    private S3Presigner s3Presigner;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private UUID projectId;
    private Project project;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        project = Project.create("render-project", "desc");
        ReflectionTestUtils.setField(project, "projectId", projectId);
        renderQueryService = new RenderQueryService(
                projectRepository,
                projectAccessService,
                renderJobRepository,
                renderArtifactRepository,
                s3Presigner,
                "batang",
                "http://minio:9000",
                600L
        );
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
        given(renderJobRepository.findByProjectIdAndJobTypeOrderByCreatedAtDescJobIdDesc(projectId, "SD_RENDER"))
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
                "succeeded",
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
        given(renderJobRepository.findByProjectIdAndJobTypeOrderByCreatedAtDescJobIdDesc(projectId, "SD_RENDER"))
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
        assertThat(first.status()).isEqualTo("SUCCEEDED");
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

    @Test
    void getProjectRender_throwsWhenProjectDoesNotExist() {
        UUID renderId = UUID.randomUUID();
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> renderQueryService.getProjectRender(projectId, renderId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_NOT_FOUND);
    }

    @Test
    void getProjectRender_propagatesForbiddenAccess() {
        UUID renderId = UUID.randomUUID();
        UUID currentUserId = UUID.randomUUID();

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(currentUserId);

        org.mockito.Mockito.doThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS))
                .when(projectAccessService)
                .validateProjectMemberOrThrow(project, currentUserId);

        assertThatThrownBy(() -> renderQueryService.getProjectRender(projectId, renderId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);
    }

    @Test
    void getProjectRender_throwsWhenRenderJobDoesNotExist() {
        UUID renderId = UUID.randomUUID();

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(null);
        given(renderJobRepository.findByJobIdAndProjectIdAndJobType(renderId, projectId, "SD_RENDER"))
                .willReturn(Optional.empty());

        assertThatThrownBy(() -> renderQueryService.getProjectRender(projectId, renderId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.RENDER_JOB_NOT_FOUND);
    }

    @Test
    void getProjectRender_returnsPresignedImageUrl() throws Exception {
        UUID renderId = UUID.randomUUID();
        RenderJob job = createJob(
                renderId,
                projectId,
                "succeeded",
                "{\"style\":{\"timeOfDay\":\"evening\",\"viewpoint\":\"exterior\",\"season\":\"spring\",\"weather\":\"clear\"}}",
                LocalDateTime.of(2026, 4, 15, 16, 50, 0),
                LocalDateTime.of(2026, 4, 15, 16, 50, 28)
        );
        RenderArtifact artifact = createArtifact(
                UUID.randomUUID(),
                projectId,
                renderId,
                "s3://batang/projects/%s/renders/%s.png".formatted(projectId, UUID.randomUUID()),
                LocalDateTime.of(2026, 4, 15, 16, 50, 30)
        );
        PresignedGetObjectRequest presignedRequest = mock(PresignedGetObjectRequest.class);

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(null);
        given(renderJobRepository.findByJobIdAndProjectIdAndJobType(renderId, projectId, "SD_RENDER"))
                .willReturn(Optional.of(job));
        given(renderArtifactRepository.findFirstByProjectIdAndJobIdAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                projectId,
                renderId,
                "RENDER_IMAGE"
        )).willReturn(Optional.of(artifact));
        given(presignedRequest.url()).willReturn(URI.create("https://download.example.com/render.png?signature=test").toURL());
        given(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class))).willReturn(presignedRequest);

        ProjectRenderResponse result = renderQueryService.getProjectRender(projectId, renderId);

        assertThat(result.renderId()).isEqualTo(renderId);
        assertThat(result.imageUrl()).isEqualTo("https://download.example.com/render.png?signature=test");
        assertThat(result.status()).isEqualTo("SUCCEEDED");
        assertThat(result.createdAt()).isEqualTo("2026-04-15T07:50:00Z");
        assertThat(result.completedAt()).isEqualTo("2026-04-15T07:50:28Z");
        assertThat(result.style()).isNotNull();
        assertThat(result.style().timeOfDay()).isEqualTo("EVENING");
        assertThat(result.style().viewpoint()).isEqualTo("EXTERIOR");
        assertThat(result.style().season()).isEqualTo("SPRING");
        assertThat(result.style().weather()).isEqualTo("CLEAR");

        ArgumentCaptor<GetObjectPresignRequest> captor = ArgumentCaptor.forClass(GetObjectPresignRequest.class);
        verify(s3Presigner).presignGetObject(captor.capture());
        GetObjectRequest getObjectRequest = captor.getValue().getObjectRequest();
        assertThat(getObjectRequest.bucket()).isEqualTo("batang");
        assertThat(getObjectRequest.key()).startsWith("projects/" + projectId + "/renders/");
    }

    @Test
    void getProjectRender_presignsObjectKeyOnlyStorageUrlWithConfiguredBucket() throws Exception {
        UUID renderId = UUID.randomUUID();
        String objectKey = "projects/%s/renders/%s.png".formatted(projectId, UUID.randomUUID());
        RenderJob job = createJob(
                renderId,
                projectId,
                "succeeded",
                "{\"style\":{\"timeOfDay\":\"evening\"}}",
                LocalDateTime.of(2026, 4, 15, 16, 50, 0),
                LocalDateTime.of(2026, 4, 15, 16, 50, 28)
        );
        RenderArtifact artifact = createArtifact(
                UUID.randomUUID(),
                projectId,
                renderId,
                objectKey,
                LocalDateTime.of(2026, 4, 15, 16, 50, 30)
        );
        PresignedGetObjectRequest presignedRequest = mock(PresignedGetObjectRequest.class);

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(null);
        given(renderJobRepository.findByJobIdAndProjectIdAndJobType(renderId, projectId, "SD_RENDER"))
                .willReturn(Optional.of(job));
        given(renderArtifactRepository.findFirstByProjectIdAndJobIdAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                projectId,
                renderId,
                "RENDER_IMAGE"
        )).willReturn(Optional.of(artifact));
        given(presignedRequest.url()).willReturn(URI.create("https://download.example.com/render.png?signature=test").toURL());
        given(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class))).willReturn(presignedRequest);

        ProjectRenderResponse result = renderQueryService.getProjectRender(projectId, renderId);

        assertThat(result.imageUrl()).isEqualTo("https://download.example.com/render.png?signature=test");
        ArgumentCaptor<GetObjectPresignRequest> captor = ArgumentCaptor.forClass(GetObjectPresignRequest.class);
        verify(s3Presigner).presignGetObject(captor.capture());
        GetObjectRequest getObjectRequest = captor.getValue().getObjectRequest();
        assertThat(getObjectRequest.bucket()).isEqualTo("batang");
        assertThat(getObjectRequest.key()).isEqualTo(objectKey);
    }

    @Test
    void getProjectRender_returnsNullImageUrlWhenArtifactDoesNotExist() throws Exception {
        UUID renderId = UUID.randomUUID();
        RenderJob job = createJob(
                renderId,
                projectId,
                "running",
                "{\"style\":{\"timeOfDay\":\"morning\"}}",
                LocalDateTime.of(2026, 4, 14, 10, 0, 0),
                null
        );

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(null);
        given(renderJobRepository.findByJobIdAndProjectIdAndJobType(renderId, projectId, "SD_RENDER"))
                .willReturn(Optional.of(job));
        given(renderArtifactRepository.findFirstByProjectIdAndJobIdAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                projectId,
                renderId,
                "RENDER_IMAGE"
        )).willReturn(Optional.empty());

        ProjectRenderResponse result = renderQueryService.getProjectRender(projectId, renderId);

        assertThat(result.renderId()).isEqualTo(renderId);
        assertThat(result.imageUrl()).isNull();
        assertThat(result.status()).isEqualTo("RUNNING");
        verify(s3Presigner, never()).presignGetObject(any(GetObjectPresignRequest.class));
    }

    @Test
    void getProjectRender_throwsWhenPresignFails() throws Exception {
        UUID renderId = UUID.randomUUID();
        RenderJob job = createJob(
                renderId,
                projectId,
                "succeeded",
                "{\"style\":{\"timeOfDay\":\"evening\"}}",
                LocalDateTime.of(2026, 4, 15, 16, 50, 0),
                LocalDateTime.of(2026, 4, 15, 16, 50, 28)
        );
        RenderArtifact artifact = createArtifact(
                UUID.randomUUID(),
                projectId,
                renderId,
                "s3://batang/projects/%s/renders/%s.png".formatted(projectId, UUID.randomUUID()),
                LocalDateTime.of(2026, 4, 15, 16, 50, 30)
        );

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(null);
        given(renderJobRepository.findByJobIdAndProjectIdAndJobType(renderId, projectId, "SD_RENDER"))
                .willReturn(Optional.of(job));
        given(renderArtifactRepository.findFirstByProjectIdAndJobIdAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                projectId,
                renderId,
                "RENDER_IMAGE"
        )).willReturn(Optional.of(artifact));
        given(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class)))
                .willThrow(SdkClientException.create("presign failed"));

        assertThatThrownBy(() -> renderQueryService.getProjectRender(projectId, renderId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
    }

    @Test
    void getProjectRender_throwsWhenArtifactBucketDoesNotMatchConfiguredBucket() throws Exception {
        assertPresignFailsForStorageUrl("s3://other-bucket/projects/%s/renders/%s.png".formatted(projectId, UUID.randomUUID()));
    }

    @Test
    void getProjectRender_throwsWhenArtifactStorageUrlHasNoObjectKey() throws Exception {
        assertPresignFailsForStorageUrl("s3://batang");
    }

    @Test
    void getProjectRender_throwsWhenArtifactStorageUrlIsBlank() throws Exception {
        assertPresignFailsForStorageUrl(" ");
    }

    @Test
    void getProjectRender_presignsConfiguredEndpointPathStyleHttpUrl() throws Exception {
        UUID renderId = UUID.randomUUID();
        String objectKey = "projects/%s/renders/%s.png".formatted(projectId, UUID.randomUUID());
        RenderJob job = createJob(
                renderId,
                projectId,
                "succeeded",
                "{\"style\":{\"timeOfDay\":\"evening\"}}",
                LocalDateTime.of(2026, 4, 15, 16, 50, 0),
                LocalDateTime.of(2026, 4, 15, 16, 50, 28)
        );
        RenderArtifact artifact = createArtifact(
                UUID.randomUUID(),
                projectId,
                renderId,
                "http://minio:9000/batang/" + objectKey,
                LocalDateTime.of(2026, 4, 15, 16, 50, 30)
        );
        PresignedGetObjectRequest presignedRequest = mock(PresignedGetObjectRequest.class);

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(null);
        given(renderJobRepository.findByJobIdAndProjectIdAndJobType(renderId, projectId, "SD_RENDER"))
                .willReturn(Optional.of(job));
        given(renderArtifactRepository.findFirstByProjectIdAndJobIdAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                projectId,
                renderId,
                "RENDER_IMAGE"
        )).willReturn(Optional.of(artifact));
        given(presignedRequest.url()).willReturn(URI.create("https://download.example.com/render.png?signature=test").toURL());
        given(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class))).willReturn(presignedRequest);

        ProjectRenderResponse result = renderQueryService.getProjectRender(projectId, renderId);

        assertThat(result.imageUrl()).isEqualTo("https://download.example.com/render.png?signature=test");
        ArgumentCaptor<GetObjectPresignRequest> captor = ArgumentCaptor.forClass(GetObjectPresignRequest.class);
        verify(s3Presigner).presignGetObject(captor.capture());
        GetObjectRequest getObjectRequest = captor.getValue().getObjectRequest();
        assertThat(getObjectRequest.bucket()).isEqualTo("batang");
        assertThat(getObjectRequest.key()).isEqualTo(objectKey);
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
        ReflectionTestUtils.setField(job, "jobType", "SD_RENDER");
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

    private void assertPresignFailsForStorageUrl(String storageUrl) throws Exception {
        UUID renderId = UUID.randomUUID();
        RenderJob job = createJob(
                renderId,
                projectId,
                "succeeded",
                "{\"style\":{\"timeOfDay\":\"evening\"}}",
                LocalDateTime.of(2026, 4, 15, 16, 50, 0),
                LocalDateTime.of(2026, 4, 15, 16, 50, 28)
        );
        RenderArtifact artifact = createArtifact(
                UUID.randomUUID(),
                projectId,
                renderId,
                storageUrl,
                LocalDateTime.of(2026, 4, 15, 16, 50, 30)
        );

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserId()).willReturn(null);
        given(renderJobRepository.findByJobIdAndProjectIdAndJobType(renderId, projectId, "SD_RENDER"))
                .willReturn(Optional.of(job));
        given(renderArtifactRepository.findFirstByProjectIdAndJobIdAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                projectId,
                renderId,
                "RENDER_IMAGE"
        )).willReturn(Optional.of(artifact));

        assertThatThrownBy(() -> renderQueryService.getProjectRender(projectId, renderId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        verify(s3Presigner, never()).presignGetObject(any(GetObjectPresignRequest.class));
    }

    private <T> T instantiate(Class<T> type) throws Exception {
        Constructor<T> constructor = type.getDeclaredConstructor();
        constructor.setAccessible(true);
        return constructor.newInstance();
    }
}
