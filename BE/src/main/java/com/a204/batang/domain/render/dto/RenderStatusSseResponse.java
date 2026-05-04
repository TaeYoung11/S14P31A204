package com.a204.batang.domain.render.dto;

import java.util.UUID;

public record RenderStatusSseResponse(
        String type,
        UUID projectId,
        UUID renderId,
        UUID jobStepId,
        String status,
        Integer progress,
        String imageUrl,
        String message
) {
}
