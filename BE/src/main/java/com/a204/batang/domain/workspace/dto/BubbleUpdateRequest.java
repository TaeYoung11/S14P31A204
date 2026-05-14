package com.a204.batang.domain.workspace.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Pattern;

import java.util.List;

/**
 * 버블 다이어그램 동기화 요청 DTO.
 *
 * @param bubbles 버블 목록
 * @param connections 연결 목록
 * @param baseIndex 이번 변경이 파생된 기준 스냅샷 인덱스(-1이면 빈 히스토리 기준)
 */
public record BubbleUpdateRequest(
        @NotNull(message = "bubbles is required.")
        List<@Valid BubbleData> bubbles,
        @NotNull(message = "connections is required.")
        List<@Valid ConnectionData> connections,
        @NotNull(message = "baseIndex is required.")
        @Min(value = -1, message = "baseIndex must be greater than or equal to -1.")
        Integer baseIndex,
        @Valid
        BubbleFloorMeta floorMeta
) implements BubbleSnapshotPayload {

    /**
     * 버블 다이어그램 단일 버블 데이터.
     *
     * @param id 버블 고유 ID
     * @param x x 좌표(px)
     * @param y y 좌표(px)
     * @param width 너비(px)
     * @param height 높이(px)
     * @param widthMm 너비(mm)
     * @param heightMm 높이(mm)
     * @param label 버블 라벨
     * @param type 버블 타입
     * @param ratio 면적 비율(m2)
     * @param color 표시 색상
     */
    public record BubbleData(
            @NotBlank(message = "bubble id is required.")
            String id,
            @NotNull(message = "bubble x is required.")
            Double x,
            @NotNull(message = "bubble y is required.")
            Double y,
            @NotNull(message = "bubble width is required.")
            @Positive(message = "bubble width must be positive.")
            Double width,
            @NotNull(message = "bubble height is required.")
            @Positive(message = "bubble height must be positive.")
            Double height,
            @NotNull(message = "bubble widthMm is required.")
            @Positive(message = "bubble widthMm must be positive.")
            Double widthMm,
            @NotNull(message = "bubble heightMm is required.")
            @Positive(message = "bubble heightMm must be positive.")
            Double heightMm,
            @NotBlank(message = "bubble label is required.")
            String label,
            @NotBlank(message = "bubble type is required.")
            String type,
            @NotNull(message = "bubble ratio is required.")
            @Positive(message = "bubble ratio must be positive.")
            Double ratio,
            String color,
            Integer floor
    ) {
    }

    /**
     * 버블 간 연결 데이터.
     *
     * @param from 시작 버블 ID
     * @param to 도착 버블 ID
     * @param type 연결 유형(bold/thin/dashed)
     */
    public record ConnectionData(
            @NotBlank(message = "connection from is required.")
            String from,
            @NotBlank(message = "connection to is required.")
            String to,
            @NotBlank(message = "connection type is required.")
            @Pattern(
                    regexp = "(?i)bold|thin|dashed",
                    message = "connection type must be one of bold, thin, dashed."
            )
            String type
    ) {
    }
}
