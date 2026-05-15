package com.a204.batang.domain.workspace.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.util.List;

/**
 * 버블 조닝 단일 데이터.
 *
 * @param id 조닝 고유 ID
 * @param name 조닝 이름
 * @param color 조닝 대표 색상
 * @param bubbleIds 포함된 버블 ID 목록
 * @param source 자동/수동 생성 구분
 */
public record BubbleZoneData(
        @NotBlank(message = "zone id is required.")
        String id,
        @NotBlank(message = "zone name is required.")
        String name,
        @NotBlank(message = "zone color is required.")
        String color,
        @NotNull(message = "zone bubbleIds is required.")
        List<@NotBlank(message = "zone bubble id is required.") String> bubbleIds,
        @NotBlank(message = "zone source is required.")
        @Pattern(
                regexp = "(?i)auto|manual",
                message = "zone source must be one of auto, manual."
        )
        String source
) {
}
