package com.a204.batang.domain.render.messaging.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record SdRenderEventMessage(
        @JsonProperty("event_id")
        UUID eventId,
        @JsonProperty("schema_version")
        String schemaVersion,
        @JsonProperty("message_type")
        String messageType,
        @JsonProperty("event_type")
        String eventType,
        @JsonProperty("routing_key")
        String routingKey,
        @JsonProperty("job_id")
        UUID jobId,
        @JsonProperty("job_step_id")
        UUID jobStepId,
        @JsonProperty("step_no")
        Integer stepNo,
        @JsonProperty("total_steps")
        Integer totalSteps,
        @JsonProperty("project_id")
        UUID projectId,
        @JsonProperty("worker_type")
        String workerType,
        @JsonProperty("worker_id")
        String workerId,
        @JsonProperty("source_revision_id")
        UUID sourceRevisionId,
        @JsonProperty("output_artifact_id")
        UUID outputArtifactId,
        String status,
        Double progress,
        Map<String, Object> output,
        SdRenderError error,
        @JsonProperty("idempotency_key")
        String idempotencyKey,
        @JsonProperty("correlation_id")
        UUID correlationId,
        @JsonProperty("occurred_at")
        OffsetDateTime occurredAt
) {
}
