package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.entity.ProjectPin;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 새 핀 등록 응답 DTO다.
 *
 * @param pinId 핀 ID
 * @param status 핀 상태
 * @param createdAt 생성 시각
 */
public record CreatePinResponse(
        UUID pinId,
        PinStatus status,
        LocalDateTime createdAt
) {

    /**
     * 핀 엔티티를 응답 DTO로 변환한다.
     *
     * @param projectPin 핀 엔티티
     * @return 핀 등록 응답
     */
    public static CreatePinResponse from(ProjectPin projectPin) {
        return new CreatePinResponse(
                projectPin.getPinId(),
                projectPin.getStatus(),
                projectPin.getCreatedAt()
        );
    }
}
