package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.BubbleData;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.ConnectionData;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotResponse;
import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class WorkspaceCommandServiceTest {

    @Mock
    private ProjectWorkspaceRepository projectWorkspaceRepository;

    private WorkspaceCommandService workspaceCommandService;

    private UUID projectId;
    private ProjectWorkspace workspace;
    private SaveBubbleSnapshotRequest request;

    @BeforeEach
    void setUp() {
        BubbleSnapshotHelper bubbleSnapshotHelper = new BubbleSnapshotHelper(new ObjectMapper());
        workspaceCommandService = new WorkspaceCommandService(projectWorkspaceRepository, bubbleSnapshotHelper);

        projectId = UUID.randomUUID();
        Project project = Project.create("workspace-save", "desc");
        ReflectionTestUtils.setField(project, "projectId", projectId);

        workspace = ProjectWorkspace.create(project);
        ReflectionTestUtils.setField(workspace, "projectId", projectId);

        request = new SaveBubbleSnapshotRequest(
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

        SaveBubbleSnapshotResponse response = workspaceCommandService.saveBubbleSnapshot(projectId, request);

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

        assertThatThrownBy(() -> workspaceCommandService.saveBubbleSnapshot(projectId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_INVALID_PHASE);
    }

    @Test
    void saveBubbleSnapshot_throwsWhenConnectionReferencesUnknownBubble() {
        SaveBubbleSnapshotRequest invalidRequest = new SaveBubbleSnapshotRequest(
                request.bubbles(),
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
}
