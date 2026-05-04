package com.a204.batang.domain.render.messaging.dto;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record SdRenderCommandMessage(
        UUID messageId,
        Integer schemaVersion,
        String messageType,
        String commandType,
        String routingKey,
        UUID jobId,
        UUID jobStepId,
        Integer stepNo,
        Integer totalSteps,
        UUID projectId,
        UUID requestedBy,
        UUID sourceRevisionId,
        String sourceSceneType,
        UUID expectedOutputArtifactId,
        Map<String, Object> input,
        Map<String, Object> expectedOutput,
        Map<String, Object> payload,
        Integer attemptNo,
        Integer maxAttempts,
        String idempotencyKey,
        UUID correlationId,
        OffsetDateTime createdAt
) {
}
