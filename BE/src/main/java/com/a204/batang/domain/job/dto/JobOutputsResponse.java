package com.a204.batang.domain.job.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.UUID;

@Schema(description = "공통 결과 이동 및 후속 조회에 필요한 출력 식별자 정보")
public record JobOutputsResponse(
        @Schema(description = "대상 revision ID")
        UUID targetRevisionId,
        @Schema(description = "대표 산출물 ID")
        UUID primaryArtifactId,
        @Schema(description = "대표 결과 URL")
        String primaryResultUrl,
        @Schema(description = "산출물 목록")
        List<JobArtifactResponse> artifacts
) {
}
