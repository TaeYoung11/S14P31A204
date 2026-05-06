package com.a204.batang.domain.ifcedit.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

@Schema(description = "채팅 기반 IFC 편집 요청")
public record ChatCommandRequest(
        @NotNull
        @Schema(description = "2D/3D LLM 라우팅 타입", allowableValues = {"TWO_D", "THREE_D"})
        ChatCommandSceneType sceneType,

        @NotNull
        @Schema(description = "편집 기준 revision ID")
        UUID baseRevisionId,

        @NotBlank
        @Schema(description = "원본 scene 타입", example = "IFC_MODEL")
        String sourceSceneType,

        @NotBlank
        @Schema(description = "사용자 자연어 편집 요청")
        String message,

        @Schema(description = "원본 scene state ID")
        UUID sourceSceneStateId,

        @Schema(description = "원본 scene storage URL")
        String sourceSceneStorageUrl,

        @Schema(description = "원본 scene payload")
        JsonNode sourceScene,

        @Schema(description = "대화 히스토리")
        JsonNode conversationHistory,

        @Schema(description = "planner 옵션")
        JsonNode plannerOptions
) {

    @JsonIgnore
    @AssertTrue(message = "sourceSceneStorageUrl 또는 sourceScene 중 하나는 필수입니다.")
    public boolean isSourceSceneProvided() {
        return hasText(sourceSceneStorageUrl) || sourceScene != null;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
