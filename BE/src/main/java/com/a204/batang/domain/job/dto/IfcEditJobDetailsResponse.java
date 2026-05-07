package com.a204.batang.domain.job.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "IFC 편집 작업 전용 상세 정보")
public record IfcEditJobDetailsResponse(
        @Schema(description = "편집 모드", allowableValues = {"DIRECT", "TWO_D_LLM", "THREE_D_LLM"})
        String mode,
        @Schema(description = "원본 revision ID")
        UUID sourceRevisionId,
        @Schema(description = "원본 scene state ID")
        UUID sourceSceneStateId,
        @Schema(description = "원본 scene 타입")
        String sourceSceneType,
        @Schema(description = "대상 revision ID")
        UUID targetRevisionId,
        @Schema(description = "예약된 결과 artifact ID")
        UUID expectedOutputArtifactId,
        @Schema(description = "사용자 편집 지시문")
        String userInstruction,
        @Schema(description = "검증 리포트 artifact ID")
        UUID validationReportArtifactId,
        @Schema(description = "편집 계획 artifact ID")
        UUID editPlanArtifactId
) {
}
