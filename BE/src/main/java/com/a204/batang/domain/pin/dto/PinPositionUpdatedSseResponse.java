package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.event.PinPositionUpdatedEvent;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 핀 위치 수정 SSE 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param modifierUserId 수정한 사용자 ID
 * @param cameraPosition 카메라 좌표
 * @param worldPosition 월드 좌표
 * @param updatedAt 수정 시각
 */
public record PinPositionUpdatedSseResponse(
        UUID projectId,
        UUID pinId,
        UUID modifierUserId,
        PinPositionResponse cameraPosition,
        PinPositionResponse worldPosition,
        LocalDateTime updatedAt
) {

    /**
     * 위치 수정 이벤트를 SSE 응답으로 변환한다.
     *
     * @param event 위치 수정 이벤트
     * @return SSE 응답 DTO
     */
    public static PinPositionUpdatedSseResponse from(PinPositionUpdatedEvent event) {
        return new PinPositionUpdatedSseResponse(
                event.projectId(),
                event.pinId(),
                event.modifierUserId(),
                new PinPositionResponse(event.cameraX(), event.cameraY(), event.cameraZ()),
                new PinPositionResponse(event.worldX(), event.worldY(), event.worldZ()),
                event.updatedAt()
        );
    }
}
