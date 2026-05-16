package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditEventMessage;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditWorkerError;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditCommandPublishRequestedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditStatusChangedEvent;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.a204.batang.domain.ifcedit.service.IfcEditStoragePathBuilder;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.global.config.RabbitMqConfig;
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

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class TwoDLlmEventListenerTest {

    @Mock private IfcEditJobRepository ifcEditJobRepository;
    @Mock private IfcEditJobStepRepository ifcEditJobStepRepository;
    @Mock private RevisionRepository revisionRepository;
    @Mock private IfcEditStoragePathBuilder pathBuilder;
    @Mock private ApplicationEventPublisher eventPublisher;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private TwoDLlmEventListener listener;

    private UUID projectId;
    private UUID jobId;
    private UUID jobStepId;
    private UUID baseRevisionId;
    private IfcEditJob job;
    private IfcEditJobStep step1;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        jobId = UUID.randomUUID();
        jobStepId = UUID.randomUUID();
        baseRevisionId = UUID.randomUUID();

        job = IfcEditJob.createQueued(
                jobId, projectId, UUID.randomUUID(), null, baseRevisionId,
                "IFC_MODEL", JOB_TYPE_TWO_D_TO_IFC_EDIT, objectMapper.createObjectNode(), LocalDateTime.now()
        );

        step1 = IfcEditJobStep.createQueued(
                jobStepId, jobId, 1,
                WORKER_TYPE_TWO_D_LLM, RabbitMqConfig.TWO_D_LLM_COMMAND_ROUTING_KEY,
                jobId + ":step-1:two-d-llm",
                objectMapper.valueToTree(Map.of(
                        "sourceRevisionId", baseRevisionId.toString(),
                        "sourceIfcStorageUrl", "projects/" + projectId + "/revisions/" + baseRevisionId + "/ifc/model.v1.ifc",
                        "editPlanStorageUrl", "projects/" + projectId + "/jobs/" + jobId + "/steps/001/planner/2d-command.v1.json"
                )),
                LocalDateTime.now()
        );
    }

    @Test
    void handleStarted_updatesJobAndStepToRunning() {
        IfcEditEventMessage event = buildEvent(EVENT_TWO_D_LLM_STARTED, null, null, 0.2);

        given(ifcEditJobRepository.findByJobIdAndJobType(jobId, JOB_TYPE_TWO_D_TO_IFC_EDIT))
                .willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step1));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("RUNNING");
        assertThat(step1.getStatus()).isEqualTo("RUNNING");
        assertThat(job.getProgress()).isEqualTo(20);
        assertThat(step1.getProgress()).isEqualTo(20);
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
    }

    @Test
    void handleStarted_terminalState_ignored() {
        step1.markSucceeded(objectMapper.createObjectNode(), LocalDateTime.now());
        IfcEditEventMessage event = buildEvent(EVENT_TWO_D_LLM_STARTED, null, null, 0.2);

        given(ifcEditJobRepository.findByJobIdAndJobType(jobId, JOB_TYPE_TWO_D_TO_IFC_EDIT))
                .willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step1));

        listener.handle(event);

        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void handleCompleted_success_createsStep2AndRevision() {
        String editPlanUrl = "projects/" + projectId + "/jobs/" + jobId + "/steps/001/planner/2d-command.v1.json";
        IfcEditEventMessage event = completedEvent(editPlanUrl);

        given(ifcEditJobRepository.findByJobIdAndJobType(jobId, JOB_TYPE_TWO_D_TO_IFC_EDIT))
                .willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobIdAndStepNo(jobId, 1))
                .willReturn(Optional.of(step1));
        given(revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId))
                .willReturn(Optional.empty());
        given(pathBuilder.buildOutputIfcStorageUrl(any(), any())).willReturn("projects/p/revisions/new/ifc/model.v1.ifc");
        given(pathBuilder.buildValidationReportStorageUrl(any(), any(), anyInt()))
                .willReturn("projects/p/jobs/j/steps/002/engine/validation-report.v1.json");
        given(pathBuilder.buildSceneSnapshotStorageUrl(any(), any(), any())).willReturn("projects/p/revisions/new/ifc/snapshot.v1.json");

        listener.handle(event);

        ArgumentCaptor<IfcEditCommandPublishRequestedEvent> commandCaptor =
                ArgumentCaptor.forClass(IfcEditCommandPublishRequestedEvent.class);

        assertThat(step1.getStatus()).isEqualTo("SUCCEEDED");
        verify(revisionRepository).save(any(Revision.class));
        verify(ifcEditJobStepRepository).save(any(IfcEditJobStep.class));
        verify(eventPublisher).publishEvent(commandCaptor.capture());
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
        assertThat(commandCaptor.getValue().message().payload().get("commandJsonStorageUrl").asText())
                .isEqualTo(editPlanUrl);
        assertThat(commandCaptor.getValue().message().payload().has("command_json_storage_url")).isFalse();
    }

    @Test
    void handleCompleted_terminalStep_ignored() {
        step1.markSucceeded(objectMapper.createObjectNode(), LocalDateTime.now());
        IfcEditEventMessage event = completedEvent("projects/" + projectId + "/jobs/" + jobId + "/steps/001/planner/2d-command.v1.json");

        given(ifcEditJobRepository.findByJobIdAndJobType(jobId, JOB_TYPE_TWO_D_TO_IFC_EDIT))
                .willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobIdAndStepNo(jobId, 1))
                .willReturn(Optional.of(step1));

        listener.handle(event);

        verify(revisionRepository, never()).save(any());
        verify(ifcEditJobStepRepository, never()).save(any());
        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void handleFailed_noRevision_marksJobAndStepFailed() {
        IfcEditEventMessage event = failedEvent();

        given(ifcEditJobRepository.findByJobIdAndJobType(jobId, JOB_TYPE_TWO_D_TO_IFC_EDIT))
                .willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobIdAndStepNo(jobId, 1))
                .willReturn(Optional.of(step1));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step1.getStatus()).isEqualTo("FAILED");
        verify(revisionRepository, never()).save(any());
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
    }

    @Test
    void handleClarificationRequired_marksJobAndStepFailedWithClarificationPayload() {
        String detailStorageUrl = "s3://batang-artifacts/projects/p/clarification/detail.v1.json";
        IfcEditEventMessage event = buildEvent(
                EVENT_TWO_D_LLM_CLARIFICATION_REQUIRED,
                null,
                new IfcEditWorkerError(
                        "CLARIFICATION_REQUIRED",
                        "어느 방의 벽에 문을 만들까요?",
                        false,
                        true,
                        detailStorageUrl
                ),
                0.0
        );

        given(ifcEditJobRepository.findByJobIdAndJobType(jobId, JOB_TYPE_TWO_D_TO_IFC_EDIT))
                .willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobStepIdAndJobId(jobStepId, jobId))
                .willReturn(Optional.of(step1));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step1.getStatus()).isEqualTo("FAILED");
        assertThat(job.isTerminal()).isTrue();
        assertThat(job.getResultPayload().get("errorCode").asText())
                .isEqualTo("CLARIFICATION_REQUIRED");
        assertThat(job.getResultPayload().get("clarificationPossible").asBoolean()).isTrue();
        assertThat(job.getResultPayload().get("detailStorageUrl").asText())
                .isEqualTo(detailStorageUrl);
        assertThat(step1.getOutputPayload().get("clarificationPossible").asBoolean()).isTrue();

        ArgumentCaptor<IfcEditStatusChangedEvent> eventCaptor =
                ArgumentCaptor.forClass(IfcEditStatusChangedEvent.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue().eventName()).isEqualTo(SSE_IFC_EDIT_CLARIFICATION_REQUIRED);
        assertThat(eventCaptor.getValue().payload().status()).isEqualTo("FAILED");
    }

    private IfcEditEventMessage buildEvent(String eventType, Map<String, Object> output,
                                           IfcEditWorkerError error, double progress) {
        return new IfcEditEventMessage(
                UUID.randomUUID(), "v1", "EVENT", eventType,
                "event.two-d-llm.generate",
                jobId, jobStepId, 1, 2,
                projectId, WORKER_TYPE_TWO_D_LLM, "worker-1",
                baseRevisionId, null, null,
                "running", progress,
                output, error,
                jobId + ":step-1:two-d-llm",
                UUID.randomUUID(), OffsetDateTime.now(ZoneOffset.UTC)
        );
    }

    private IfcEditEventMessage completedEvent(String editPlanUrl) {
        return buildEvent(EVENT_TWO_D_LLM_COMPLETED, Map.of("storage_url", editPlanUrl), null, 1.0);
    }

    private IfcEditEventMessage failedEvent() {
        return buildEvent(
                EVENT_TWO_D_LLM_FAILED,
                null,
                new IfcEditWorkerError("TWO_D_LLM_FAILED", "2D LLM 실패", false, true, null),
                0.0
        );
    }
}
