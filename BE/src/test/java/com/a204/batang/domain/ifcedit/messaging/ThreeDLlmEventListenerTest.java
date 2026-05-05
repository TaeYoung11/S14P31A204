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
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ThreeDLlmEventListenerTest {

    @Mock private IfcEditJobRepository ifcEditJobRepository;
    @Mock private IfcEditJobStepRepository ifcEditJobStepRepository;
    @Mock private RevisionRepository revisionRepository;
    @Mock private IfcEditStoragePathBuilder pathBuilder;
    @Mock private ApplicationEventPublisher eventPublisher;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private ThreeDLlmEventListener listener;

    private UUID projectId;
    private UUID jobId;
    private UUID jobStepId;
    private UUID baseRevisionId;
    private IfcEditJob job;
    private IfcEditJobStep step1;

    @BeforeEach
    void setUp() throws Exception {
        projectId = UUID.randomUUID();
        jobId = UUID.randomUUID();
        jobStepId = UUID.randomUUID();
        baseRevisionId = UUID.randomUUID();

        job = IfcEditJob.createQueued(
                jobId, projectId, UUID.randomUUID(), null, baseRevisionId,
                "IFC_MODEL", JOB_TYPE_THREE_D_TO_IFC_EDIT, objectMapper.createObjectNode(), LocalDateTime.now()
        );

        step1 = IfcEditJobStep.createQueued(
                jobStepId, jobId, 1,
                WORKER_TYPE_THREE_D_LLM, RabbitMqConfig.THREE_D_LLM_COMMAND_ROUTING_KEY,
                jobId + ":step-1:three-d-llm",
                objectMapper.valueToTree(Map.of(
                        "sourceRevisionId", baseRevisionId.toString(),
                        "sourceIfcStorageUrl",
                        "projects/" + projectId + "/revisions/" + baseRevisionId + "/model.ifc",
                        "editPlanStorageUrl",
                        "jobs/" + jobId + "/steps/1/edit-plan.json"
                )),
                LocalDateTime.now()
        );
    }

    @Test
    void handle_nonMatchingPrefix_ignored() {
        IfcEditEventMessage event = buildEvent(EVENT_IFC_EDIT_APPLY_STARTED, null, null, 0.0);

        listener.handle(event);

        verify(ifcEditJobRepository, never()).findByJobIdAndJobType(any(), any());
        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void handleCompleted_success_createsStep2AndRevision() {
        String editPlanUrl = "jobs/" + jobId + "/steps/1/edit-plan.json";
        IfcEditEventMessage event = completedEvent(editPlanUrl);

        given(ifcEditJobRepository.findByJobIdAndJobType(jobId, JOB_TYPE_THREE_D_TO_IFC_EDIT))
                .willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobIdAndStepNo(jobId, 1))
                .willReturn(Optional.of(step1));
        given(revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId))
                .willReturn(Optional.empty());
        given(pathBuilder.buildOutputIfcStorageUrl(any(), any())).willReturn("projects/p/revisions/new/model.ifc");
        given(pathBuilder.buildValidationReportStorageUrl(any(), any())).willReturn("jobs/j/steps/2/validation-report.json");
        given(pathBuilder.buildSceneSnapshotStorageUrl(any(), any())).willReturn("projects/p/revisions/new/scene-ifc.json");

        listener.handle(event);

        assertThat(step1.getStatus()).isEqualTo("SUCCEEDED");
        verify(revisionRepository).save(any(Revision.class));
        verify(ifcEditJobStepRepository).save(any(IfcEditJobStep.class));
        verify(eventPublisher).publishEvent(any(IfcEditCommandPublishRequestedEvent.class));
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
    }

    @Test
    void handleCompleted_terminalStep_ignored() {
        step1.markSucceeded(objectMapper.createObjectNode(), LocalDateTime.now());
        IfcEditEventMessage event = completedEvent("jobs/" + jobId + "/steps/1/edit-plan.json");

        given(ifcEditJobRepository.findByJobIdAndJobType(jobId, JOB_TYPE_THREE_D_TO_IFC_EDIT))
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

        given(ifcEditJobRepository.findByJobIdAndJobType(jobId, JOB_TYPE_THREE_D_TO_IFC_EDIT))
                .willReturn(Optional.of(job));
        given(ifcEditJobStepRepository.findByJobIdAndStepNo(jobId, 1))
                .willReturn(Optional.of(step1));

        listener.handle(event);

        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(step1.getStatus()).isEqualTo("FAILED");
        verify(revisionRepository, never()).save(any());
        verify(eventPublisher).publishEvent(any(IfcEditStatusChangedEvent.class));
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    private IfcEditEventMessage buildEvent(String eventType, Map<String, Object> output,
                                           IfcEditWorkerError error, double progress) {
        return new IfcEditEventMessage(
                UUID.randomUUID(), "v1", "EVENT", eventType,
                "event.three-d-llm.generate",
                jobId, jobStepId, 1, 2,
                projectId, WORKER_TYPE_THREE_D_LLM, "worker-1",
                baseRevisionId, null, null,
                "running", progress,
                output, error,
                jobId + ":step-1:three-d-llm",
                UUID.randomUUID(), OffsetDateTime.now(ZoneOffset.UTC)
        );
    }

    private IfcEditEventMessage completedEvent(String editPlanUrl) {
        return buildEvent(EVENT_THREE_D_LLM_COMPLETED,
                Map.of("storage_url", editPlanUrl), null, 1.0);
    }

    private IfcEditEventMessage failedEvent() {
        return buildEvent(EVENT_THREE_D_LLM_FAILED, null,
                new IfcEditWorkerError("THREE_D_LLM_FAILED", "3D LLM 실패", false, true, null), 0.0);
    }
}
