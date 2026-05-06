package com.a204.batang.domain.ifcedit.dto;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

@Schema(description = "LLM 경유 IFC 편집 요청입니다.")
public record LlmIfcEditRequest(
        @NotNull
        @Schema(description = "편집 기반이 될 revision 식별자입니다.")
        UUID baseRevisionId,

        @Schema(description = "소스 씬 상태 식별자입니다.")
        UUID sourceSceneStateId,

        @Schema(description = "소스 씬 타입입니다.", example = "IFC_MODEL")
        String sourceSceneType,

        @Schema(description = "사용자 편집 지시사항입니다.")
        String userInstruction,

        @Schema(description = "소스 씬 스토리지 URL입니다.")
        String sourceSceneStorageUrl,

        @Schema(description = "소스 씬 데이터입니다.")
        JsonNode sourceScene,

        @Schema(description = "대화 히스토리입니다.")
        JsonNode conversationHistory,

        @Schema(description = "플래너 옵션입니다.")
        JsonNode plannerOptions
) {
}
