package com.a204.batang.domain.render.messaging.dto;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record SdRenderEventMessage(
        UUID eventId,
        Integer schemaVersion,
        String messageType,
        String eventType,
        String routingKey,
        UUID jobId,
        UUID jobStepId,
        Integer stepNo,
        Integer totalSteps,
        UUID projectId,
        String workerType,
        String workerId,
        UUID sourceRevisionId,
        UUID outputArtifactId,
        String status,
        Integer progress,
        Map<String, Object> output,
        SdRenderError error,
        String idempotencyKey,
        UUID correlationId,
        OffsetDateTime occurredAt
) {
}
