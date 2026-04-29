package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.ProjectPin;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 핀 위치 수정 응답 DTO.
 *
 * @param pinId 핀 ID
 * @param cameraPosition 변경된 카메라 좌표
 * @param worldPosition 변경된 핀(월드) 좌표
 * @param updatedAt 수정 시각
 */
public record UpdatePinPositionResponse(
        UUID pinId,
        PinPositionResponse cameraPosition,
        PinPositionResponse worldPosition,
        LocalDateTime updatedAt
) {

    /**
     * 핀 엔티티를 위치 수정 응답 DTO로 변환한다.
     *
     * @param pin 핀 엔티티
     * @return 핀 위치 수정 응답 DTO
     */
    public static UpdatePinPositionResponse from(ProjectPin pin) {
        return new UpdatePinPositionResponse(
                pin.getPinId(),
                PinPositionResponse.from(pin.getCameraPosition()),
                PinPositionResponse.from(pin.getWorldPosition()),
                pin.getUpdatedAt()
        );
    }
}
