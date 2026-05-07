package com.a204.batang.domain.workspace.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 2D/3D 도면 Undo 요청 DTO.
 *
 * @param baseIndex 클라이언트가 현재 보고 있는 히스토리 인덱스
 */
public record FloorPlanUndoRequest(
        @NotNull(message = "baseIndex is required.")
        @Min(value = -1, message = "baseIndex must be greater than or equal to -1.")
        Integer baseIndex
) {
}

