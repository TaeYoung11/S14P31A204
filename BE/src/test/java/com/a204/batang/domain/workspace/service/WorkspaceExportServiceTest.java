package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.workspace.dto.ExportFloorPlanIfcResponse;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
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

import java.net.URI;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class WorkspaceExportServiceTest {

    @Mock
    private ProjectWorkspaceRepository projectWorkspaceRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @Mock
    private S3Presigner s3Presigner;

    private WorkspaceExportService workspaceExportService;

    private UUID projectId;
    private UUID userId;
    private ProjectWorkspace workspace;

    @BeforeEach
    void setUp() {
        workspaceExportService = new WorkspaceExportService(
                projectWorkspaceRepository,
                projectAccessService,
                s3Presigner,
                "batang",
                300
        );

        projectId = UUID.randomUUID();
        userId = UUID.randomUUID();

        Project project = Project.create("ifc-export", "desc");
        ReflectionTestUtils.setField(project, "projectId", projectId);

        workspace = ProjectWorkspace.create(project);
        ReflectionTestUtils.setField(workspace, "projectId", projectId);
        workspace.updateIfcStorageUrl("projects/" + projectId + "/revisions/" + UUID.randomUUID() + "/ifc/model.v1.ifc");
        workspace.updateCurrentRevision(UUID.randomUUID());
    }

    @Test
    void exportFloorPlanIfc_generatesPresignedUrlFromObjectKeyPath() throws Exception {
        PresignedGetObjectRequest presignedRequest = org.mockito.Mockito.mock(PresignedGetObjectRequest.class);
        given(presignedRequest.url()).willReturn(URI.create("https://download.example.com/model.ifc?signature=test").toURL());

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(userId);
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class))).willReturn(presignedRequest);

        ExportFloorPlanIfcResponse response = workspaceExportService.exportFloorPlanIfc(projectId);

        ArgumentCaptor<GetObjectPresignRequest> captor = ArgumentCaptor.forClass(GetObjectPresignRequest.class);
        verify(s3Presigner).presignGetObject(captor.capture());
        GetObjectRequest getObjectRequest = captor.getValue().getObjectRequest();

        assertThat(getObjectRequest.bucket()).isEqualTo("batang");
        assertThat(getObjectRequest.key()).startsWith("projects/" + projectId);
        assertThat(getObjectRequest.responseContentDisposition()).contains("attachment;");

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.revisionId()).isEqualTo(workspace.getCurrentRevision());
        assertThat(response.ifcStorageUrl()).isEqualTo(workspace.getIfcStorageUrl());
        assertThat(response.presignedUrl()).isEqualTo("https://download.example.com/model.ifc?signature=test");
        assertThat(response.expiresAt()).isNotNull();

        verify(projectAccessService).validateProjectPinWriterOrThrow(projectId, userId);
    }

    @Test
    void exportFloorPlanIfc_throwsWhenIfcSourceMissing() {
        workspace.updateIfcStorageUrl(null);
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(userId);
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        assertThatThrownBy(() -> workspaceExportService.exportFloorPlanIfc(projectId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_IFC_EXPORT_SOURCE_NOT_FOUND);
    }

    @Test
    void exportFloorPlanIfc_throwsWhenBucketMismatch() {
        workspace.updateIfcStorageUrl("s3://other-bucket/projects/" + projectId + "/revisions/" + UUID.randomUUID() + "/ifc/model.v1.ifc");
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(userId);
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        assertThatThrownBy(() -> workspaceExportService.exportFloorPlanIfc(projectId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID);
    }

    @Test
    void exportFloorPlanIfc_throwsWhenPresignFails() {
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(userId);
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class)))
                .willThrow(SdkClientException.create("presign failed"));

        assertThatThrownBy(() -> workspaceExportService.exportFloorPlanIfc(projectId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_IFC_EXPORT_PRESIGN_FAILED);
    }
}
