package com.a204.batang.domain.floorplan.service;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
import com.a204.batang.domain.floorplan.dto.CreateFloorPlanGenerateRequest;
import com.a204.batang.domain.floorplan.dto.CreateFloorPlanGenerateResponse;
import com.a204.batang.domain.floorplan.dto.LayoutImportV2Payload;
import com.a204.batang.domain.floorplan.entity.FloorPlanJob;
import com.a204.batang.domain.floorplan.entity.FloorPlanJobStep;
import com.a204.batang.domain.floorplan.messaging.FloorPlanGenerateCommandPublisher;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanStatusChangedEvent;
import com.a204.batang.domain.floorplan.repository.FloorPlanJobRepository;
import com.a204.batang.domain.floorplan.repository.FloorPlanJobStepRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
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

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class FloorPlanGenerateCommandServiceTest {

    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private ProjectWorkspaceRepository projectWorkspaceRepository;
    @Mock
    private RevisionRepository revisionRepository;
    @Mock
    private ProjectAccessService projectAccessService;
    @Mock
    private FloorPlanJobRepository floorPlanJobRepository;
    @Mock
    private FloorPlanJobStepRepository floorPlanJobStepRepository;
    @Mock
    private FloorPlanLayoutImportMapper floorPlanLayoutImportMapper;
    @Mock
    private FloorPlanStoragePathBuilder floorPlanStoragePathBuilder;
    @Mock
    private FloorPlanGenerateCommandPublisher floorPlanGenerateCommandPublisher;
    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private FloorPlanGenerateCommandService floorPlanGenerateCommandService;

    private UUID projectId;
    private UUID userId;
    private Project project;
    private ProjectWorkspace workspace;
    private LayoutImportV2Payload layoutImportPayload;

    @BeforeEach
    void setUp() throws Exception {
        projectId = UUID.randomUUID();
        userId = UUID.randomUUID();

        project = Project.create("sample-project", "desc", userId);
        ReflectionTestUtils.setField(project, "projectId", projectId);
        ReflectionTestUtils.setField(project, "latestRevisionId", UUID.randomUUID());

        var constructor = ProjectWorkspace.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        workspace = constructor.newInstance();
        ReflectionTestUtils.setField(workspace, "projectId", projectId);
        ReflectionTestUtils.setField(
                workspace,
                "bubbleSnapshotJson",
                objectMapper.readTree("""
                        {
                          "bubbles": [
                            {
                              "id": "bubble-1",
                              "label": "거실",
                              "type": "거실",
                              "x": 10.0,
                              "y": 20.0,
                              "width": 100.0,
                              "height": 80.0,
                              "widthMm": 4000.0,
                              "heightMm": 3200.0
                            }
                          ],
                          "connections": []
                        }
                        """)
        );

        layoutImportPayload = new LayoutImportV2Payload(
                "v2",
                projectId.toString(),
                "sample-project",
                List.of(new LayoutImportV2Payload.Room(
                        "room-1",
                        "거실",
                        "living",
                        4000,
                        3200,
                        1,
                        1000.0,
                        1500.0,
                        0.0,
                        false,
                        null
                )),
                null,
                List.of(new LayoutImportV2Payload.Adjacency("room-1", "room-2", 1.0)),
                null,
                new LayoutImportV2Payload.GenerationOptions(true, true, true, true, false),
                null,
                new LayoutImportV2Payload.GenerationPolicy("outer_boundary", "from_adjacency", "flat")
        );
    }

    @Test
    void createFloorPlanGenerate_createsReservedRowsAndPublishesCommand_forRawRequest() throws Exception {
        CreateFloorPlanGenerateRequest request = new CreateFloorPlanGenerateRequest(objectMapper.readTree("""
                {
                  "schema_version": "v2",
                  "id": "raw-id",
                  "name": "raw-name",
                  "rooms": [
                    {
                      "id": "room-1",
                      "name": "거실",
                      "type": "living",
                      "width": 4000,
                      "height": 3200,
                      "floor": 1,
                      "x": 1000.0,
                      "y": 1500.0,
                      "angle": 0.0,
                      "locked": false,
                      "zoneId": null
                    }
                  ],
                  "adjacency": [],
                  "generation_options": {
                    "generate_spaces": true,
                    "generate_walls": true,
                    "generate_slabs": true,
                    "generate_roof": true,
                    "generate_openings": false
                  },
                  "generation_policy": {
                    "boundary_wall_mode": "outer_boundary",
                    "shared_wall_policy": "from_adjacency",
                    "roof_shape": "flat"
                  }
                }
                """));

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId)).willReturn(Optional.empty());
        given(floorPlanLayoutImportMapper.fromRawRequest(eq(projectId), eq(project.getName()), any())).willReturn(layoutImportPayload);
        given(floorPlanStoragePathBuilder.buildIfcStorageUrl(eq(projectId), any()))
                .willAnswer(invocation -> "projects/" + projectId + "/revisions/" + invocation.getArgument(1) + "/model.ifc");
        given(floorPlanStoragePathBuilder.buildValidationReportStorageUrl(any(), eq(1)))
                .willAnswer(invocation -> "jobs/" + invocation.getArgument(0) + "/steps/1/validation-report.json");
        doNothing().when(floorPlanGenerateCommandPublisher).publish(any());

        CreateFloorPlanGenerateResponse response =
                floorPlanGenerateCommandService.createFloorPlanGenerate(projectId, userId, request);

        ArgumentCaptor<Revision> revisionCaptor = ArgumentCaptor.forClass(Revision.class);
        ArgumentCaptor<FloorPlanJob> jobCaptor = ArgumentCaptor.forClass(FloorPlanJob.class);
        ArgumentCaptor<FloorPlanJobStep> stepCaptor = ArgumentCaptor.forClass(FloorPlanJobStep.class);
        ArgumentCaptor<FloorPlanGenerateCommandMessage> commandCaptor =
                ArgumentCaptor.forClass(FloorPlanGenerateCommandMessage.class);

        verify(revisionRepository).save(revisionCaptor.capture());
        verify(floorPlanJobRepository).save(jobCaptor.capture());
        verify(floorPlanJobStepRepository).save(stepCaptor.capture());
        verify(floorPlanGenerateCommandPublisher).publish(commandCaptor.capture());
        verify(eventPublisher).publishEvent(any(FloorPlanStatusChangedEvent.class));

        Revision savedRevision = revisionCaptor.getValue();
        FloorPlanJob savedJob = jobCaptor.getValue();
        FloorPlanJobStep savedStep = stepCaptor.getValue();
        FloorPlanGenerateCommandMessage command = commandCaptor.getValue();

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.inputSource()).isEqualTo(FloorPlanConstants.INPUT_SOURCE_RAW_REQUEST);
        assertThat(response.status()).isEqualTo("QUEUED");
        assertThat(response.progress()).isZero();
        assertThat(response.jobId()).isNotNull();
        assertThat(response.jobStepId()).isNotNull();
        assertThat(response.targetRevisionId()).isNotNull();
        assertThat(response.expectedOutputArtifactId()).isNotNull();

        assertThat(savedRevision.getRevisionId()).isEqualTo(response.targetRevisionId());
        assertThat(savedRevision.getRevisionNo()).isEqualTo(1);
        assertThat(savedJob.getJobId()).isEqualTo(response.jobId());
        assertThat(savedJob.getJobType()).isEqualTo(FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE);
        assertThat(savedJob.getSourceSceneType()).isEqualTo(FloorPlanConstants.SOURCE_SCENE_TYPE_LAYOUT_IMPORT);
        assertThat(savedStep.getJobStepId()).isEqualTo(response.jobStepId());
        assertThat(savedStep.getCommandRoutingKey()).isEqualTo(RabbitMqConfig.IFC_GENERATE_COMMAND_ROUTING_KEY);
        assertThat(savedStep.getIdempotencyKey()).isEqualTo(response.jobId() + ":step-1:ifc-generate");

        assertThat(command.projectId()).isEqualTo(projectId);
        assertThat(command.jobId()).isEqualTo(response.jobId());
        assertThat(command.jobStepId()).isEqualTo(response.jobStepId());
        assertThat(command.targetRevisionId()).isEqualTo(response.targetRevisionId());
        assertThat(command.expectedOutputArtifactId()).isEqualTo(response.expectedOutputArtifactId());
        assertThat(command.sourceSceneType()).isEqualTo(FloorPlanConstants.SOURCE_SCENE_TYPE_LAYOUT_IMPORT);
        assertThat(command.routingKey()).isEqualTo(RabbitMqConfig.IFC_GENERATE_COMMAND_ROUTING_KEY);
        assertThat(command.payload().layoutImport()).isEqualTo(layoutImportPayload);

        JsonNode requestPayload = savedJob.getRequestPayload();
        assertThat(requestPayload.has("layout_import")).isTrue();
        assertThat(requestPayload.get("layout_import").get("schema_version").asText()).isEqualTo("v2");

        JsonNode inputPayload = savedStep.getInputPayload();
        assertThat(inputPayload.get("inputSource").asText()).isEqualTo(FloorPlanConstants.INPUT_SOURCE_RAW_REQUEST);
        assertThat(inputPayload.get("targetRevisionId").asText()).isEqualTo(response.targetRevisionId().toString());
    }

    @Test
    void createFloorPlanGenerate_usesSnapshotFallbackWhenRawBodyIsMissing() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId)).willReturn(Optional.empty());
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));
        given(floorPlanLayoutImportMapper.fromBubbleSnapshot(projectId, project.getName(), workspace.getBubbleSnapshotJson()))
                .willReturn(layoutImportPayload);
        given(floorPlanStoragePathBuilder.buildIfcStorageUrl(eq(projectId), any()))
                .willAnswer(invocation -> "projects/" + projectId + "/revisions/" + invocation.getArgument(1) + "/model.ifc");
        given(floorPlanStoragePathBuilder.buildValidationReportStorageUrl(any(), eq(1)))
                .willAnswer(invocation -> "jobs/" + invocation.getArgument(0) + "/steps/1/validation-report.json");

        CreateFloorPlanGenerateResponse response =
                floorPlanGenerateCommandService.createFloorPlanGenerate(projectId, userId, null);

        assertThat(response.inputSource()).isEqualTo(FloorPlanConstants.INPUT_SOURCE_WORKSPACE_SNAPSHOT);
        verify(floorPlanLayoutImportMapper).fromBubbleSnapshot(projectId, project.getName(), workspace.getBubbleSnapshotJson());
    }

    @Test
    void createFloorPlanGenerate_throwsWhenProjectDoesNotExist() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> floorPlanGenerateCommandService.createFloorPlanGenerate(projectId, userId, null))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_NOT_FOUND);
    }

    @Test
    void createFloorPlanGenerate_throwsWhenCurrentUserCannotBeResolved() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        doThrow(new CustomException(ErrorCode.UNAUTHORIZED))
                .when(projectAccessService).resolveCurrentUserIdOrThrow();

        assertThatThrownBy(() -> floorPlanGenerateCommandService.createFloorPlanGenerate(projectId, null, null))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.UNAUTHORIZED);
    }

    @Test
    void createFloorPlanGenerate_propagatesForbiddenAccess() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        doThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS))
                .when(projectAccessService).validateProjectOwnerOrThrow(project, userId);

        assertThatThrownBy(() -> floorPlanGenerateCommandService.createFloorPlanGenerate(projectId, userId, null))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);
    }

    @Test
    void createFloorPlanGenerate_throwsWhenSnapshotIsMissing() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> floorPlanGenerateCommandService.createFloorPlanGenerate(projectId, userId, null))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_SNAPSHOT_NOT_FOUND);
    }

    @Test
    void createFloorPlanGenerate_throwsWhenPublishFails() throws Exception {
        CreateFloorPlanGenerateRequest request = new CreateFloorPlanGenerateRequest(objectMapper.readTree("""
                {
                  "schema_version": "v2",
                  "id": "raw-id",
                  "name": "raw-name",
                  "rooms": [
                    {
                      "id": "room-1",
                      "name": "거실",
                      "type": "living",
                      "width": 4000,
                      "height": 3200,
                      "floor": 1,
                      "x": 1000.0,
                      "y": 1500.0,
                      "angle": 0.0,
                      "locked": false,
                      "zoneId": null
                    }
                  ],
                  "adjacency": [],
                  "generation_options": {
                    "generate_spaces": true,
                    "generate_walls": true,
                    "generate_slabs": true,
                    "generate_roof": true,
                    "generate_openings": false
                  },
                  "generation_policy": {
                    "boundary_wall_mode": "outer_boundary",
                    "shared_wall_policy": "from_adjacency",
                    "roof_shape": "flat"
                  }
                }
                """));

        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId)).willReturn(Optional.empty());
        given(floorPlanLayoutImportMapper.fromRawRequest(eq(projectId), eq(project.getName()), any())).willReturn(layoutImportPayload);
        given(floorPlanStoragePathBuilder.buildIfcStorageUrl(eq(projectId), any()))
                .willAnswer(invocation -> "projects/" + projectId + "/revisions/" + invocation.getArgument(1) + "/model.ifc");
        given(floorPlanStoragePathBuilder.buildValidationReportStorageUrl(any(), eq(1)))
                .willAnswer(invocation -> "jobs/" + invocation.getArgument(0) + "/steps/1/validation-report.json");
        doThrow(new CustomException(ErrorCode.FLOOR_PLAN_COMMAND_PUBLISH_FAILED))
                .when(floorPlanGenerateCommandPublisher).publish(any());

        assertThatThrownBy(() -> floorPlanGenerateCommandService.createFloorPlanGenerate(projectId, userId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_COMMAND_PUBLISH_FAILED);
    }
}
