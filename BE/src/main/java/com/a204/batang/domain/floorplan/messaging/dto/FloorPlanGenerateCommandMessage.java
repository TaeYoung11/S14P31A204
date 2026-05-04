package com.a204.batang.domain.floorplan.messaging.dto;

import com.a204.batang.domain.floorplan.dto.LayoutImportV2Payload;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * IFC_GENERATE_FROM_BUBBLE worker command 메시지 DTO이다.
 * shared command_message schema의 snake_case 규칙을 그대로 따른다.
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record FloorPlanGenerateCommandMessage(
        @JsonProperty("message_id")
        UUID messageId,
        @JsonProperty("schema_version")
        String schemaVersion,
        @JsonProperty("message_type")
        String messageType,
        @JsonProperty("command_type")
        String commandType,
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
        @JsonProperty("requested_by")
        UUID requestedBy,
        @JsonProperty("source_revision_id")
        UUID sourceRevisionId,
        @JsonProperty("source_scene_state_id")
        UUID sourceSceneStateId,
        @JsonProperty("source_scene_type")
        String sourceSceneType,
        @JsonProperty("target_revision_id")
        UUID targetRevisionId,
        @JsonProperty("expected_output_artifact_id")
        UUID expectedOutputArtifactId,
        @JsonProperty("input")
        Map<String, Object> input,
        @JsonProperty("expected_output")
        ExpectedOutput expectedOutput,
        @JsonProperty("payload")
        Payload payload,
        @JsonProperty("attempt_no")
        Integer attemptNo,
        @JsonProperty("max_attempts")
        Integer maxAttempts,
        @JsonProperty("idempotency_key")
        String idempotencyKey,
        @JsonProperty("correlation_id")
        UUID correlationId,
        @JsonProperty("created_at")
        OffsetDateTime createdAt
) {

    /**
     * worker가 저장해야 하는 결과물 경로를 나타낸다.
     */
    public record ExpectedOutput(
            @JsonProperty("ifc_storage_url")
            String ifcStorageUrl,
            @JsonProperty("validation_report_storage_url")
            String validationReportStorageUrl
    ) {
    }

    /**
     * worker 실행 payload wrapper이다.
     */
    public record Payload(
            @JsonProperty("layout_import")
            LayoutImportV2Payload layoutImport
    ) {
    }
}
