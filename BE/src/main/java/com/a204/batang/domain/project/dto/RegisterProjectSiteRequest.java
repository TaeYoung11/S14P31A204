package com.a204.batang.domain.project.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/**
 * 프로젝트 대지 정보 등록 요청 DTO.
 *
 * @param latitude 위도
 * @param longitude 경도
 */
public record RegisterProjectSiteRequest(
        @NotNull(message = "latitude는 필수입니다.")
        @DecimalMin(value = "-90.0", message = "latitude는 -90 ~ 90 범위여야 합니다.")
        @DecimalMax(value = "90.0", message = "latitude는 -90 ~ 90 범위여야 합니다.")
        Double latitude,

        @NotNull(message = "longitude는 필수입니다.")
        @DecimalMin(value = "-180.0", message = "longitude는 -180 ~ 180 범위여야 합니다.")
        @DecimalMax(value = "180.0", message = "longitude는 -180 ~ 180 범위여야 합니다.")
        Double longitude
) {
}