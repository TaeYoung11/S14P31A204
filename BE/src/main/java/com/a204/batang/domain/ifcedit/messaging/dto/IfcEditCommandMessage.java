package com.a204.batang.domain.ifcedit.messaging.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * IFC Edit worker command message DTO.
 *
 * <p>{@code input.command_json_storage_url} follows the shared command envelope alias,
 * while authoring {@code payload} follows the current ai-authoring payload model:
 * {@code {"engineRequest": ...}} for direct edits or {@code {"commandJsonStorageUrl": "..."}}
 * for LLM planning results.</p>
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record IfcEditCommandMessage(
        @JsonProperty("message_id") UUID messageId,
        @JsonProperty("schema_version") String schemaVersion,
        @JsonProperty("message_type") String messageType,
        @JsonProperty("command_type") String commandType,
        @JsonProperty("routing_key") String routingKey,
        @JsonProperty("job_id") UUID jobId,
        @JsonProperty("job_step_id") UUID jobStepId,
        @JsonProperty("step_no") Integer stepNo,
        @JsonProperty("total_steps") Integer totalSteps,
        @JsonProperty("project_id") UUID projectId,
        @JsonProperty("requested_by") UUID requestedBy,
        @JsonProperty("source_revision_id") UUID sourceRevisionId,
        @JsonProperty("source_scene_state_id") UUID sourceSceneStateId,
        @JsonProperty("source_scene_type") String sourceSceneType,
        @JsonProperty("target_revision_id") UUID targetRevisionId,
        @JsonProperty("expected_output_artifact_id") UUID expectedOutputArtifactId,
        @JsonProperty("input") Map<String, Object> input,
        @JsonProperty("expected_output") ExpectedOutput expectedOutput,
        @JsonProperty("payload") JsonNode payload,
        @JsonProperty("attempt_no") Integer attemptNo,
        @JsonProperty("max_attempts") Integer maxAttempts,
        @JsonProperty("idempotency_key") String idempotencyKey,
        @JsonProperty("correlation_id") UUID correlationId,
        @JsonProperty("created_at") OffsetDateTime createdAt
) {

    public record ExpectedOutput(
            @JsonProperty("ifc_storage_url") String ifcStorageUrl,
            @JsonProperty("validation_report_storage_url") String validationReportStorageUrl,
            @JsonProperty("edit_plan_storage_url") String editPlanStorageUrl,
            @JsonProperty("three_d_plan_storage_url") String threeDPlanStorageUrl
    ) {
    }
}
