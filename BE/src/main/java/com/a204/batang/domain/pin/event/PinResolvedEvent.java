package com.a204.batang.domain.pin.event;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.entity.ProjectPin;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 핀이 완료 상태로 변경되었을 때 발행하는 도메인 이벤트.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param status 핀 상태
 * @param resolvedByUserId 완료 처리한 사용자 ID
 * @param resolvedAt 완료 시각
 * @param updatedAt 핀 수정 시각
 */
public record PinResolvedEvent(
        UUID projectId,
        UUID pinId,
        PinStatus status,
        UUID resolvedByUserId,
        LocalDateTime resolvedAt,
        LocalDateTime updatedAt
) {

    /**
     * 핀 엔티티로부터 완료 이벤트를 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param pin 완료된 핀
     * @return 완료 이벤트
     */
    public static PinResolvedEvent from(UUID projectId, ProjectPin pin) {
        return new PinResolvedEvent(
                projectId,
                pin.getPinId(),
                pin.getStatus(),
                pin.getResolvedByUserId(),
                pin.getResolvedAt(),
                pin.getUpdatedAt()
        );
    }
}
