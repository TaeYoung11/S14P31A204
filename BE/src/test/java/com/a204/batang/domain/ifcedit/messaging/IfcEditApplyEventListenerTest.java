package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.dto.IfcEditStatusSseResponse;
import com.a204.batang.domain.ifcedit.entity.IfcEditArtifact;
import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import com.a204.batang.domain.ifcedit.entity.RevisionSceneState;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditEventMessage;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditWorkerError;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditPublishFailedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditStatusChangedEvent;
import com.a204.batang.domain.ifcedit.repository.IfcEditArtifactRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.a204.batang.domain.ifcedit.repository.RevisionSceneStateRepository;
import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.domain.workspace.service.WorkspaceFloorPlanRealtimeService;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class IfcEditApplyEventListenerTest {

    @Mock private ProjectRepository projectRepository;
    @Mock private ProjectAccessService projectAccessService;
    @Mock private ProjectWorkspaceRepository projectWorkspaceRepository;
    @Mock private RevisionRepository revisionRepository;
    @Mock private IfcEditJobRepository ifcEditJobRepository;
    @Mock private IfcEditJobStepRepository ifcEditJobStepRepository;
    @Mock private IfcEditArtifactRepository ifcEditArtifactRepository;
    @Mock private RevisionSceneStateRepository revisionSceneStateRepository;
    @Mock private IfcEditCommandPublisher ifcEditCommandPublisher;
    @Mock private NotificationSseService notificationSseService;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private WorkspaceFloorPlanRealtimeService workspaceFloorPlanRealtimeService;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private IfcEditApplyEventListener listener;

    private UUID projectId;
    private UUID jobId;
    private UUID jobStepId;
    private UUID revisionId;
    private UUID artifactId;
    private Project project;
    private ProjectWorkspace workspace;
    private Revision revision;
    private IfcEditJob job;
    private IfcEditJobStep step;

    @BeforeEach
    void setUp() throws Exception {
        objectMapper.findAndRegisterModules();

        projectId = UUID.randomUUID();
        jobId = UUID.randomUUID();
        jobStepId = UUID.randomUUID();
        revisionId = UUID.randomUUID();
        artifactId = UUID.randomUUID();

        project = Project.create("sample-project", "desc", UUID.randomUUID());
        ReflectionTestUtils.setField(project, "projectId", projectId);

        var workspaceConstructor = ProjectWorkspace.class.getDeclaredConstructor();
        workspaceConstructor.setAccessible(true);
        workspace = workspaceConstructor.newInstance();
        ReflectionTestUtils.setField(workspace, "projectId", projectId);

        revision = Revision.createCreating(
                revisionId, projectId, null, 1, UUID.randomUUID(), null, null, LocalDateTime.now()
        );

        job = IfcEditJob.createQueued(
                jobId, projectId, UUID.randomUUID(), null, UUID.randomUUID(),
                "IFC_MODEL", JOB_TYPE_IFC_EDIT, objectMapper.createObjectNode(), LocalDateTime.now()
        );

        step = IfcEditJobStep.createQueued(
                jobStepId, jobId, 1,
                WORKER_TYPE_IFC_EDIT_APPLY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY,
                jobId + ":step-1:ifc-edit-apply",
                objectMapper.valueToTree(Map.of(
                        "targetRevisionId", revisionId.toString(),
                        "expectedOutputArtifactId", artifactId.toString(),
                        "sceneSnapshotStorageUrl", "projects/" + projectId + "/revisions/" + revisionId + "/ifc/snapshot.v1.json"
                )),
                LocalDateTime.now()
        );
    }

    @Test
    void handleStarted_updatesJobAndStepToRunning() {
        IfcEditEventMessage event = startedEvent(0.2);
        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("RUNNING");
        assertThat(step.getStatus()).isEqualTo("RUNNING");
        assertThat(job.getProgress()).isEqualTo(20);
        assertThat(step.getProgress()).isEqualTo(20);
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
    }

    @Test
    void handleStarted_ignoresWhenTerminal() {
        job.markSucceeded(objectMapper.createObjectNode(), LocalDateTime.now());
        step.markSucceeded(objectMapper.createObjectNode(), LocalDateTime.now());
        IfcEditEventMessage event = startedEvent(0.2);
        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));

        listener.handle(event);

        verify(eventPublisher, never()).publishEvent(any());
        assertThat(job.getStatus()).isEqualTo("SUCCEEDED");
    }

    @Test
    void handleProgress_convertsFractionToPercent() {
        IfcEditEventMessage event = progressEvent(0.56);
        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));

        listener.handle(event);

        assertThat(job.getProgress()).isEqualTo(56);
        assertThat(step.getProgress()).isEqualTo(56);
    }

    @Test
    void handleCompleted_updatesStateAndSavesArtifacts() {
        String ifcUrl = "projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc";
        String validationUrl = "projects/" + projectId + "/jobs/" + jobId + "/steps/001/engine/validation-report.v1.json";
        IfcEditEventMessage event = completedEvent(ifcUrl, validationUrl);

        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));
        given(ifcEditArtifactRepository.findByArtifactId(artifactId)).willReturn(Optional.empty());
        given(ifcEditArtifactRepository.existsByProjectIdAndJobIdAndArtifactType(
                projectId, jobId, ARTIFACT_TYPE_VALIDATION_REPORT)).willReturn(false);
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(step.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(revision.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(project.getLatestRevisionId()).isEqualTo(revisionId);
        assertThat(workspace.getIfcStorageUrl()).isEqualTo(ifcUrl);
        verify(ifcEditArtifactRepository, times(2)).save(any(IfcEditArtifact.class));
        verify(revisionSceneStateRepository).save(any(RevisionSceneState.class));
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
    }

    @Test
    void handleCompleted_twoDJob_broadcastsFloorPlanSyncImmediately() throws Exception {
        String ifcUrl = "projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc";
        IfcEditEventMessage event = completedEvent(ifcUrl, null);
        UUID sourceRevisionId = UUID.randomUUID();
        var sourceScene = objectMapper.readTree("""
                {
                  "baseIndex": 0,
                  "bubbles": [{"id": "bubble-1"}],
                  "connections": [],
                  "layout": {"message": "update"}
                }
                """);

        var requestPayload = objectMapper.createObjectNode();
        requestPayload.set("source_scene", sourceScene);

        IfcEditJob twoDJob = IfcEditJob.createQueued(
                jobId, projectId, UUID.randomUUID(), null, sourceRevisionId,
                "IFC_MODEL", JOB_TYPE_TWO_D_TO_IFC_EDIT,
                requestPayload,
                LocalDateTime.now()
        );

        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(twoDJob));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));
        given(ifcEditArtifactRepository.findByArtifactId(artifactId)).willReturn(Optional.empty());
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));

        listener.handle(event);

        ArgumentCaptor<com.fasterxml.jackson.databind.JsonNode> sourceSceneCaptor =
                ArgumentCaptor.forClass(com.fasterxml.jackson.databind.JsonNode.class);
        verify(workspaceFloorPlanRealtimeService).publishFloorPlanUpdatedFromIfcEdit(
                eq(projectId),
                eq(revisionId),
                eq(sourceRevisionId),
                eq(ifcUrl),
                sourceSceneCaptor.capture()
        );
        assertThat(sourceSceneCaptor.getValue().get("baseIndex").asInt()).isEqualTo(0);
    }

    @Test
    void handleCompleted_directIfcEditJobWithFloorPlanEngineRequest_broadcastsFloorPlanSyncImmediately() throws Exception {
        String ifcUrl = "projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc";
        IfcEditEventMessage event = completedEvent(ifcUrl, null);
        UUID sourceRevisionId = UUID.randomUUID();
        var engineRequest = objectMapper.readTree("""
                {
                  "baseIndex": 1,
                  "bubbles": [{"id": "bubble-2"}],
                  "connections": [],
                  "layout": {"message": "move wall"}
                }
                """);

        var requestPayload = objectMapper.createObjectNode();
        requestPayload.set("engine_request", engineRequest);

        IfcEditJob directJob = IfcEditJob.createQueued(
                jobId, projectId, UUID.randomUUID(), null, sourceRevisionId,
                "IFC_MODEL", JOB_TYPE_IFC_EDIT,
                requestPayload,
                LocalDateTime.now()
        );

        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(directJob));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));
        given(ifcEditArtifactRepository.findByArtifactId(artifactId)).willReturn(Optional.empty());
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));

        listener.handle(event);

        ArgumentCaptor<com.fasterxml.jackson.databind.JsonNode> sourceSceneCaptor =
                ArgumentCaptor.forClass(com.fasterxml.jackson.databind.JsonNode.class);
        verify(workspaceFloorPlanRealtimeService).publishFloorPlanUpdatedFromIfcEdit(
                eq(projectId),
                eq(revisionId),
                eq(sourceRevisionId),
                eq(ifcUrl),
                sourceSceneCaptor.capture()
        );
        assertThat(sourceSceneCaptor.getValue().get("baseIndex").asInt()).isEqualTo(1);
    }

    @Test
    void handleCompleted_directIfcEditJobWithoutFloorPlanPayload_broadcastsGenerateFallbackWithS3Url() {
        String ifcUrl = "projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc";
        IfcEditEventMessage event = completedEvent(ifcUrl, null);
        UUID sourceRevisionId = UUID.randomUUID();

        IfcEditJob directJob = IfcEditJob.createQueued(
                jobId, projectId, UUID.randomUUID(), null, sourceRevisionId,
                "IFC_MODEL", JOB_TYPE_IFC_EDIT,
                objectMapper.createObjectNode(),
                LocalDateTime.now()
        );

        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(directJob));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));
        given(ifcEditArtifactRepository.findByArtifactId(artifactId)).willReturn(Optional.empty());
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));

        listener.handle(event);

        verify(workspaceFloorPlanRealtimeService).publishFloorPlanUpdatedFromGenerate(
                eq(projectId),
                eq(revisionId),
                eq(sourceRevisionId),
                eq(ifcUrl)
        );
    }

    @Test
    void handleCompleted_savesIfcArtifactOnlyWhenValidationReportMissing() {
        String ifcUrl = "projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc";
        IfcEditEventMessage event = completedEvent(ifcUrl, null);

        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));
        given(ifcEditArtifactRepository.findByArtifactId(artifactId)).willReturn(Optional.empty());
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));

        listener.handle(event);

        verify(ifcEditArtifactRepository, times(1)).save(any(IfcEditArtifact.class));
    }

    @Test
    void handleCompleted_terminalJob_ignored() {
        job.markFailed("failed", objectMapper.createObjectNode(), LocalDateTime.now());
        step.markFailed("failed", "failed", objectMapper.createObjectNode(), LocalDateTime.now());
        IfcEditEventMessage event = completedEvent("s3://model.ifc", null);

        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));

        listener.handle(event);

        verify(ifcEditArtifactRepository, never()).save(any());
        verify(revisionSceneStateRepository, never()).save(any());
        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void handleFailed_marksJobStepAndRevisionFailed() {
        IfcEditEventMessage event = failedEvent();

        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        assertThat(revision.getStatus()).isEqualTo("FAILED");
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
        verify(workspaceFloorPlanRealtimeService).notifyIfcEditFailureToUser(
                eq(job.getRequestedBy()),
                eq(ErrorCode.IFC_EDIT_COMMAND_DLQ),
                eq("IFC 편집 실패")
        );
        verify(projectRepository, never()).findByProjectIdAndDeletedAtIsNull(any());
    }

    @Test
    void handlePublishFailed_nack_retries() {
        IfcEditPublishFailedEvent event = new IfcEditPublishFailedEvent(commandMessage(1, 3), "nack", false);
        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));

        listener.handlePublishFailed(event);

        verify(ifcEditCommandPublisher).publish(any(IfcEditCommandMessage.class));
        assertThat(job.getStatus()).isEqualTo("QUEUED");
        assertThat(step.getStatus()).isEqualTo("QUEUED");
        assertThat(revision.getStatus()).isEqualTo("CREATING");
    }

    @Test
    void handlePublishFailed_nack_maxAttempt_fails() {
        IfcEditPublishFailedEvent event = new IfcEditPublishFailedEvent(commandMessage(3, 3), "nack", false);
        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));

        listener.handlePublishFailed(event);

        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
        verify(workspaceFloorPlanRealtimeService).notifyIfcEditFailureToUser(
                eq(job.getRequestedBy()),
                eq(ErrorCode.IFC_EDIT_COMMAND_CONFIRM_NACK),
                anyString()
        );
        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        assertThat(revision.getStatus()).isEqualTo("FAILED");
    }

    @Test
    void handlePublishFailed_returned_immediatelyFails() {
        IfcEditPublishFailedEvent event = new IfcEditPublishFailedEvent(commandMessage(1, 3), "returned", true);
        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));

        listener.handlePublishFailed(event);

        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
        verify(workspaceFloorPlanRealtimeService).notifyIfcEditFailureToUser(
                eq(job.getRequestedBy()),
                eq(ErrorCode.IFC_EDIT_COMMAND_RETURNED),
                anyString()
        );
        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        assertThat(revision.getStatus()).isEqualTo("FAILED");
    }

    @Test
    void handlePublishFailed_ignoresTerminalState() {
        job.markFailed("failed", objectMapper.createObjectNode(), LocalDateTime.now());
        step.markFailed("failed", "failed", objectMapper.createObjectNode(), LocalDateTime.now());
        revision.markFailed();
        IfcEditPublishFailedEvent event = new IfcEditPublishFailedEvent(commandMessage(1, 3), "nack", false);
        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));

        listener.handlePublishFailed(event);

        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void handleDlq_marksJobFailedAndRelaysRollback() throws Exception {
        UUID sourceRevisionId = UUID.randomUUID();
        UUID requestedBy = UUID.randomUUID();
        IfcEditJob dlqJob = IfcEditJob.createQueued(
                jobId, projectId, requestedBy, null, sourceRevisionId,
                "IFC_MODEL", JOB_TYPE_IFC_EDIT, objectMapper.createObjectNode(), LocalDateTime.now()
        );

        given(ifcEditJobRepository.findByJobId(jobId)).willReturn(Optional.of(dlqJob));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId)).willReturn(Optional.of(step));
        given(revisionRepository.findById(revisionId)).willReturn(Optional.of(revision));

        String commandJson = """
                {
                  "message_id": "%s",
                  "schema_version": "v1",
                  "message_type": "COMMAND",
                  "command_type": "IFC_EDIT_APPLY",
                  "routing_key": "command.ifc-edit.apply",
                  "job_id": "%s",
                  "job_step_id": "%s",
                  "step_no": 1,
                  "total_steps": 1,
                  "project_id": "%s",
                  "requested_by": "%s",
                  "source_revision_id": "%s",
                  "source_scene_type": "IFC_MODEL",
                  "target_revision_id": "%s",
                  "attempt_no": 1,
                  "max_attempts": 3,
                  "idempotency_key": "%s",
                  "correlation_id": "%s",
                  "created_at": "%s"
                }
                """.formatted(
                UUID.randomUUID(),
                jobId,
                jobStepId,
                projectId,
                requestedBy,
                sourceRevisionId,
                revisionId,
                jobId + ":step-1:ifc-edit-apply",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );
        var amqpMessage = MessageBuilder.withBody(commandJson.getBytes())
                .setContentType("application/json")
                .setHeader("x-death", "rejected")
                .build();

        listener.handleDlq(amqpMessage);

        assertThat(dlqJob.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        assertThat(revision.getStatus()).isEqualTo("FAILED");
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
        verify(workspaceFloorPlanRealtimeService).relayIfcEditDlqFailureAndRestoreSource(
                eq(projectId),
                eq(sourceRevisionId),
                eq(requestedBy),
                eq(ErrorCode.IFC_EDIT_COMMAND_DLQ.getMessage())
        );
    }

    @Test
    void handleIfcEditStatusChanged_sendsNotificationAfterCommit() {
        IfcEditStatusChangedEvent event = new IfcEditStatusChangedEvent(
                projectId,
                SSE_IFC_EDIT_COMPLETED,
                new IfcEditStatusSseResponse(
                        SSE_IFC_EDIT_COMPLETED, projectId, jobId, jobStepId,
                        revisionId, JOB_TYPE_IFC_EDIT, "SUCCEEDED", 100, null
                )
        );
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveProjectMemberUserIds(project)).willReturn(Set.of(UUID.randomUUID()));

        listener.handleIfcEditStatusChanged(event);

        verify(notificationSseService).sendToUsers(any(), eq(SSE_IFC_EDIT_COMPLETED), eq(event.payload()));
    }

    @Test
    void handleIfcEditStatusChanged_ignoresSseSendFailure() {
        IfcEditStatusChangedEvent event = new IfcEditStatusChangedEvent(
                projectId,
                SSE_IFC_EDIT_FAILED,
                new IfcEditStatusSseResponse(
                        SSE_IFC_EDIT_FAILED, projectId, jobId, jobStepId,
                        revisionId, JOB_TYPE_IFC_EDIT, "FAILED", 0, "publish failed"
                )
        );
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveProjectMemberUserIds(project)).willReturn(Set.of(UUID.randomUUID()));
        doThrow(new RuntimeException("sse down"))
                .when(notificationSseService).sendToUsers(any(), eq(SSE_IFC_EDIT_FAILED), eq(event.payload()));

        listener.handleIfcEditStatusChanged(event);

        verify(notificationSseService).sendToUsers(any(), eq(SSE_IFC_EDIT_FAILED), eq(event.payload()));
    }

    private IfcEditEventMessage buildEvent(String eventType, Map<String, Object> output,
                                           IfcEditWorkerError error, double progress) {
        return new IfcEditEventMessage(
                UUID.randomUUID(), "v1", "EVENT", eventType,
                "event.ifc-edit.apply",
                jobId, jobStepId, 1, 1,
                projectId, WORKER_TYPE_IFC_EDIT_APPLY, "worker-1",
                UUID.randomUUID(), revisionId, artifactId,
                "started", progress,
                output, error,
                jobId + ":step-1:ifc-edit-apply",
                UUID.randomUUID(), OffsetDateTime.now(ZoneOffset.UTC)
        );
    }

    private IfcEditEventMessage startedEvent(double progress) {
        return buildEvent(EVENT_IFC_EDIT_APPLY_STARTED, null, null, progress);
    }

    private IfcEditEventMessage progressEvent(double progress) {
        return buildEvent(EVENT_IFC_EDIT_APPLY_PROGRESS, null, null, progress);
    }

    private IfcEditEventMessage completedEvent(String storageUrl, String validationReportStorageUrl) {
        Map<String, Object> output = storageUrl == null
                ? Map.of()
                : validationReportStorageUrl == null
                ? Map.of("storage_url", storageUrl)
                : Map.of("storage_url", storageUrl, "validation_report_storage_url", validationReportStorageUrl);
        return buildEvent(EVENT_IFC_EDIT_APPLY_COMPLETED, output, null, 1.0);
    }

    private IfcEditEventMessage failedEvent() {
        return buildEvent(
                EVENT_IFC_EDIT_APPLY_FAILED,
                null,
                new IfcEditWorkerError("IFC_APPLY_FAILED", "IFC 편집 실패", true, false, null),
                0.4
        );
    }

    private IfcEditCommandMessage commandMessage(int attemptNo, int maxAttempts) {
        return commandMessage(attemptNo, maxAttempts, UUID.randomUUID(), UUID.randomUUID());
    }

    private IfcEditCommandMessage commandMessage(
            int attemptNo,
            int maxAttempts,
            UUID sourceRevisionId,
            UUID requestedBy
    ) {
        return new IfcEditCommandMessage(
                UUID.randomUUID(), "v1", "COMMAND",
                COMMAND_TYPE_IFC_EDIT_APPLY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY,
                jobId, jobStepId, 1, TOTAL_STEPS_DIRECT,
                projectId, requestedBy, sourceRevisionId, null, "IFC_MODEL",
                revisionId, artifactId,
                Map.of("source_ifc_storage_url", "projects/p/revisions/r/ifc/model.v1.ifc"),
                new IfcEditCommandMessage.ExpectedOutput(
                        "projects/p/revisions/new/ifc/model.v1.ifc",
                        "projects/p/jobs/j/steps/001/engine/validation-report.v1.json",
                        null,
                        null
                ),
                objectMapper.createObjectNode(),
                attemptNo, maxAttempts,
                jobId + ":step-1:ifc-edit-apply",
                UUID.randomUUID(), OffsetDateTime.now(ZoneOffset.UTC)
        );
    }
}
