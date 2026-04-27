package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinPosition;

/**
 * ? 醫뚰몴 ?묐떟 DTO.
 *
 * @param x x 醫뚰몴
 * @param y y 醫뚰몴
 * @param z z 醫뚰몴
 */
public record PinPositionResponse(
        Double x,
        Double y,
        Double z
) {

    /**
     * ? 醫뚰몴 ?꾨쿋?붾뱶 媛믪쓣 ?묐떟 DTO濡?蹂?섑븳??
     *
     * @param position ? 醫뚰몴
     * @return ? 醫뚰몴 ?묐떟 DTO
     */
    public static PinPositionResponse from(PinPosition position) {
        return new PinPositionResponse(
                position.getX(),
                position.getY(),
                position.getZ()
        );
    }
}
