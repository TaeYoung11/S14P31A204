package com.a204.batang.domain.job.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "작업 단계 요약 정보")
public record JobStepResponse(
        @Schema(description = "작업 단계 ID")
        UUID jobStepId,
        @Schema(description = "단계 번호")
        Integer stepNo,
        @Schema(description = "워커 타입")
        String workerType,
        @Schema(description = "단계 상태")
        String status,
        @Schema(description = "단계 진행률")
        Integer progress,
        @Schema(description = "재시도 횟수")
        Integer attemptCount,
        @Schema(description = "생성 시각 (UTC ISO-8601)")
        String createdAt,
        @Schema(description = "시작 시각 (UTC ISO-8601)")
        String startedAt,
        @Schema(description = "종료 시각 (UTC ISO-8601)")
        String finishedAt,
        @Schema(description = "단계 실패 정보")
        JobErrorResponse error
) {
}
