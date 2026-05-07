package com.a204.batang.domain.workspace.dto;

import com.a204.batang.domain.ifcedit.dto.ChatCommandSceneType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 2D/3D 편집 undo 요청 DTO.
 *
 * @param revisionId 현재 화면에서 사용 중인 리비전 ID
 * @param sceneType undo를 요청한 화면 타입(2D/3D)
 * @param baseIndex 현재 클라이언트가 바라보는 히스토리 인덱스
 */
public record FloorPlanUndoRequest(
        @NotBlank(message = "revisionId is required.")
        @Size(max = 50, message = "revisionId must be 50 characters or less.")
        String revisionId,
        @NotNull(message = "sceneType is required.")
        ChatCommandSceneType sceneType,
        @NotNull(message = "baseIndex is required.")
        @Min(value = 0, message = "baseIndex must be greater than or equal to 0.")
        Integer baseIndex
) {
}
