package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.BubbleData;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.ConnectionData;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotResponse;
import com.a204.batang.domain.workspace.dto.SaveFloorPlanSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveFloorPlanSnapshotResponse;
import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
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
class WorkspaceCommandServiceTest {

    @Mock
    private ProjectWorkspaceRepository projectWorkspaceRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @Mock
    private RevisionRepository revisionRepository;

    private WorkspaceCommandService workspaceCommandService;

    private UUID projectId;
    private Project project;
    private ProjectWorkspace workspace;
    private SaveBubbleSnapshotRequest bubbleRequest;

    @BeforeEach
    void setUp() {
        BubbleSnapshotHelper bubbleSnapshotHelper = new BubbleSnapshotHelper(new ObjectMapper());
        workspaceCommandService = new WorkspaceCommandService(
                projectWorkspaceRepository,
                bubbleSnapshotHelper,
                projectAccessService,
                revisionRepository
        );

        projectId = UUID.randomUUID();
        project = Project.create("workspace-save", "desc");
        ReflectionTestUtils.setField(project, "projectId", projectId);

        workspace = ProjectWorkspace.create(project);
        ReflectionTestUtils.setField(workspace, "projectId", projectId);

        bubbleRequest = new SaveBubbleSnapshotRequest(
                List.of(new BubbleData(
                        "bubble-1",
                        10.0,
                        20.0,
                        30.0,
                        40.0,
                        3000.0,
                        4000.0,
                        "거실",
                        "LIVING",
                        84.5,
                        "#ffffff"
                )),
                List.of(new ConnectionData(
                        "bubble-1",
                        "bubble-1",
                        "bold"
                ))
        );
    }

    @Test
    void saveBubbleSnapshot_updatesWorkspaceSnapshotAndReturnsResponse() {
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        SaveBubbleSnapshotResponse response = workspaceCommandService.saveBubbleSnapshot(projectId, bubbleRequest);

        assertThat(workspace.getBubbleSnapshotJson()).isNotNull();
        assertThat(workspace.getBubbleSnapshotJson().get("bubbles").size()).isEqualTo(1);
        assertThat(workspace.getBubbleSnapshotJson().get("connections").size()).isEqualTo(1);

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.phaseStatus()).isEqualTo(PhaseStatus.BUBBLE_DRAFT);
        assertThat(response.savedAt()).isNotNull();
        verify(projectWorkspaceRepository, never()).saveAndFlush(any(ProjectWorkspace.class));
    }

    @Test
    void saveBubbleSnapshot_throwsWhenWorkspacePhaseIsNotBubbleDraft() {
        ReflectionTestUtils.setField(workspace, "phaseStatus", PhaseStatus.CONVERTING);

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        assertThatThrownBy(() -> workspaceCommandService.saveBubbleSnapshot(projectId, bubbleRequest))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_INVALID_PHASE);
    }

    @Test
    void saveBubbleSnapshot_throwsWhenConnectionReferencesUnknownBubble() {
        SaveBubbleSnapshotRequest invalidRequest = new SaveBubbleSnapshotRequest(
                bubbleRequest.bubbles(),
                List.of(new ConnectionData(
                        "bubble-1",
                        "unknown-bubble",
                        "bold"
                ))
        );

        assertThatThrownBy(() -> workspaceCommandService.saveBubbleSnapshot(projectId, invalidRequest))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID);
    }

    @Test
    void saveFloorPlanSnapshot_persistsRevisionAndWorkspaceOutput() {
        UUID userId = UUID.randomUUID();
        SaveFloorPlanSnapshotRequest request = new SaveFloorPlanSnapshotRequest(null, "s3://bucket/project/model.ifc");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(userId);
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));
        given(revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId)).willReturn(Optional.empty());

        SaveFloorPlanSnapshotResponse response = workspaceCommandService.saveFloorPlanSnapshot(projectId, request);

        ArgumentCaptor<Revision> revisionCaptor = ArgumentCaptor.forClass(Revision.class);
        verify(revisionRepository).save(revisionCaptor.capture());

        Revision savedRevision = revisionCaptor.getValue();
        assertThat(savedRevision.getProjectId()).isEqualTo(projectId);
        assertThat(savedRevision.getRevisionNo()).isEqualTo(1);
        assertThat(savedRevision.getCreatedBy()).isEqualTo(userId);
        assertThat(savedRevision.getStatus()).isEqualTo("SUCCEEDED");

        assertThat(workspace.getIfcStorageUrl()).isEqualTo("s3://bucket/project/model.ifc");
        assertThat(workspace.getCurrentRevision()).isEqualTo(response.revisionId());
        assertThat(project.getLatestRevisionId()).isEqualTo(UUID.fromString(response.revisionId()));

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.phaseStatus()).isEqualTo(workspace.getPhaseStatus());
        assertThat(response.s3Url()).isEqualTo("s3://bucket/project/model.ifc");
        assertThat(response.savedAt()).isNotNull();

        verify(projectAccessService).validateProjectPinWriterOrThrow(eq(projectId), eq(userId));
    }

    @Test
    void saveFloorPlanSnapshot_throwsWhenRequestRevisionIdIsInvalidUuid() {
        UUID userId = UUID.randomUUID();
        SaveFloorPlanSnapshotRequest request = new SaveFloorPlanSnapshotRequest("invalid-revision-id", "s3://bucket/project/model.ifc");

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(userId);
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));

        assertThatThrownBy(() -> workspaceCommandService.saveFloorPlanSnapshot(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_OUTPUT_VALIDATION_FAILED);
    }
}
