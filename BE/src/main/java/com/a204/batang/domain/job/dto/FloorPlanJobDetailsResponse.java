package com.a204.batang.domain.job.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "Floor-plan 생성 작업 전용 상세 정보")
public record FloorPlanJobDetailsResponse(
        @Schema(description = "입력 소스")
        String inputSource,
        @Schema(description = "원본 scene 타입")
        String sourceSceneType,
        @Schema(description = "대상 revision ID")
        UUID targetRevisionId,
        @Schema(description = "예약된 결과 artifact ID")
        UUID expectedOutputArtifactId,
        @Schema(description = "layout import 스키마 버전")
        String layoutImportSchemaVersion,
        @Schema(description = "생성될 revision 번호")
        Integer revisionNo
) {
}
