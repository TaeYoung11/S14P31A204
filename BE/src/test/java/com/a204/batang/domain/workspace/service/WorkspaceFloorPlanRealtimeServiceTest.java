package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanProjectSyncResponse;
import com.a204.batang.domain.workspace.dto.FloorPlanRealtimeUpdateRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanRedoRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanUndoRequest;
import com.a204.batang.domain.workspace.dto.PublishFloorPlanUpdatedRequest;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.repository.WorkspaceBubbleSnapshotRedisRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class WorkspaceFloorPlanRealtimeServiceTest {

    @Mock
    private ProjectWorkspaceRepository projectWorkspaceRepository;

    @Mock
    private SimpMessagingTemplate simpMessagingTemplate;

    @Mock
    private ProjectAccessService projectAccessService;

    @Mock
    private WorkspaceBubbleSnapshotRedisRepository workspaceBubbleSnapshotRedisRepository;

    private WorkspaceFloorPlanRealtimeService workspaceFloorPlanRealtimeService;
    private ObjectMapper objectMapper;

    private UUID projectId;
    private UUID currentUserId;
    private ProjectWorkspace workspace;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        BubbleSnapshotHelper bubbleSnapshotHelper = new BubbleSnapshotHelper(objectMapper);
        workspaceFloorPlanRealtimeService = new WorkspaceFloorPlanRealtimeService(
                projectWorkspaceRepository,
                projectAccessService,
                bubbleSnapshotHelper,
                workspaceBubbleSnapshotRedisRepository,
                simpMessagingTemplate,
                objectMapper
        );

        projectId = UUID.randomUUID();
        currentUserId = UUID.randomUUID();
        Project project = Project.create("floor-plan-test", "desc");
        workspace = ProjectWorkspace.create(project);
        ReflectionTestUtils.setField(workspace, "projectId", projectId);
        ReflectionTestUtils.setField(workspace, "currentRevision", "rev-100");
        ReflectionTestUtils.setField(
                workspace,
                "ifcStorageUrl",
                "s3://bucket/projects/" + projectId + "/revisions/" + UUID.randomUUID() + "/ifc/model.v1.ifc"
        );
    }

    @Test
    void relayFloorPlanDraft_broadcastsProcessingEventWithRevision() throws Exception {
        FloorPlanRealtimeUpdateRequest request = new FloorPlanRealtimeUpdateRequest(
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
                0,
                null,
                objectMapper.readTree("""
                        {
                          "rooms": [{"bubbleId": "bubble-1", "label": "거실"}],
                          "walls": [],
                          "openings": []
                        }
                        """)
        );

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        workspaceFloorPlanRealtimeService.relayFloorPlanDraft(projectId, currentUserId, request);

        ArgumentCaptor<FloorPlanProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(FloorPlanProjectSyncResponse.class);
        verify(simpMessagingTemplate).convertAndSend(
                eq("/topic/project/%s/floor-plan/sync".formatted(projectId)),
                responseCaptor.capture()
        );

        FloorPlanProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("FLOOR_PLAN_PROCESSING");
        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.revisionId()).isEqualTo("rev-100");
        assertThat(response.s3Url()).isNull();
        assertThat(response.floorPlanPayloadJson().get("baseIndex").asInt()).isEqualTo(0);
        assertThat(response.floorPlanPayloadJson().get("revisionId").asText()).isEqualTo("rev-100");
        assertThat(response.updatedAt()).isNotNull();
    }

    @Test
    void relayFloorPlanDraft_throwsWhenPayloadReferencesUnknownBubble() {
        FloorPlanRealtimeUpdateRequest request = new FloorPlanRealtimeUpdateRequest(
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
                        "bubble-2",
                        "bold"
                )),
                0,
                "rev-200",
                null
        );

        assertThatThrownBy(() -> workspaceFloorPlanRealtimeService.relayFloorPlanDraft(projectId, currentUserId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_BUBBLE_SNAPSHOT_INVALID);
    }

    @Test
    void publishFloorPlanUpdated_savesRedisAndBroadcastsUpdatedMessage() throws Exception {
        UUID previousRevisionId = UUID.randomUUID();
        ReflectionTestUtils.setField(workspace, "currentRevision", previousRevisionId.toString());

        PublishFloorPlanUpdatedRequest request = new PublishFloorPlanUpdatedRequest(
                null,
                objectMapper.readTree("""
                        {
                          "baseIndex": 2,
                          "bubbles": [{"id": "bubble-1"}],
                          "connections": []
                        }
                        """),
                "s3://bucket/projects/%s/revisions/%s/ifc/model.v1.ifc".formatted(projectId, UUID.randomUUID())
        );

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        workspaceFloorPlanRealtimeService.publishFloorPlanUpdated(projectId, request);

        ArgumentCaptor<FloorPlanProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(FloorPlanProjectSyncResponse.class);
        verify(simpMessagingTemplate).convertAndSend(
                eq("/topic/project/%s/floor-plan/sync".formatted(projectId)),
                responseCaptor.capture()
        );

        FloorPlanProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("FLOOR_PLAN_UPDATED");
        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.s3Url()).isEqualTo(request.s3Url());
        assertThat(response.revisionId()).isNotBlank();
        assertThat(UUID.fromString(response.revisionId())).isNotNull();
        assertThat(response.floorPlanPayloadJson().get("revisionId").asText()).isEqualTo(response.revisionId());
        assertThat(response.floorPlanPayloadJson().get("parentRevisionId").asText()).isEqualTo(previousRevisionId.toString());

        ArgumentCaptor<JsonNode> snapshotCaptor = ArgumentCaptor.forClass(JsonNode.class);
        verify(workspaceBubbleSnapshotRedisRepository).saveFloorPlanSnapshot(
                eq(projectId),
                snapshotCaptor.capture(),
                eq(2)
        );

        JsonNode historySnapshot = snapshotCaptor.getValue();
        assertThat(historySnapshot.get("s3Url").asText()).isEqualTo(request.s3Url());
        assertThat(historySnapshot.get("floorPlanPayloadJson").get("revisionId").asText()).isEqualTo(response.revisionId());
    }

    @Test
    void undoFloorPlanDraft_loadsPreviousSnapshotAndBroadcastsMessage() throws Exception {
        JsonNode undoSnapshot = objectMapper.readTree("""
                {
                  "floorPlanPayloadJson": {
                    "baseIndex": 1,
                    "revisionId": "rev-undo-1",
                    "bubbles": [{"id": "bubble-1"}],
                    "connections": []
                  },
                  "s3Url": "s3://bucket/projects/p1/revisions/rev-undo-1/ifc/model.v1.ifc"
                }
                """);

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.getFloorPlanSnapshotHistorySize(projectId))
                .willReturn(4);
        given(workspaceBubbleSnapshotRedisRepository.findFloorPlanSnapshotByIndex(projectId, 1))
                .willReturn(undoSnapshot);

        workspaceFloorPlanRealtimeService.undoFloorPlanDraft(projectId, currentUserId, new FloorPlanUndoRequest(2));

        ArgumentCaptor<FloorPlanProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(FloorPlanProjectSyncResponse.class);
        verify(simpMessagingTemplate).convertAndSend(
                eq("/topic/project/%s/floor-plan/sync".formatted(projectId)),
                responseCaptor.capture()
        );

        FloorPlanProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("FLOOR_PLAN_UNDO");
        assertThat(response.revisionId()).isEqualTo("rev-undo-1");
        assertThat(response.s3Url()).isEqualTo("s3://bucket/projects/p1/revisions/rev-undo-1/ifc/model.v1.ifc");
        assertThat(response.floorPlanPayloadJson().get("baseIndex").asInt()).isEqualTo(1);
    }

    @Test
    void redoFloorPlanDraft_loadsNextSnapshotAndBroadcastsMessage() throws Exception {
        JsonNode redoSnapshot = objectMapper.readTree("""
                {
                  "floorPlanPayloadJson": {
                    "baseIndex": 2,
                    "revisionId": "rev-redo-2",
                    "bubbles": [{"id": "bubble-2"}],
                    "connections": []
                  },
                  "s3Url": "s3://bucket/projects/p1/revisions/rev-redo-2/ifc/model.v1.ifc"
                }
                """);

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.getFloorPlanSnapshotHistorySize(projectId))
                .willReturn(4);
        given(workspaceBubbleSnapshotRedisRepository.findFloorPlanSnapshotByIndex(projectId, 2))
                .willReturn(redoSnapshot);

        workspaceFloorPlanRealtimeService.redoFloorPlanDraft(projectId, currentUserId, new FloorPlanRedoRequest(1));

        ArgumentCaptor<FloorPlanProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(FloorPlanProjectSyncResponse.class);
        verify(simpMessagingTemplate).convertAndSend(
                eq("/topic/project/%s/floor-plan/sync".formatted(projectId)),
                responseCaptor.capture()
        );

        FloorPlanProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("FLOOR_PLAN_REDO");
        assertThat(response.revisionId()).isEqualTo("rev-redo-2");
        assertThat(response.s3Url()).isEqualTo("s3://bucket/projects/p1/revisions/rev-redo-2/ifc/model.v1.ifc");
        assertThat(response.floorPlanPayloadJson().get("baseIndex").asInt()).isEqualTo(2);
    }

    @Test
    void redoFloorPlanDraft_throwsCursorInvalidWhenBaseIndexIsStale() {
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.getFloorPlanSnapshotHistorySize(projectId))
                .willReturn(3);

        assertThatThrownBy(() -> workspaceFloorPlanRealtimeService.redoFloorPlanDraft(
                projectId,
                currentUserId,
                new FloorPlanRedoRequest(3)
        ))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID);

        verifyNoInteractions(simpMessagingTemplate);
    }
}
