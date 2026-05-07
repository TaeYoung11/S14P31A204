package com.a204.batang.domain.workspace.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 버블 다이어그램 Redo 요청 DTO.
 *
 * @param baseIndex 클라이언트가 현재 보고 있는 히스토리 인덱스
 */
public record BubbleRedoRequest(
        @NotNull(message = "baseIndex is required.")
        @Min(value = -1, message = "baseIndex must be greater than or equal to -1.")
        Integer baseIndex
) {
}

