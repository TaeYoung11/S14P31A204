package com.a204.batang.domain.job.messaging;

import com.a204.batang.domain.floorplan.messaging.FloorPlanGenerateEventListener;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateEventMessage;
import com.a204.batang.domain.ifcedit.messaging.IfcEditEventDispatcher;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditEventMessage;
import com.a204.batang.domain.render.messaging.SdRenderEventListener;
import com.a204.batang.domain.render.messaging.dto.SdRenderEventMessage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class JobEventOrchestratorTest {

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Mock
    private FloorPlanGenerateEventListener floorPlanGenerateEventListener;

    @Mock
    private SdRenderEventListener sdRenderEventListener;

    @Mock
    private IfcEditEventDispatcher ifcEditEventDispatcher;

    @InjectMocks
    private JobEventOrchestrator jobEventOrchestrator;

    @Test
    void consume_ignoresMalformedPayloadWithoutDispatch() {
        Message message = new Message("not-json".getBytes(StandardCharsets.UTF_8), new MessageProperties());

        jobEventOrchestrator.consume(message);

        verify(floorPlanGenerateEventListener, never()).handle(any(FloorPlanGenerateEventMessage.class));
        verify(sdRenderEventListener, never()).handle(any(SdRenderEventMessage.class));
        verify(ifcEditEventDispatcher, never()).handle(any(IfcEditEventMessage.class));
    }

    @Test
    void consume_propagatesDomainException() {
        Message message = jsonMessage("""
                {
                  "event_type": "IFC_GENERATE_FROM_BUBBLE_STARTED",
                  "job_id": "%s",
                  "job_step_id": "%s"
                }
                """.formatted(UUID.randomUUID(), UUID.randomUUID()));
        doThrow(new RuntimeException("boom"))
                .when(floorPlanGenerateEventListener)
                .handle(any(FloorPlanGenerateEventMessage.class));

        assertThatThrownBy(() -> jobEventOrchestrator.consume(message))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("boom");
    }

    @Test
    void handle_ifcGenerateEvent_routesToFloorPlanHandlerOnly() throws Exception {
        JsonNode payload = objectMapper.readTree("""
                {
                  "event_id": "%s",
                  "schema_version": "v1",
                  "message_type": "EVENT",
                  "event_type": "IFC_GENERATE_FROM_BUBBLE_STARTED",
                  "routing_key": "event.ifc-generate.started",
                  "job_id": "%s",
                  "job_step_id": "%s",
                  "step_no": 1,
                  "total_steps": 1,
                  "project_id": "%s",
                  "worker_type": "IFC_GENERATE_FROM_BUBBLE",
                  "worker_id": "worker-1",
                  "target_revision_id": "%s",
                  "output_artifact_id": "%s",
                  "status": "started",
                  "progress": 0.1,
                  "idempotency_key": "idempotency",
                  "correlation_id": "%s",
                  "occurred_at": "2026-05-08T00:00:00Z"
                }
                """.formatted(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID()
        ));

        jobEventOrchestrator.handle(payload);

        verify(floorPlanGenerateEventListener).handle(any(FloorPlanGenerateEventMessage.class));
        verify(sdRenderEventListener, never()).handle(any(SdRenderEventMessage.class));
        verify(ifcEditEventDispatcher, never()).handle(any(IfcEditEventMessage.class));
    }

    @Test
    void handle_sdRenderEvent_routesToRenderHandlerOnlyAndMapsSnakeCasePayload() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();

        JsonNode payload = objectMapper.readTree("""
                {
                  "event_id": "%s",
                  "schema_version": "v1",
                  "message_type": "EVENT",
                  "event_type": "SD_RENDER_FAILED",
                  "routing_key": "event.sd-render.failed",
                  "job_id": "%s",
                  "job_step_id": "%s",
                  "step_no": 1,
                  "total_steps": 1,
                  "project_id": "%s",
                  "worker_type": "SD_RENDER",
                  "worker_id": "render-worker-1",
                  "source_revision_id": "%s",
                  "output_artifact_id": "%s",
                  "status": "failed",
                  "progress": 0.6,
                  "error": {
                    "code": "SD_RENDER_FAILED",
                    "message": "worker crashed",
                    "retryable": true,
                    "clarification_possible": false,
                    "detail_storage_url": "s3://detail.json"
                  },
                  "idempotency_key": "idempotency",
                  "correlation_id": "%s",
                  "occurred_at": "2026-05-08T00:00:00Z"
                }
                """.formatted(
                UUID.randomUUID(),
                jobId,
                jobStepId,
                projectId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                correlationId
        ));

        jobEventOrchestrator.handle(payload);

        ArgumentCaptor<SdRenderEventMessage> captor = ArgumentCaptor.forClass(SdRenderEventMessage.class);
        verify(sdRenderEventListener).handle(captor.capture());
        verify(floorPlanGenerateEventListener, never()).handle(any(FloorPlanGenerateEventMessage.class));
        verify(ifcEditEventDispatcher, never()).handle(any(IfcEditEventMessage.class));

        SdRenderEventMessage event = captor.getValue();
        assertThat(event.eventType()).isEqualTo("SD_RENDER_FAILED");
        assertThat(event.jobId()).isEqualTo(jobId);
        assertThat(event.jobStepId()).isEqualTo(jobStepId);
        assertThat(event.projectId()).isEqualTo(projectId);
        assertThat(event.schemaVersion()).isEqualTo("v1");
        assertThat(event.progress()).isEqualTo(0.6d);
        assertThat(event.error()).isNotNull();
        assertThat(event.error().clarificationPossible()).isFalse();
        assertThat(event.error().detailStorageUrl()).isEqualTo("s3://detail.json");
    }

    @Test
    void orchestrator_routesSdRenderGenerateEventsToRenderListener() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID artifactId = UUID.randomUUID();
        String manifestUrl = "s3://batang/projects/" + projectId + "/renders/" + artifactId + "/manifest.v1.json";

        JsonNode payload = objectMapper.readTree("""
                {
                  "event_id": "%s",
                  "schema_version": "v1",
                  "message_type": "EVENT",
                  "event_type": "SD_RENDER_GENERATE_COMPLETED",
                  "routing_key": "event.sd-render.completed",
                  "job_id": "%s",
                  "job_step_id": "%s",
                  "step_no": 1,
                  "total_steps": 1,
                  "project_id": "%s",
                  "worker_type": "SD_RENDER_GENERATE",
                  "worker_id": "render-worker-1",
                  "source_revision_id": "%s",
                  "output_artifact_id": "%s",
                  "status": "completed",
                  "progress": 1.0,
                  "output": {
                    "storage_url": "%s"
                  },
                  "idempotency_key": "idempotency",
                  "correlation_id": "%s",
                  "occurred_at": "2026-05-08T00:00:00Z"
                }
                """.formatted(
                UUID.randomUUID(),
                jobId,
                jobStepId,
                projectId,
                UUID.randomUUID(),
                artifactId,
                manifestUrl,
                UUID.randomUUID()
        ));

        jobEventOrchestrator.handle(payload);

        ArgumentCaptor<SdRenderEventMessage> captor = ArgumentCaptor.forClass(SdRenderEventMessage.class);
        verify(sdRenderEventListener).handle(captor.capture());
        verify(floorPlanGenerateEventListener, never()).handle(any(FloorPlanGenerateEventMessage.class));
        verify(ifcEditEventDispatcher, never()).handle(any(IfcEditEventMessage.class));

        SdRenderEventMessage event = captor.getValue();
        assertThat(event.eventType()).isEqualTo("SD_RENDER_GENERATE_COMPLETED");
        assertThat(event.jobId()).isEqualTo(jobId);
        assertThat(event.jobStepId()).isEqualTo(jobStepId);
        assertThat(event.outputArtifactId()).isEqualTo(artifactId);
        assertThat(event.output()).containsEntry("storage_url", manifestUrl);
    }

    @Test
    void handle_twoDLlmEvent_routesToIfcEditDispatcherOnly() throws Exception {
        JsonNode payload = objectMapper.readTree("""
                {
                  "event_id": "%s",
                  "schema_version": "v1",
                  "message_type": "EVENT",
                  "event_type": "TWO_D_LLM_COMPLETED",
                  "routing_key": "event.two-d-llm.completed",
                  "job_id": "%s",
                  "job_step_id": "%s",
                  "step_no": 1,
                  "total_steps": 2,
                  "project_id": "%s",
                  "worker_type": "TWO_D_LLM",
                  "worker_id": "worker-1",
                  "target_revision_id": "%s",
                  "output_artifact_id": "%s",
                  "status": "completed",
                  "progress": 1.0,
                  "output": {
                    "storage_url": "s3://edit-plan.json"
                  },
                  "idempotency_key": "idempotency",
                  "correlation_id": "%s",
                  "occurred_at": "2026-05-08T00:00:00Z"
                }
                """.formatted(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID()
        ));

        jobEventOrchestrator.handle(payload);

        verify(ifcEditEventDispatcher).handle(any(IfcEditEventMessage.class));
        verify(floorPlanGenerateEventListener, never()).handle(any(FloorPlanGenerateEventMessage.class));
        verify(sdRenderEventListener, never()).handle(any(SdRenderEventMessage.class));
    }

    @Test
    void handle_threeDLlmEvent_routesToIfcEditDispatcherOnly() throws Exception {
        JsonNode payload = objectMapper.readTree("""
                {
                  "event_id": "%s",
                  "schema_version": "v1",
                  "message_type": "EVENT",
                  "event_type": "THREE_D_LLM_PROGRESS",
                  "routing_key": "event.three-d-llm.progress",
                  "job_id": "%s",
                  "job_step_id": "%s",
                  "step_no": 1,
                  "total_steps": 2,
                  "project_id": "%s",
                  "worker_type": "THREE_D_LLM",
                  "worker_id": "worker-1",
                  "status": "progress",
                  "progress": 0.5,
                  "idempotency_key": "idempotency",
                  "correlation_id": "%s",
                  "occurred_at": "2026-05-08T00:00:00Z"
                }
                """.formatted(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID()
        ));

        jobEventOrchestrator.handle(payload);

        verify(ifcEditEventDispatcher).handle(any(IfcEditEventMessage.class));
        verify(floorPlanGenerateEventListener, never()).handle(any(FloorPlanGenerateEventMessage.class));
        verify(sdRenderEventListener, never()).handle(any(SdRenderEventMessage.class));
    }

    @Test
    void handle_ifcEditApplyEvent_routesToIfcEditDispatcherOnly() throws Exception {
        JsonNode payload = objectMapper.readTree("""
                {
                  "event_id": "%s",
                  "schema_version": "v1",
                  "message_type": "EVENT",
                  "event_type": "IFC_EDIT_APPLY_FAILED",
                  "routing_key": "event.ifc-edit.apply.failed",
                  "job_id": "%s",
                  "job_step_id": "%s",
                  "step_no": 2,
                  "total_steps": 2,
                  "project_id": "%s",
                  "worker_type": "IFC_EDIT_APPLY",
                  "worker_id": "worker-1",
                  "target_revision_id": "%s",
                  "output_artifact_id": "%s",
                  "status": "failed",
                  "progress": 0.4,
                  "error": {
                    "code": "IFC_EDIT_APPLY_FAILED",
                    "message": "apply failed",
                    "retryable": false,
                    "clarification_possible": false
                  },
                  "idempotency_key": "idempotency",
                  "correlation_id": "%s",
                  "occurred_at": "2026-05-08T00:00:00Z"
                }
                """.formatted(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID()
        ));

        jobEventOrchestrator.handle(payload);

        verify(ifcEditEventDispatcher).handle(any(IfcEditEventMessage.class));
        verify(floorPlanGenerateEventListener, never()).handle(any(FloorPlanGenerateEventMessage.class));
        verify(sdRenderEventListener, never()).handle(any(SdRenderEventMessage.class));
    }

    @Test
    void handle_unknownEvent_ignoresWithoutDispatch() throws Exception {
        JsonNode payload = objectMapper.readTree("""
                {
                  "event_type": "SOMETHING_NEW",
                  "job_id": "%s",
                  "job_step_id": "%s"
                }
                """.formatted(UUID.randomUUID(), UUID.randomUUID()));

        jobEventOrchestrator.handle(payload);

        verify(floorPlanGenerateEventListener, never()).handle(any(FloorPlanGenerateEventMessage.class));
        verify(sdRenderEventListener, never()).handle(any(SdRenderEventMessage.class));
        verify(ifcEditEventDispatcher, never()).handle(any(IfcEditEventMessage.class));
    }

    private Message jsonMessage(String payload) {
        return new Message(payload.getBytes(StandardCharsets.UTF_8), new MessageProperties());
    }
}
