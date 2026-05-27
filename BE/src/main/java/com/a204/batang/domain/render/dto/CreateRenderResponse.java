package com.a204.batang.domain.render.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "실사 렌더링 요청 생성 응답")
public record CreateRenderResponse(
        UUID renderId,
        UUID jobStepId,
        UUID projectId,
        UUID sourceRevisionId,
        UUID expectedOutputArtifactId,
        String status,
        Integer progress
) {
}
