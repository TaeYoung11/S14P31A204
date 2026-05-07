package com.a204.batang.domain.job.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.UUID;

@Schema(description = "공통 단건 작업 상태 조회 응답")
public record GetJobStatusResponse(
        @Schema(description = "작업 ID")
        UUID jobId,
        @Schema(description = "프로젝트 ID")
        UUID projectId,
        @Schema(description = "작업 도메인", allowableValues = {"IFC_EDIT", "RENDER", "FLOOR_PLAN", "UNKNOWN"})
        String jobDomain,
        @Schema(description = "작업 타입")
        String jobType,
        @Schema(description = "작업 상태")
        String status,
        @Schema(description = "작업 진행률")
        Integer progress,
        @Schema(description = "종료 여부")
        boolean terminal,
        @Schema(description = "생성 시각 (UTC ISO-8601)")
        String createdAt,
        @Schema(description = "시작 시각 (UTC ISO-8601)")
        String startedAt,
        @Schema(description = "종료 시각 (UTC ISO-8601)")
        String finishedAt,
        @Schema(description = "실패 정보")
        JobErrorResponse error,
        @Schema(description = "현재 단계 요약")
        JobStepResponse currentStep,
        @Schema(description = "전체 단계 목록")
        List<JobStepResponse> steps,
        @Schema(description = "공통 출력 식별자 정보")
        JobOutputsResponse outputs,
        @Schema(description = "도메인별 상세 정보")
        JobDetailsResponse details
) {
}
