package com.a204.batang.domain.ifcedit.dto;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

@Schema(description = "직접 IFC 편집 요청입니다.")
public record DirectIfcEditRequest(
        @Schema(description = "메시지 스키마 버전입니다.", example = "v1")
        String schemaVersion,

        @Schema(description = "요청 식별자입니다.")
        UUID requestId,

        @NotNull
        @Schema(description = "편집 기반이 될 revision 식별자입니다.")
        UUID baseRevisionId,

        @Schema(description = "소스 씬 상태 식별자입니다.")
        UUID sourceSceneStateId,

        @Schema(description = "소스 씬 타입입니다.", example = "IFC_MODEL")
        String sourceSceneType,

        @NotNull
        @Schema(description = "IFC Edit 워커에 전달할 엔진 요청 페이로드입니다.")
        JsonNode engineRequest
) {
}
