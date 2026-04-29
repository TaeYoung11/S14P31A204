package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.event.PinResolvedEvent;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 핀 완료 SSE 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param status 핀 상태
 * @param resolvedByUserId 완료 처리 사용자 ID
 * @param resolvedAt 완료 시각
 * @param updatedAt 수정 시각
 */
public record PinResolvedSseResponse(
        UUID projectId,
        UUID pinId,
        PinStatus status,
        UUID resolvedByUserId,
        LocalDateTime resolvedAt,
        LocalDateTime updatedAt
) {

    /**
     * 핀 완료 이벤트를 SSE 응답으로 변환한다.
     *
     * @param event 핀 완료 이벤트
     * @return SSE 응답 DTO
     */
    public static PinResolvedSseResponse from(PinResolvedEvent event) {
        return new PinResolvedSseResponse(
                event.projectId(),
                event.pinId(),
                event.status(),
                event.resolvedByUserId(),
                event.resolvedAt(),
                event.updatedAt()
        );
    }
}
