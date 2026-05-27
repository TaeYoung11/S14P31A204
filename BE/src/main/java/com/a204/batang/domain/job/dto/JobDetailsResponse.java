package com.a204.batang.domain.job.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "도메인별 선택적 상세 정보 블록")
public record JobDetailsResponse(
        @Schema(description = "IFC 편집 작업 상세")
        IfcEditJobDetailsResponse ifcEdit,
        @Schema(description = "렌더링 작업 상세")
        RenderJobDetailsResponse render,
        @Schema(description = "Floor-plan 생성 작업 상세")
        FloorPlanJobDetailsResponse floorPlan
) {
}
