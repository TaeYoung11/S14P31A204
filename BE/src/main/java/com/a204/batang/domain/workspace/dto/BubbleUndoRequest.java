package com.a204.batang.domain.workspace.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 버블 다이어그램 undo 요청 DTO.
 *
 * @param baseIndex 현재 클라이언트가 바라보는 스냅샷 인덱스
 */
public record BubbleUndoRequest(
        @NotNull(message = "baseIndex is required.")
        @Min(value = 0, message = "baseIndex must be greater than or equal to 0.")
        Integer baseIndex
) {
}
