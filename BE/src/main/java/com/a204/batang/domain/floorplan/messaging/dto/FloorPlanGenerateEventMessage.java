package com.a204.batang.domain.floorplan.messaging.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * IFC_GENERATE_FROM_BUBBLE worker event 메시지 DTO이다.
 * shared event_message schema의 snake_case 규칙을 그대로 따른다.
 */
public record FloorPlanGenerateEventMessage(
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
        @JsonProperty("target_revision_id")
        UUID targetRevisionId,
        @JsonProperty("output_artifact_id")
        UUID outputArtifactId,
        @JsonProperty("status")
        String status,
        @JsonProperty("progress")
        Double progress,
        @JsonProperty("output")
        Map<String, Object> output,
        @JsonProperty("error")
        FloorPlanWorkerError error,
        @JsonProperty("clarification_request_id")
        UUID clarificationRequestId,
        @JsonProperty("idempotency_key")
        String idempotencyKey,
        @JsonProperty("correlation_id")
        UUID correlationId,
        @JsonProperty("occurred_at")
        OffsetDateTime occurredAt
) {
}
