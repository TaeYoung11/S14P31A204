package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.entity.ProjectPin;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 핀 완료 처리 응답 DTO다.
 *
 * @param pinId 핀 ID
 * @param status 핀 상태
 * @param resolvedByUserId 완료 처리자 사용자 ID
 * @param resolvedAt 완료 처리 시각
 * @param updatedAt 수정 시각
 */
public record ResolvePinResponse(
        UUID pinId,
        PinStatus status,
        UUID resolvedByUserId,
        LocalDateTime resolvedAt,
        LocalDateTime updatedAt
) {

    /**
     * 핀 엔티티를 완료 처리 응답 DTO로 변환한다.
     *
     * @param pin 핀 엔티티
     * @return 핀 완료 처리 응답
     */
    public static ResolvePinResponse from(ProjectPin pin) {
        return new ResolvePinResponse(
                pin.getPinId(),
                pin.getStatus(),
                pin.getResolvedByUserId(),
                pin.getResolvedAt(),
                pin.getUpdatedAt()
        );
    }
}
