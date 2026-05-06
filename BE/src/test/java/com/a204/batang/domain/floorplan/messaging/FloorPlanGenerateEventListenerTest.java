package com.a204.batang.domain.floorplan.messaging;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
import com.a204.batang.domain.floorplan.entity.FloorPlanArtifact;
import com.a204.batang.domain.floorplan.entity.FloorPlanJob;
import com.a204.batang.domain.floorplan.entity.FloorPlanJobStep;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateEventMessage;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanWorkerError;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanCommandPublishRequestedEvent;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanPublishFailedEvent;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanStatusChangedEvent;
import com.a204.batang.domain.floorplan.repository.FloorPlanArtifactRepository;
import com.a204.batang.domain.floorplan.repository.FloorPlanJobRepository;
import com.a204.batang.domain.floorplan.repository.FloorPlanJobStepRepository;
import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class FloorPlanGenerateEventListenerTest {

    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private ProjectAccessService projectAccessService;
    @Mock
    private ProjectWorkspaceRepository projectWorkspaceRepository;
    @Mock
    private RevisionRepository revisionRepository;
    @Mock
    private FloorPlanJobRepository floorPlanJobRepository;
    @Mock
    private FloorPlanJobStepRepository floorPlanJobStepRepository;
    @Mock
    private FloorPlanArtifactRepository floorPlanArtifactRepository;
    @Mock
    private NotificationSseService notificationSseService;
    @Mock
    private org.springframework.context.ApplicationEventPublisher eventPublisher;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private FloorPlanGenerateEventListener listener;

    private UUID projectId;
    private UUID jobId;
    private UUID jobStepId;
    private UUID revisionId;
    private UUID artifactId;
    private Project project;
    private ProjectWorkspace workspace;
    private Revision revision;
    private FloorPlanJob job;
    private FloorPlanJobStep step;

    @BeforeEach
    void setUp() throws Exception {
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
                revisionId,
                projectId,
                null,
                1,
                UUID.randomUUID(),
                null,
                null,
                LocalDateTime.now()
        );

        job = FloorPlanJob.createQueued(
                jobId,
                projectId,
                UUID.randomUUID(),
                null,
                null,
                FloorPlanConstants.SOURCE_SCENE_TYPE_LAYOUT_IMPORT,
                FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE,
                objectMapper.createObjectNode(),
                LocalDateTime.now()
        );

        step = FloorPlanJobStep.createQueued(
                jobStepId,
                jobId,
                1,
                FloorPlanConstants.WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE,
                FloorPlanConstants.COMMAND_ROUTING_KEY_IFC_GENERATE_FROM_BUBBLE,
                jobId + ":step-1:ifc-generate",
                objectMapper.valueToTree(Map.of(
                        "targetRevisionId", revisionId.toString(),
                        "expectedOutputArtifactId", artifactId.toString()
                )),
                LocalDateTime.now()
        );
    }

    @Test
    void handleStarted_updatesJobAndStepToRunning() {
        FloorPlanGenerateEventMessage event = startedEvent(0.2);
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("RUNNING");
        assertThat(step.getStatus()).isEqualTo("RUNNING");
        assertThat(job.getProgress()).isEqualTo(20);
        assertThat(step.getProgress()).isEqualTo(20);
        verify(eventPublisher).publishEvent(any(FloorPlanStatusChangedEvent.class));
    }

    @Test
    void handleProgress_convertsFractionToPercent() {
        FloorPlanGenerateEventMessage event = progressEvent(0.56);
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));

        listener.handle(event);

        assertThat(job.getProgress()).isEqualTo(56);
        assertThat(step.getProgress()).isEqualTo(56);
        assertThat(job.getStatus()).isEqualTo("RUNNING");
        assertThat(step.getStatus()).isEqualTo("RUNNING");
    }

    @Test
    void handleStarted_ignoresWhenJobAndStepAreAlreadyTerminal() {
        job.markSucceeded(objectMapper.createObjectNode(), LocalDateTime.now());
        step.markSucceeded(objectMapper.createObjectNode(), LocalDateTime.now());
        FloorPlanGenerateEventMessage event = startedEvent(0.2);

        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));

        listener.handle(event);

        verify(eventPublisher, never()).publishEvent(any());
        assertThat(job.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(step.getStatus()).isEqualTo("SUCCEEDED");
    }

    @Test
    void handleProgress_ignoresWhenJobAndStepAreAlreadyTerminal() {
        job.markFailed("failed", objectMapper.createObjectNode(), LocalDateTime.now());
        step.markFailed("failed", "failed", objectMapper.createObjectNode(), LocalDateTime.now());
        FloorPlanGenerateEventMessage event = progressEvent(0.56);

        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));

        listener.handle(event);

        verify(eventPublisher, never()).publishEvent(any());
        assertThat(job.getProgress()).isEqualTo(0);
        assertThat(step.getProgress()).isEqualTo(0);
    }

    @Test
    void handleCompleted_updatesStateAndSavesArtifacts() {
        FloorPlanGenerateEventMessage event = completedEvent(
                "projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc",
                "projects/" + projectId + "/jobs/" + jobId + "/steps/001/engine/validation-report.v1.json"
        );
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));
        given(floorPlanArtifactRepository.findByArtifactId(artifactId)).willReturn(Optional.empty());
        given(floorPlanArtifactRepository.existsByProjectIdAndJobIdAndArtifactType(
                projectId, jobId, FloorPlanConstants.ARTIFACT_TYPE_VALIDATION_REPORT
        )).willReturn(false);
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(step.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(revision.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(project.getLatestRevisionId()).isEqualTo(revisionId);
        assertThat(workspace.getIfcStorageUrl()).isEqualTo("projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc");
        assertThat(workspace.getCurrentRevision()).isEqualTo(revisionId.toString());
        verify(floorPlanArtifactRepository, times(2)).save(any(FloorPlanArtifact.class));
        verify(eventPublisher).publishEvent(any(FloorPlanStatusChangedEvent.class));
    }

    @Test
    void handleCompleted_savesIfcArtifactOnlyWhenValidationReportIsMissing() {
        FloorPlanGenerateEventMessage event = completedEvent(
                "projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc",
                null
        );
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));
        given(floorPlanArtifactRepository.findByArtifactId(artifactId)).willReturn(Optional.empty());
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)).willReturn(Optional.of(workspace));

        listener.handle(event);

        verify(floorPlanArtifactRepository, times(1)).save(any(FloorPlanArtifact.class));
    }

    @Test
    void handleFailed_marksJobStepAndRevisionFailed() {
        FloorPlanGenerateEventMessage event = failedEvent();
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        assertThat(revision.getStatus()).isEqualTo("FAILED");
        assertThat(job.getProgress()).isZero();
        assertThat(step.getProgress()).isZero();
        verify(eventPublisher).publishEvent(any(FloorPlanStatusChangedEvent.class));
        verify(projectRepository, never()).findByProjectIdAndDeletedAtIsNull(projectId);
    }

    @Test
    void handleClarificationRequired_marksFailed() {
        FloorPlanGenerateEventMessage event = clarificationEvent();
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        assertThat(revision.getStatus()).isEqualTo("FAILED");
    }

    @Test
    void handleIgnoresDuplicateTerminalEvents() {
        job.markFailed("failed", objectMapper.createObjectNode(), LocalDateTime.now());
        step.markFailed("failed", "failed", objectMapper.createObjectNode(), LocalDateTime.now());
        FloorPlanGenerateEventMessage event = completedEvent("s3://model.v1.ifc", null);

        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));

        listener.handle(event);

        verify(floorPlanArtifactRepository, never()).save(any());
        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void handleCompleted_throwsWhenStorageUrlIsMissing() {
        FloorPlanGenerateEventMessage event = completedEvent(null, null);
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));

        assertThatThrownBy(() -> listener.handle(event))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_EVENT_INVALID);
    }

    @Test
    void handleCompleted_throwsWhenTargetRevisionIdMismatches() {
        FloorPlanGenerateEventMessage event = new FloorPlanGenerateEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_COMPLETED,
                "event.ifc-generate.completed",
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                FloorPlanConstants.WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE,
                "worker-1",
                null,
                UUID.randomUUID(),
                artifactId,
                "completed",
                1.0,
                Map.of("storage_url", "s3://model.v1.ifc"),
                null,
                null,
                jobId + ":step-1:ifc-generate",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );

        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));

        assertThatThrownBy(() -> listener.handle(event))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_REVISION_NOT_FOUND);
    }

    @Test
    void handleCompleted_throwsWhenOutputArtifactIdMismatches() {
        FloorPlanGenerateEventMessage event = new FloorPlanGenerateEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_COMPLETED,
                "event.ifc-generate.completed",
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                FloorPlanConstants.WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE,
                "worker-1",
                null,
                revisionId,
                UUID.randomUUID(),
                "completed",
                1.0,
                Map.of("storage_url", "s3://model.v1.ifc"),
                null,
                null,
                jobId + ":step-1:ifc-generate",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );

        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));

        assertThatThrownBy(() -> listener.handle(event))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FLOOR_PLAN_EVENT_INVALID);
    }

    @Test
    void handleReturnsForNonTargetEvent() {
        FloorPlanGenerateEventMessage event = new FloorPlanGenerateEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                "SD_RENDER_GENERATE_STARTED",
                "event.sd-render.started",
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                "SD_RENDER",
                "worker-1",
                null,
                revisionId,
                artifactId,
                "started",
                0.1,
                null,
                null,
                null,
                "idempotency",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );

        listener.handle(event);

        verify(floorPlanJobRepository, never()).findByJobIdAndJobType(any(), any());
        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void handleFloorPlanStatusChanged_sendsNotificationAfterCommit() {
        FloorPlanStatusChangedEvent event = new FloorPlanStatusChangedEvent(
                projectId,
                FloorPlanConstants.SSE_FLOOR_PLAN_COMPLETED,
                new com.a204.batang.domain.floorplan.dto.FloorPlanStatusSseResponse(
                        FloorPlanConstants.SSE_FLOOR_PLAN_COMPLETED,
                        projectId,
                        jobId,
                        jobStepId,
                        revisionId,
                        "SUCCEEDED",
                        100,
                        null
                )
        );
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveProjectMemberUserIds(project)).willReturn(Set.of(UUID.randomUUID()));

        listener.handleFloorPlanStatusChanged(event);

        verify(notificationSseService).sendToUsers(any(), eq(FloorPlanConstants.SSE_FLOOR_PLAN_COMPLETED), eq(event.payload()));
    }

    @Test
    void handleFloorPlanStatusChanged_ignoresSseSendFailure() {
        FloorPlanStatusChangedEvent event = new FloorPlanStatusChangedEvent(
                projectId,
                FloorPlanConstants.SSE_FLOOR_PLAN_FAILED,
                new com.a204.batang.domain.floorplan.dto.FloorPlanStatusSseResponse(
                        FloorPlanConstants.SSE_FLOOR_PLAN_FAILED,
                        projectId,
                        jobId,
                        jobStepId,
                        revisionId,
                        "FAILED",
                        0,
                        "publish failed"
                )
        );
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveProjectMemberUserIds(project)).willReturn(Set.of(UUID.randomUUID()));
        doThrow(new RuntimeException("sse down"))
                .when(notificationSseService).sendToUsers(any(), eq(FloorPlanConstants.SSE_FLOOR_PLAN_FAILED), eq(event.payload()));

        listener.handleFloorPlanStatusChanged(event);

        verify(notificationSseService).sendToUsers(any(), eq(FloorPlanConstants.SSE_FLOOR_PLAN_FAILED), eq(event.payload()));
    }

    @Test
    void handlePublishFailed_retriesWhenNackAndAttemptsRemain() {
        FloorPlanPublishFailedEvent event = new FloorPlanPublishFailedEvent(commandMessage(1, 3), "nack", false);
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));

        listener.handlePublishFailed(event);

        verify(eventPublisher).publishEvent(any(FloorPlanCommandPublishRequestedEvent.class));
        assertThat(job.getStatus()).isEqualTo("QUEUED");
        assertThat(step.getStatus()).isEqualTo("QUEUED");
        assertThat(revision.getStatus()).isEqualTo("CREATING");
    }

    @Test
    void handlePublishFailed_marksFailedWhenNackExceedsMaxAttempts() {
        FloorPlanPublishFailedEvent event = new FloorPlanPublishFailedEvent(commandMessage(3, 3), "nack", false);
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));

        listener.handlePublishFailed(event);

        verify(eventPublisher, never()).publishEvent(any(FloorPlanCommandPublishRequestedEvent.class));
        verify(eventPublisher).publishEvent(any(FloorPlanStatusChangedEvent.class));
        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        assertThat(revision.getStatus()).isEqualTo("FAILED");
        assertThat(job.getProgress()).isZero();
        assertThat(step.getProgress()).isZero();
        assertThat(project.getLatestRevisionId()).isNull();
        assertThat(workspace.getIfcStorageUrl()).isNull();
        assertThat(workspace.getCurrentRevision()).isNull();
    }

    @Test
    void handlePublishFailed_marksFailedImmediatelyWhenReturned() {
        FloorPlanPublishFailedEvent event = new FloorPlanPublishFailedEvent(commandMessage(1, 3), "returned", true);
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));

        listener.handlePublishFailed(event);

        verify(eventPublisher, never()).publishEvent(any(FloorPlanCommandPublishRequestedEvent.class));
        verify(eventPublisher).publishEvent(any(FloorPlanStatusChangedEvent.class));
        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step.getStatus()).isEqualTo("FAILED");
        assertThat(revision.getStatus()).isEqualTo("FAILED");
        assertThat(job.getProgress()).isZero();
        assertThat(step.getProgress()).isZero();
        assertThat(project.getLatestRevisionId()).isNull();
        assertThat(workspace.getIfcStorageUrl()).isNull();
        assertThat(workspace.getCurrentRevision()).isNull();
    }

    @Test
    void handlePublishFailed_ignoresTerminalState() {
        job.markFailed("failed", objectMapper.createObjectNode(), LocalDateTime.now());
        step.markFailed("failed", "failed", objectMapper.createObjectNode(), LocalDateTime.now());
        revision.markFailed();
        FloorPlanPublishFailedEvent event = new FloorPlanPublishFailedEvent(commandMessage(1, 3), "nack", false);
        given(floorPlanJobRepository.findByJobIdAndJobType(jobId, FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE))
                .willReturn(Optional.of(job));
        given(floorPlanJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step));
        given(revisionRepository.findByRevisionId(revisionId)).willReturn(Optional.of(revision));

        listener.handlePublishFailed(event);

        verify(eventPublisher, never()).publishEvent(any(FloorPlanCommandPublishRequestedEvent.class));
        verify(eventPublisher, never()).publishEvent(any());
    }

    private FloorPlanGenerateEventMessage startedEvent(double progress) {
        return new FloorPlanGenerateEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_STARTED,
                "event.ifc-generate.started",
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                FloorPlanConstants.WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE,
                "worker-1",
                null,
                revisionId,
                artifactId,
                "started",
                progress,
                null,
                null,
                null,
                jobId + ":step-1:ifc-generate",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );
    }

    private FloorPlanGenerateEventMessage progressEvent(double progress) {
        return new FloorPlanGenerateEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_PROGRESS,
                "event.ifc-generate.progress",
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                FloorPlanConstants.WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE,
                "worker-1",
                null,
                revisionId,
                artifactId,
                "progress",
                progress,
                null,
                null,
                null,
                jobId + ":step-1:ifc-generate",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );
    }

    private FloorPlanGenerateEventMessage completedEvent(String storageUrl, String validationReportStorageUrl) {
        Map<String, Object> output = storageUrl == null
                ? Map.of()
                : validationReportStorageUrl == null
                ? Map.of("storage_url", storageUrl)
                : Map.of(
                "storage_url", storageUrl,
                "validation_report_storage_url", validationReportStorageUrl
        );

        return new FloorPlanGenerateEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_COMPLETED,
                "event.ifc-generate.completed",
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                FloorPlanConstants.WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE,
                "worker-1",
                null,
                revisionId,
                artifactId,
                "completed",
                1.0,
                output,
                null,
                null,
                jobId + ":step-1:ifc-generate",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );
    }

    private FloorPlanGenerateEventMessage failedEvent() {
        return new FloorPlanGenerateEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                FloorPlanConstants.EVENT_TYPE_IFC_GENERATE_FAILED,
                "event.ifc-generate.failed",
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                FloorPlanConstants.WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE,
                "worker-1",
                null,
                revisionId,
                artifactId,
                "failed",
                0.4,
                null,
                new FloorPlanWorkerError(
                        "IFC_FAILED",
                        "IFC 생성 실패",
                        true,
                        false,
                        "projects/" + projectId + "/jobs/" + jobId + "/steps/001/engine/validation-report.v1.json"
                ),
                null,
                jobId + ":step-1:ifc-generate",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );
    }

    private FloorPlanGenerateEventMessage clarificationEvent() {
        return new FloorPlanGenerateEventMessage(
                UUID.randomUUID(),
                "v1",
                "EVENT",
                "IFC_GENERATE_FROM_BUBBLE_CLARIFICATION_REQUIRED",
                "event.ifc-generate.clarification-required",
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                FloorPlanConstants.WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE,
                "worker-1",
                null,
                revisionId,
                artifactId,
                "clarification_required",
                0.4,
                null,
                null,
                UUID.randomUUID(),
                jobId + ":step-1:ifc-generate",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );
    }

    private FloorPlanGenerateCommandMessage commandMessage(int attemptNo, int maxAttempts) {
        return new FloorPlanGenerateCommandMessage(
                UUID.randomUUID(),
                "v1",
                "COMMAND",
                FloorPlanConstants.COMMAND_TYPE_IFC_GENERATE_FROM_BUBBLE,
                FloorPlanConstants.COMMAND_ROUTING_KEY_IFC_GENERATE_FROM_BUBBLE,
                jobId,
                jobStepId,
                1,
                1,
                projectId,
                UUID.randomUUID(),
                null,
                null,
                FloorPlanConstants.SOURCE_SCENE_TYPE_LAYOUT_IMPORT,
                revisionId,
                artifactId,
                null,
                new FloorPlanGenerateCommandMessage.ExpectedOutput(
                        "projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc",
                        null
                ),
                new FloorPlanGenerateCommandMessage.Payload(null),
                attemptNo,
                maxAttempts,
                jobId + ":step-1:ifc-generate",
                UUID.randomUUID(),
                OffsetDateTime.now(ZoneOffset.UTC)
        );
    }
}
