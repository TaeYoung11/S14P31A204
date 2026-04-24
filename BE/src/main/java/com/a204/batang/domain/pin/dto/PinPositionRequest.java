package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinPosition;
import jakarta.validation.constraints.NotNull;

/**
 * 핀 좌표 요청 DTO다.
 *
 * @param x x 좌표
 * @param y y 좌표
 * @param z z 좌표
 */
public record PinPositionRequest(
        @NotNull(message = "x는 필수입니다.")
        Double x,

        @NotNull(message = "y는 필수입니다.")
        Double y,

        @NotNull(message = "z는 필수입니다.")
        Double z
) {

    /**
     * 엔티티 임베디드 좌표 객체로 변환한다.
     *
     * @return PinPosition 객체
     */
    public PinPosition toPinPosition() {
        return PinPosition.of(x, y, z);
    }
}
