package com.a204.batang.domain.floorplan.dto;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(
        description = "Floor-plan 생성 요청입니다. "
                + "layoutImport가 있으면 raw layout_import_v2 payload를 우선 사용하고, "
                + "요청 본문이 없거나 layoutImport가 null이면 저장된 workspace bubble snapshot으로 대체합니다."
)
public record CreateFloorPlanGenerateRequest(
        @Schema(
                description = "Raw layout_import_v2 payload입니다. Commit 3에서는 구조를 고정하지 않고, 이후 커밋에서 검증 및 매핑을 연결합니다.",
                implementation = Object.class
        )
        JsonNode layoutImport
) {
}
