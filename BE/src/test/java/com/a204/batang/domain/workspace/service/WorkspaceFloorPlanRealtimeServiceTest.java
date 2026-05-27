package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.ifcedit.dto.DirectIfcEditRequest;
import com.a204.batang.domain.ifcedit.service.DirectIfcEditCommandService;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest;
import com.a204.batang.domain.workspace.dto.BubbleFloorMeta;
import com.a204.batang.domain.workspace.dto.BubbleZoneData;
import com.a204.batang.domain.workspace.dto.FloorPlanProjectSyncResponse;
import com.a204.batang.domain.workspace.dto.FloorPlanRealtimeUpdateRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanSceneType;
import com.a204.batang.domain.workspace.dto.FloorPlanRedoRequest;
import com.a204.batang.domain.workspace.dto.FloorPlanUndoRequest;
import com.a204.batang.domain.workspace.dto.PublishFloorPlanUpdatedRequest;
import com.a204.batang.domain.workspace.dto.WorkspaceCommand;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.repository.WorkspaceBubbleSnapshotRedisRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.exception.ErrorResponse;
import com.a204.batang.global.storage.S3ObjectPresigner;
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
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
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

    @Mock
    private DirectIfcEditCommandService directIfcEditCommandService;

    @Mock
    private FloorPlanS3DeleteQueueService floorPlanS3DeleteQueueService;

    @Mock
    private S3ObjectPresigner s3ObjectPresigner;

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
                floorPlanS3DeleteQueueService,
                directIfcEditCommandService,
                new FloorPlanIfcEditEngineRequestMapper(objectMapper),
                s3ObjectPresigner,
                simpMessagingTemplate,
                objectMapper
        );

        lenient().when(s3ObjectPresigner.presignIfInternal(anyString(), any()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        projectId = UUID.randomUUID();
        currentUserId = UUID.randomUUID();
        Project project = Project.create("floor-plan-test", "desc");
        workspace = ProjectWorkspace.create(project);
        ReflectionTestUtils.setField(workspace, "projectId", projectId);
        ReflectionTestUtils.setField(workspace, "currentRevision", UUID.randomUUID().toString());
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
                        "living-room",
                        "LIVING",
                        84.5,
                        "#ffffff",
                        null
                )),
                List.of(new BubbleUpdateRequest.ConnectionData(
                        "bubble-1",
                        "bubble-1",
                        "bold"
                )),
                List.of(new BubbleZoneData(
                        "zone-1",
                        "zone 1",
                        "#3B45B3",
                        List.of("bubble-1"),
                        "manual"
                )),
                0,
                null,
                FloorPlanSceneType.TWO_D,
                createWorkspaceCommand("create"),
                objectMapper.readTree("""
                        {
                          "rooms": [{"bubbleId": "bubble-1", "label": "living-room"}],
                          "walls": [],
                          "openings": []
                        }
                        """),
                new BubbleFloorMeta(Map.of(1, "1F"), List.of(3))
        );

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        workspaceFloorPlanRealtimeService.relayFloorPlanDraft(projectId, currentUserId, request);

        ArgumentCaptor<DirectIfcEditRequest> directRequestCaptor = ArgumentCaptor.forClass(DirectIfcEditRequest.class);
        verify(directIfcEditCommandService).createDirectIfcEdit(
                eq(projectId),
                eq(currentUserId),
                directRequestCaptor.capture(),
                any(JsonNode.class)
        );

        DirectIfcEditRequest directRequest = directRequestCaptor.getValue();
        assertThat(directRequest.baseRevisionId()).isNotNull();
        assertThat(directRequest.sourceSceneType()).isEqualTo("IFC_MODEL");
        assertThat(directRequest.engineRequest()).isNotNull();
        assertThat(directRequest.engineRequest().op()).isEqualTo("create");
        assertThat(directRequest.engineRequest().entity()).isEqualTo("ifcBatch");
        JsonNode engineRequest = directRequest.engineRequest().data();
        assertThat(engineRequest.get("schema_version").asText()).isEqualTo("v2");
        assertThat(engineRequest.get("operations")).hasSize(1);
        assertThat(engineRequest.get("operations").get(0).get("type").asText()).isEqualTo("create_element");
        JsonNode params = engineRequest.get("operations").get(0).get("parameters");
        assertThat(params.get("storey_id").asText()).isEqualTo("storey-1");
        assertThat(params.has("storey_global_id")).isFalse();

        ArgumentCaptor<FloorPlanProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(FloorPlanProjectSyncResponse.class);
        verify(simpMessagingTemplate).convertAndSend(
                eq("/topic/project/%s/floor-plan/sync".formatted(projectId)),
                responseCaptor.capture()
        );

        FloorPlanProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("FLOOR_PLAN_PROCESSING");
        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.revisionId()).isEqualTo(workspace.getCurrentRevision());
        assertThat(response.s3Url()).isNull();
        assertThat(response.floorPlanPayloadJson().get("baseIndex").asInt()).isEqualTo(0);
        assertThat(response.floorPlanPayloadJson().get("revisionId").asText()).isEqualTo(workspace.getCurrentRevision());
        assertThat(response.floorPlanPayloadJson().get("bubbles").get(0).get("floor").asInt()).isEqualTo(1);
        assertThat(response.floorPlanPayloadJson().get("zones").get(0).get("id").asText()).isEqualTo("zone-1");
        assertThat(response.floorPlanPayloadJson().get("floorMeta").get("namesByFloor").get("1").asText()).isEqualTo("1F");
        assertThat(response.floorPlanPayloadJson().get("floorMeta").get("extraFloors").get(0).asInt()).isEqualTo(3);
        assertThat(response.updatedAt()).isNotNull();
    }

    @Test
    void relayFloorPlanDraft_doesNotRouteToDirectIfcEditServiceWhenSceneTypeIsThreeD() throws Exception {
        FloorPlanRealtimeUpdateRequest request = new FloorPlanRealtimeUpdateRequest(
                List.of(new BubbleUpdateRequest.BubbleData(
                        "bubble-1",
                        10.0,
                        20.0,
                        30.0,
                        40.0,
                        3000.0,
                        4000.0,
                        "living-room",
                        "LIVING",
                        84.5,
                        "#ffffff",
                        null
                )),
                List.of(),
                List.of(),
                0,
                null,
                FloorPlanSceneType.THREE_D,
                createWorkspaceCommand("create"),
                objectMapper.readTree("""
                        {
                          "sceneType": "THREE_D"
                        }
                        """),
                null
        );

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        workspaceFloorPlanRealtimeService.relayFloorPlanDraft(projectId, currentUserId, request);

        verify(directIfcEditCommandService).createDirectIfcEdit(
                eq(projectId),
                eq(currentUserId),
                any(DirectIfcEditRequest.class),
                any(JsonNode.class)
        );
    }

    @Test
    void relayFloorPlanDraft_savesThreeDSnapshotOnlyCommandWithoutIfcEditQueue() throws Exception {
        FloorPlanRealtimeUpdateRequest request = new FloorPlanRealtimeUpdateRequest(
                List.of(new BubbleUpdateRequest.BubbleData(
                        "bubble-1",
                        10.0,
                        20.0,
                        30.0,
                        40.0,
                        3000.0,
                        4000.0,
                        "living-room",
                        "LIVING",
                        84.5,
                        "#ffffff",
                        null
                )),
                List.of(),
                List.of(),
                3,
                null,
                FloorPlanSceneType.THREE_D,
                new WorkspaceCommand(
                        "update",
                        "floorPlanSnapshot",
                        "ifc-element-change",
                        null,
                        objectMapper.createObjectNode().put("reason", "ifc-element-change"),
                        System.currentTimeMillis()
                ),
                objectMapper.readTree("""
                        {
                          "floorProject": {
                            "id": "ifc-result",
                            "unit": "mm",
                            "floors": [],
                            "rooms": [{"id": "room-1"}],
                            "adjacency": []
                          },
                          "libraryElements": []
                        }
                        """),
                null
        );

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.saveFloorPlanSnapshotAndReturnGarbage(
                eq(projectId),
                any(JsonNode.class),
                eq(3)
        )).willReturn(List.of());

        workspaceFloorPlanRealtimeService.relayFloorPlanDraft(projectId, currentUserId, request);

        verifyNoInteractions(directIfcEditCommandService);

        ArgumentCaptor<JsonNode> snapshotCaptor = ArgumentCaptor.forClass(JsonNode.class);
        verify(workspaceBubbleSnapshotRedisRepository).saveFloorPlanSnapshotAndReturnGarbage(
                eq(projectId),
                snapshotCaptor.capture(),
                eq(3)
        );
        JsonNode historySnapshot = snapshotCaptor.getValue();
        assertThat(historySnapshot.get("s3Url").isNull()).isTrue();
        JsonNode historyPayload = historySnapshot.get("floorPlanPayloadJson");
        assertThat(historyPayload.get("baseIndex").asInt()).isEqualTo(3);
        assertThat(historyPayload.get("revisionId").asText()).isEqualTo(workspace.getCurrentRevision());
        assertThat(historyPayload.get("sceneType").asText()).isEqualTo("THREE_D");
        assertThat(historyPayload.get("layout").get("floorProject").get("id").asText()).isEqualTo("ifc-result");

        ArgumentCaptor<FloorPlanProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(FloorPlanProjectSyncResponse.class);
        verify(simpMessagingTemplate).convertAndSend(
                eq("/topic/project/%s/floor-plan/sync".formatted(projectId)),
                responseCaptor.capture()
        );

        FloorPlanProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("FLOOR_PLAN_UPDATED");
        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.revisionId()).isEqualTo(workspace.getCurrentRevision());
        assertThat(response.s3Url()).isNull();
        assertThat(response.floorPlanPayloadJson().get("baseIndex").asInt()).isEqualTo(3);
        assertThat(response.floorPlanPayloadJson().get("sceneType").asText()).isEqualTo("THREE_D");
    }

    @Test
    void relayFloorPlanDraft_skipsWhenIfcEditJobConflictOccurs() throws Exception {
        FloorPlanRealtimeUpdateRequest request = new FloorPlanRealtimeUpdateRequest(
                List.of(new BubbleUpdateRequest.BubbleData(
                        "bubble-1",
                        10.0,
                        20.0,
                        30.0,
                        40.0,
                        3000.0,
                        4000.0,
                        "living-room",
                        "LIVING",
                        84.5,
                        "#ffffff",
                        null
                )),
                List.of(),
                List.of(),
                0,
                null,
                FloorPlanSceneType.TWO_D,
                createWorkspaceCommand("create"),
                objectMapper.readTree("""
                        {
                          "rooms": [{"bubbleId": "bubble-1", "label": "living-room"}],
                          "walls": [],
                          "openings": []
                        }
                        """),
                null
        );

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        doThrow(new CustomException(ErrorCode.IFC_EDIT_JOB_CONFLICT))
                .when(directIfcEditCommandService)
                .createDirectIfcEdit(eq(projectId), eq(currentUserId), any(DirectIfcEditRequest.class), any(JsonNode.class));

        workspaceFloorPlanRealtimeService.relayFloorPlanDraft(projectId, currentUserId, request);

        verifyNoInteractions(simpMessagingTemplate);
    }

    @Test
    void relayFloorPlanDraft_rejectsWhenMappedOperationsAreEmpty() throws Exception {
        FloorPlanRealtimeUpdateRequest request = new FloorPlanRealtimeUpdateRequest(
                List.of(new BubbleUpdateRequest.BubbleData(
                        "bubble-1",
                        10.0,
                        20.0,
                        30.0,
                        40.0,
                        3000.0,
                        4000.0,
                        "living-room",
                        "LIVING",
                        84.5,
                        "#ffffff",
                        null
                )),
                List.of(),
                List.of(),
                0,
                null,
                FloorPlanSceneType.TWO_D,
                new WorkspaceCommand(
                        "update",
                        "room",
                        "bubble-1",
                        null,
                        objectMapper.createObjectNode().put("widthMm", 3200.0),
                        System.currentTimeMillis()
                ),
                objectMapper.readTree("""
                        {
                          "rooms": [{"bubbleId": "bubble-1", "label": "living-room"}],
                          "walls": [],
                          "openings": []
                        }
                        """),
                null
        );

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));

        workspaceFloorPlanRealtimeService.relayFloorPlanDraft(projectId, currentUserId, request);

        verifyNoInteractions(directIfcEditCommandService);
        verifyNoInteractions(workspaceBubbleSnapshotRedisRepository);

        ArgumentCaptor<Object> userErrorCaptor = ArgumentCaptor.forClass(Object.class);
        verify(simpMessagingTemplate).convertAndSendToUser(
                eq(currentUserId.toString()),
                eq("/queue/errors"),
                userErrorCaptor.capture()
        );
        assertThat(userErrorCaptor.getValue()).isInstanceOf(ErrorResponse.class);
        ErrorResponse errorResponse = (ErrorResponse) userErrorCaptor.getValue();
        assertThat(errorResponse.getCode()).isEqualTo(ErrorCode.INVALID_REQUEST.getCode());
        assertThat(errorResponse.getMessage()).contains("IFC에 반영할 수 없는 편집 요청");
        verify(simpMessagingTemplate, never()).convertAndSend(
                eq("/topic/project/%s/floor-plan/sync".formatted(projectId)),
                any(Object.class)
        );
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
                        "living-room",
                        "LIVING",
                        84.5,
                        "#ffffff",
                        null
                )),
                List.of(new BubbleUpdateRequest.ConnectionData(
                        "bubble-1",
                        "bubble-2",
                        "bold"
                )),
                List.of(),
                0,
                "rev-200",
                FloorPlanSceneType.TWO_D,
                createWorkspaceCommand("create"),
                null,
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
        String removedHistorySnapshotPayload = """
                {
                  "floorPlanPayloadJson": {
                    "baseIndex": 0
                  },
                  "s3Url": "s3://bucket/projects/p1/revisions/old-removed/ifc/model.v1.ifc"
                }
                """;
        given(workspaceBubbleSnapshotRedisRepository.saveFloorPlanSnapshotAndReturnGarbage(
                eq(projectId),
                any(JsonNode.class),
                eq(2)
        )).willReturn(List.of(removedHistorySnapshotPayload));

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
        verify(workspaceBubbleSnapshotRedisRepository).saveFloorPlanSnapshotAndReturnGarbage(
                eq(projectId),
                snapshotCaptor.capture(),
                eq(2)
        );

        JsonNode historySnapshot = snapshotCaptor.getValue();
        assertThat(historySnapshot.get("s3Url").asText()).isEqualTo(request.s3Url());
        assertThat(historySnapshot.get("floorPlanPayloadJson").get("revisionId").asText()).isEqualTo(response.revisionId());

        verify(floorPlanS3DeleteQueueService).enqueueAll(Set.of("s3://bucket/projects/p1/revisions/old-removed/ifc/model.v1.ifc"));
    }

    @Test
    void publishFloorPlanUpdatedFromGenerate_savesUndoBaselineAndBroadcastsWebSocketMessageWithS3Url() throws Exception {
        UUID revisionId = UUID.randomUUID();
        UUID parentRevisionId = UUID.randomUUID();
        String s3Url = "s3://bucket/projects/%s/revisions/%s/ifc/model.v1.ifc".formatted(projectId, revisionId);

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.getFloorPlanSnapshotHistorySize(projectId))
                .willReturn(0);
        given(workspaceBubbleSnapshotRedisRepository.saveFloorPlanSnapshotAndReturnGarbage(
                eq(projectId),
                any(JsonNode.class),
                eq(-1)
        )).willReturn(List.of());
        given(workspaceBubbleSnapshotRedisRepository.saveFloorPlanSnapshotAndReturnGarbage(
                eq(projectId),
                any(JsonNode.class),
                eq(0)
        )).willReturn(List.of());

        workspaceFloorPlanRealtimeService.publishFloorPlanUpdatedFromGenerate(
                projectId,
                revisionId,
                parentRevisionId,
                s3Url
        );

        ArgumentCaptor<FloorPlanProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(FloorPlanProjectSyncResponse.class);
        verify(simpMessagingTemplate).convertAndSend(
                eq("/topic/project/%s/floor-plan/sync".formatted(projectId)),
                responseCaptor.capture()
        );

        FloorPlanProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("FLOOR_PLAN_GENERATE_COMPLETED");
        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.revisionId()).isEqualTo(revisionId.toString());
        assertThat(response.s3Url()).isEqualTo(s3Url);
        assertThat(response.floorPlanPayloadJson().get("baseIndex").asInt()).isEqualTo(0);
        assertThat(response.floorPlanPayloadJson().get("revisionId").asText()).isEqualTo(revisionId.toString());
        assertThat(response.floorPlanPayloadJson().get("parentRevisionId").asText()).isEqualTo(parentRevisionId.toString());
        assertThat(response.floorPlanPayloadJson().get("bubbles").isArray()).isTrue();
        assertThat(response.floorPlanPayloadJson().get("connections").isArray()).isTrue();
        assertThat(response.floorPlanPayloadJson().get("floorMeta").isNull()).isTrue();

        ArgumentCaptor<JsonNode> snapshotCaptor = ArgumentCaptor.forClass(JsonNode.class);
        verify(workspaceBubbleSnapshotRedisRepository, times(2)).saveFloorPlanSnapshotAndReturnGarbage(
                eq(projectId),
                snapshotCaptor.capture(),
                anyInt()
        );

        JsonNode baselineSnapshot = snapshotCaptor.getAllValues().get(0);
        assertThat(baselineSnapshot.get("s3Url").isNull()).isTrue();
        assertThat(baselineSnapshot.get("floorPlanPayloadJson").get("baseIndex").asInt()).isEqualTo(-1);
        assertThat(baselineSnapshot.get("floorPlanPayloadJson").get("revisionId").isNull()).isTrue();

        JsonNode generatedSnapshot = snapshotCaptor.getAllValues().get(1);
        assertThat(generatedSnapshot.get("s3Url").asText()).isEqualTo(s3Url);
        assertThat(generatedSnapshot.get("floorPlanPayloadJson").get("baseIndex").asInt()).isEqualTo(0);
        assertThat(generatedSnapshot.get("floorPlanPayloadJson").get("revisionId").asText()).isEqualTo(revisionId.toString());
    }

    @Test
    void relayIfcEditDlqFailureAndRestoreSource_broadcastsSourceRevisionAndNotifiesUser() throws Exception {
        UUID sourceRevisionId = UUID.randomUUID();
        UUID requestedBy = UUID.randomUUID();
        ReflectionTestUtils.setField(workspace, "currentRevision", sourceRevisionId.toString());
        JsonNode latestSnapshot = objectMapper.readTree("""
                {
                  "floorPlanPayloadJson": {
                    "baseIndex": 4,
                    "revisionId": "%s",
                    "bubbles": [{"id": "bubble-restore"}],
                    "connections": []
                  },
                  "s3Url": "s3://bucket/projects/%s/revisions/%s/ifc/model.v1.ifc"
                }
                """.formatted(sourceRevisionId, projectId, sourceRevisionId));
        JsonNode olderSnapshot = objectMapper.readTree("""
                {
                  "floorPlanPayloadJson": {
                    "baseIndex": 3,
                    "revisionId": "%s",
                    "bubbles": [{"id": "bubble-old"}],
                    "connections": []
                  },
                  "s3Url": "s3://bucket/projects/%s/revisions/%s/ifc/model.v1.ifc"
                }
                """.formatted(UUID.randomUUID(), projectId, UUID.randomUUID()));

        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId))
                .willReturn(Optional.of(workspace));
        given(workspaceBubbleSnapshotRedisRepository.getFloorPlanSnapshotHistorySize(projectId))
                .willReturn(2);
        given(workspaceBubbleSnapshotRedisRepository.findFloorPlanSnapshotByIndex(projectId, 1))
                .willReturn(olderSnapshot);
        given(workspaceBubbleSnapshotRedisRepository.findFloorPlanSnapshotByIndex(projectId, 0))
                .willReturn(latestSnapshot);

        workspaceFloorPlanRealtimeService.relayIfcEditDlqFailureAndRestoreSource(
                projectId,
                sourceRevisionId,
                requestedBy,
                "편집 작업이 실패해 이전 상태로 복구했습니다."
        );

        ArgumentCaptor<Object> userErrorCaptor = ArgumentCaptor.forClass(Object.class);
        verify(simpMessagingTemplate).convertAndSendToUser(
                eq(requestedBy.toString()),
                eq("/queue/errors"),
                userErrorCaptor.capture()
        );
        assertThat(userErrorCaptor.getValue()).isInstanceOf(ErrorResponse.class);
        ErrorResponse errorResponse = (ErrorResponse) userErrorCaptor.getValue();
        assertThat(errorResponse.getCode()).isEqualTo(ErrorCode.IFC_EDIT_COMMAND_DLQ.getCode());
        assertThat(errorResponse.getMessage()).isEqualTo("편집 작업이 실패해 이전 상태로 복구했습니다.");

        ArgumentCaptor<FloorPlanProjectSyncResponse> responseCaptor = ArgumentCaptor.forClass(FloorPlanProjectSyncResponse.class);
        verify(simpMessagingTemplate).convertAndSend(
                eq("/topic/project/%s/floor-plan/sync".formatted(projectId)),
                responseCaptor.capture()
        );

        FloorPlanProjectSyncResponse response = responseCaptor.getValue();
        assertThat(response.action()).isEqualTo("FLOOR_PLAN_UPDATED");
        assertThat(response.revisionId()).isEqualTo(sourceRevisionId.toString());
        assertThat(response.s3Url()).isEqualTo(
                "projects/%s/revisions/%s/ifc/model.v1.ifc".formatted(projectId, sourceRevisionId)
        );
        assertThat(response.floorPlanPayloadJson().get("revisionId").asText()).isEqualTo(sourceRevisionId.toString());
        assertThat(response.floorPlanPayloadJson().get("baseIndex").asInt()).isEqualTo(4);
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

    private WorkspaceCommand createWorkspaceCommand(String op) {
        JsonNode data = objectMapper.createObjectNode()
                .put("ifcClass", "IfcWall")
                .put("storeyGlobalId", "storey-1");
        JsonNode patch = objectMapper.createObjectNode()
                .put("lengthMm", 3000.0);

        return new WorkspaceCommand(
                op,
                "wall",
                "global-id-1",
                "create".equals(op) ? data : null,
                "update".equals(op) ? patch : null,
                System.currentTimeMillis()
        );
    }
}
