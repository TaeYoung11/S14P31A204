package com.a204.batang.domain.pin.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 핀 좌표(3차원 벡터)를 나타낸다.
 */
@Getter
@Embeddable
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PinPosition {

    @Column(name = "x", nullable = false)
    private double x;

    @Column(name = "y", nullable = false)
    private double y;

    @Column(name = "z", nullable = false)
    private double z;

    private PinPosition(double x, double y, double z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * 좌표 객체를 생성한다.
     *
     * @param x x 좌표
     * @param y y 좌표
     * @param z z 좌표
     * @return 좌표 객체
     */
    public static PinPosition of(double x, double y, double z) {
        return new PinPosition(x, y, z);
    }
}
