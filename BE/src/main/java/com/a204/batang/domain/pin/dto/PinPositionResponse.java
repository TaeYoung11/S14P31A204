package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinPosition;

/**
 * 핀 좌표 응답 DTO.
 *
 * @param x x 좌표
 * @param y y 좌표
 * @param z z 좌표
 */
public record PinPositionResponse(
        Double x,
        Double y,
        Double z
) {

    /**
     * 핀 좌표 임베디드 값을 응답 DTO로 변환한다.
     *
     * @param position 핀 좌표
     * @return 핀 좌표 응답 DTO
     */
    public static PinPositionResponse from(PinPosition position) {
        return new PinPositionResponse(
                position.getX(),
                position.getY(),
                position.getZ()
        );
    }
}
