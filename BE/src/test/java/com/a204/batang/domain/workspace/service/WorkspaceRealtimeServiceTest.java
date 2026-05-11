package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.project.service.ProjectQueryService;
import com.a204.batang.domain.workspace.dto.BubbleRedoRequest;
import com.a204.batang.domain.workspace.dto.BubbleUndoRequest;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest;
import com.a204.batang.domain.workspace.dto.ProjectSyncResponse;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.repository.WorkspaceBubbleSnapshotRedisRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class WorkspaceRealtimeServiceTest {

    @Mock
    private ProjectWorkspaceRepository projectWorkspaceRepository;

    @Mock
    private WorkspaceBubbleSnapshotRedisRepository workspaceBubbleSnapshotRedisRepository;

    @Mock
    private SimpMessagingTemplate simpMessagingTemplate;

    @Mock
    private ProjectAccessService projectAccessService;

    @Mock
    private ProjectQueryService projectQueryService;

    private WorkspaceRealtimeService workspaceRealtimeService;
    private ObjectMapper objectMapper;

    private UUID projectId;
    private UUID currentUserId;
    private ProjectWorkspace workspace;
    private BubbleUpdateRequest request;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        BubbleSnapshotHelper bubbleSnapshotHelper = new BubbleSnapshotHelper(objectMapper);

        workspaceRealtimeService = new WorkspaceRealtimeService(
                projectWorkspaceRepository,
                projectAccessService,
                projectQueryService,
                workspaceBubbleSnapshotRedisRepository,
                bubbleSnapshotHelper,
                simpMessagingTemplate
        );

        projectId = UUID.randomUUID();
        currentUserId = UUID.randomUUID();

        Project project = Project.create("workspace-test", "desc");
        workspace = ProjectWorkspace.create(project);

        request = new BubbleUpdateRequest(
                List.of(new BubbleUpdateRequest.BubbleData(
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
                List.of(new BubbleUpdateRequest.ConnectionData(
                        "bubble-1",
                        "bubble-1",
                        "bold"
                )),
                0
        );
    }

    @Test
    void updateBubbleDraft_savesSnapshotToRedisAndBroadcastsMessage() throws Exception {
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        workspaceRealtimeService.updateBubbleDraft(projectId, currentUserId, request);

        ArgumentCaptor<JsonNode> snapshotCaptor = ArgumentCaptor.forClass(JsonNode.class);
        verify(workspaceBubbleSnapshotRedisRepository).saveSnapshot(eq(projectId), snapshotCaptor.capture(), eq(0));

        JsonNode snapshot = snapshotCaptor.getValue();
        assertThat(snapshot.get("bubbles")).isNotNull();
        assertThat(snapshot.get("connections")).isNotNull();
        assertThat(snapshot.get("bubbles").size()).isEqualTo(1);
        assertThat(snapshot.get("connections").size()).isEqualTo(1);

        ArgumentCaptor<ProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(ProjectSyncResponse.class);
        verify(simpMessagingTemplate)
                .convertAndSend(eq("/topic/project/%s/sync".formatted(projectId)), responseCaptor.capture());

        ProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("BUBBLE_UPDATED");
        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.bubbleSnapshotJson()).isEqualTo(snapshot);
        assertThat(response.updatedAt()).isNotNull();
    }

    @Test
    void updateBubbleDraft_throwsCustomExceptionWhenRedisSaveFails() throws Exception {
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        doThrow(new JsonProcessingException("serialize fail") {
                })
                .when(workspaceBubbleSnapshotRedisRepository)
                .saveSnapshot(eq(projectId), any(JsonNode.class), anyInt());

        assertThatThrownBy(() -> workspaceRealtimeService.updateBubbleDraft(projectId, currentUserId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_BUBBLE_CACHE_SAVE_FAILED);

        verifyNoInteractions(simpMessagingTemplate);
    }

    @Test
    void updateBubbleDraft_throwsCursorInvalidWhenBaseIndexDoesNotMatchHistory() throws Exception {
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        doThrow(new IllegalArgumentException("invalid base index"))
                .when(workspaceBubbleSnapshotRedisRepository)
                .saveSnapshot(eq(projectId), any(JsonNode.class), anyInt());

        assertThatThrownBy(() -> workspaceRealtimeService.updateBubbleDraft(projectId, currentUserId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID);

        verifyNoInteractions(simpMessagingTemplate);
    }

    @Test
    void undoBubbleDraft_loadsPreviousSnapshotAndBroadcastsMessage() throws Exception {
        JsonNode undoSnapshot = objectMapper.readTree("""
                {
                  "bubbles": [{"id": "bubble-1"}],
                  "connections": []
                }
                """);

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.getBubbleSnapshotHistorySize(projectId))
                .willReturn(3);
        given(workspaceBubbleSnapshotRedisRepository.findBubbleSnapshotByIndex(projectId, 1))
                .willReturn(undoSnapshot);

        workspaceRealtimeService.undoBubbleDraft(projectId, currentUserId, new BubbleUndoRequest(2));

        ArgumentCaptor<ProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(ProjectSyncResponse.class);
        verify(simpMessagingTemplate)
                .convertAndSend(eq("/topic/project/%s/sync".formatted(projectId)), responseCaptor.capture());

        ProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("BUBBLE_UNDO");
        assertThat(response.bubbleSnapshotJson()).isEqualTo(undoSnapshot);
    }

    @Test
    void undoBubbleDraft_throwsCursorInvalidWhenThereIsNoPreviousSnapshot() {
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.getBubbleSnapshotHistorySize(projectId))
                .willReturn(1);

        assertThatThrownBy(() -> workspaceRealtimeService.undoBubbleDraft(
                projectId,
                currentUserId,
                new BubbleUndoRequest(0)
        ))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID);

        verifyNoInteractions(simpMessagingTemplate);
    }

    @Test
    void redoBubbleDraft_loadsNextSnapshotAndBroadcastsMessage() throws Exception {
        JsonNode redoSnapshot = objectMapper.readTree("""
                {
                  "bubbles": [{"id": "bubble-2"}],
                  "connections": []
                }
                """);

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.getBubbleSnapshotHistorySize(projectId))
                .willReturn(3);
        given(workspaceBubbleSnapshotRedisRepository.findBubbleSnapshotByIndex(projectId, 2))
                .willReturn(redoSnapshot);

        workspaceRealtimeService.redoBubbleDraft(projectId, currentUserId, new BubbleRedoRequest(1));

        ArgumentCaptor<ProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(ProjectSyncResponse.class);
        verify(simpMessagingTemplate)
                .convertAndSend(eq("/topic/project/%s/sync".formatted(projectId)), responseCaptor.capture());

        ProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("BUBBLE_REDO");
        assertThat(response.bubbleSnapshotJson()).isEqualTo(redoSnapshot);
    }

    @Test
    void redoBubbleDraft_throwsCursorInvalidWhenBaseIndexIsStale() {
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.getBubbleSnapshotHistorySize(projectId))
                .willReturn(3);

        assertThatThrownBy(() -> workspaceRealtimeService.redoBubbleDraft(
                projectId,
                currentUserId,
                new BubbleRedoRequest(3)
        ))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID);

        verifyNoInteractions(simpMessagingTemplate);
    }
}
