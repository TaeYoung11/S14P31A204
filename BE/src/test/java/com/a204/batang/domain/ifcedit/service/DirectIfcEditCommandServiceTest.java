package com.a204.batang.domain.ifcedit.service;

import com.a204.batang.domain.ifcedit.dto.DirectIfcEditRequest;
import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditCommandPublishRequestedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditStatusChangedEvent;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
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

import java.util.Optional;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.COMMAND_TYPE_IFC_EDIT_APPLY;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.JOB_TYPE_IFC_EDIT;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.TOTAL_STEPS_DIRECT;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.WORKER_TYPE_IFC_EDIT_APPLY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class DirectIfcEditCommandServiceTest {

    @Mock private ProjectRepository projectRepository;
    @Mock private RevisionRepository revisionRepository;
    @Mock private ProjectAccessService projectAccessService;
    @Mock private IfcEditJobRepository ifcEditJobRepository;
    @Mock private IfcEditJobStepRepository ifcEditJobStepRepository;
    @Mock private IfcEditStoragePathBuilder pathBuilder;
    @Mock private ApplicationEventPublisher eventPublisher;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private DirectIfcEditCommandService service;

    private UUID projectId;
    private UUID userId;
    private UUID baseRevisionId;
    private Project project;
    private Revision sourceRevision;

    @BeforeEach
    void setUp() throws Exception {
        projectId = UUID.randomUUID();
        userId = UUID.randomUUID();
        baseRevisionId = UUID.randomUUID();

        project = Project.create("test-project", "desc", userId);
        ReflectionTestUtils.setField(project, "projectId", projectId);
        ReflectionTestUtils.setField(project, "latestRevisionId", UUID.randomUUID());

        var revisionConstructor = Revision.class.getDeclaredConstructor();
        revisionConstructor.setAccessible(true);
        sourceRevision = revisionConstructor.newInstance();
        ReflectionTestUtils.setField(sourceRevision, "revisionId", baseRevisionId);
        ReflectionTestUtils.setField(sourceRevision, "projectId", projectId);
        ReflectionTestUtils.setField(sourceRevision, "revisionNo", 1);
    }

    @Test
    void createDirectIfcEdit_success_savesEntitiesAndSchedulesPublish() throws Exception {
        JsonNode engineRequest = objectMapper.readTree("{\"operation\": \"add_wall\"}");
        JsonNode sourceScenePayload = objectMapper.readTree("""
                {
                  "baseIndex": 9,
                  "revisionId": "abb0ee73-7523-4ccd-83a2-2a36990bdf8c",
                  "sceneType": "TWO_D",
                  "layout": {
                    "mode": "ifc",
                    "baseIndex": 9
                  }
                }
                """);
        DirectIfcEditRequest request = new DirectIfcEditRequest(
                "v1", UUID.randomUUID(), baseRevisionId,
                UUID.randomUUID(), "IFC_MODEL",
                engineRequest
        );

        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId))
                .willReturn(Optional.of(project));
        given(ifcEditJobRepository.existsByProjectIdAndJobTypeInAndStatusIn(any(UUID.class), anyCollection(), anyCollection()))
                .willReturn(false);
        given(revisionRepository.findById(baseRevisionId))
                .willReturn(Optional.of(sourceRevision));
        given(revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId))
                .willReturn(Optional.empty());
        given(pathBuilder.buildSourceIfcStorageUrl(any(), any())).willReturn("projects/p/revisions/r/ifc/model.v1.ifc");
        given(pathBuilder.buildOutputIfcStorageUrl(any(), any())).willReturn("projects/p/revisions/new/ifc/model.v1.ifc");
        given(pathBuilder.buildValidationReportStorageUrl(any(), any(), anyInt()))
                .willReturn("projects/p/jobs/j/steps/001/engine/validation-report.v1.json");
        given(pathBuilder.buildSceneSnapshotStorageUrl(any(), any(), any())).willReturn("projects/p/revisions/new/ifc/snapshot.v1.json");

        IfcEditJobResponse response = service.createDirectIfcEdit(projectId, userId, request, sourceScenePayload);

        ArgumentCaptor<Revision> revisionCaptor = ArgumentCaptor.forClass(Revision.class);
        ArgumentCaptor<IfcEditJob> jobCaptor = ArgumentCaptor.forClass(IfcEditJob.class);
        ArgumentCaptor<IfcEditJobStep> stepCaptor = ArgumentCaptor.forClass(IfcEditJobStep.class);
        ArgumentCaptor<IfcEditCommandPublishRequestedEvent> publishEventCaptor =
                ArgumentCaptor.forClass(IfcEditCommandPublishRequestedEvent.class);

        verify(revisionRepository).save(revisionCaptor.capture());
        verify(ifcEditJobRepository).save(jobCaptor.capture());
        verify(ifcEditJobStepRepository).save(stepCaptor.capture());
        verify(eventPublisher).publishEvent(publishEventCaptor.capture());
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.jobType()).isEqualTo(JOB_TYPE_IFC_EDIT);
        assertThat(response.status()).isEqualTo("QUEUED");
        assertThat(response.progress()).isZero();
        assertThat(response.targetRevisionId()).isNotNull();
        assertThat(response.expectedOutputArtifactId()).isNotNull();

        IfcEditJob savedJob = jobCaptor.getValue();
        assertThat(savedJob.getJobType()).isEqualTo(JOB_TYPE_IFC_EDIT);
        assertThat(savedJob.getStatus()).isEqualTo("QUEUED");
        assertThat(savedJob.getSourceRevisionId()).isEqualTo(baseRevisionId);
        assertThat(savedJob.getRequestPayload().get("engineRequest")).isEqualTo(engineRequest);
        assertThat(savedJob.getRequestPayload().get("sourceScenePayload")).isEqualTo(sourceScenePayload);

        IfcEditJobStep savedStep = stepCaptor.getValue();
        assertThat(savedStep.getWorkerType()).isEqualTo(WORKER_TYPE_IFC_EDIT_APPLY);
        assertThat(savedStep.getCommandRoutingKey()).isEqualTo(RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY);
        assertThat(savedStep.getIdempotencyKey()).isEqualTo(savedJob.getJobId() + ":step-1:ifc-edit-apply");

        IfcEditCommandMessage cmd = publishEventCaptor.getValue().message();
        assertThat(cmd.projectId()).isEqualTo(projectId);
        assertThat(cmd.commandType()).isEqualTo(COMMAND_TYPE_IFC_EDIT_APPLY);
        assertThat(cmd.routingKey()).isEqualTo(RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY);
        assertThat(cmd.totalSteps()).isEqualTo(TOTAL_STEPS_DIRECT);
        assertThat(cmd.payload().get("engineRequest")).isEqualTo(engineRequest);
        assertThat(cmd.payload().has("sourceScenePayload")).isFalse();

        assertThat(savedStep.getInputPayload().get("ifcStorageUrl").asText())
                .isEqualTo("projects/p/revisions/new/ifc/model.v1.ifc");
        assertThat(savedStep.getInputPayload().get("validationReportStorageUrl").asText())
                .isEqualTo("projects/p/jobs/j/steps/001/engine/validation-report.v1.json");
        assertThat(savedStep.getInputPayload().get("sceneSnapshotStorageUrl").asText())
                .isEqualTo("projects/p/revisions/new/ifc/snapshot.v1.json");
    }

    @Test
    void createDirectIfcEdit_conflict_throws409() {
        DirectIfcEditRequest request = new DirectIfcEditRequest(
                "v1", null, baseRevisionId, null, "IFC_MODEL",
                objectMapper.createObjectNode()
        );

        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId))
                .willReturn(Optional.of(project));
        given(ifcEditJobRepository.existsByProjectIdAndJobTypeInAndStatusIn(any(UUID.class), anyCollection(), anyCollection()))
                .willReturn(true);

        assertThatThrownBy(() -> service.createDirectIfcEdit(projectId, userId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.IFC_EDIT_JOB_CONFLICT);

        verify(revisionRepository, never()).save(any());
    }

    @Test
    void createDirectIfcEdit_baseRevisionNotFound_throws404() {
        DirectIfcEditRequest request = new DirectIfcEditRequest(
                "v1", null, baseRevisionId, null, "IFC_MODEL",
                objectMapper.createObjectNode()
        );

        given(projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId))
                .willReturn(Optional.of(project));
        given(ifcEditJobRepository.existsByProjectIdAndJobTypeInAndStatusIn(any(), any(), any()))
                .willReturn(false);
        given(revisionRepository.findById(baseRevisionId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> service.createDirectIfcEdit(projectId, userId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.IFC_EDIT_SOURCE_NOT_FOUND);

        verify(revisionRepository, never()).save(any());
    }
}
