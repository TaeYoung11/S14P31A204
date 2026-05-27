package com.a204.batang.domain.pin.event;

import com.a204.batang.domain.pin.entity.PinPosition;
import com.a204.batang.domain.pin.entity.ProjectPin;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 핀 위치가 수정되었을 때 발행하는 도메인 이벤트.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param modifierUserId 수정한 사용자 ID
 * @param cameraX 수정된 카메라 X 좌표
 * @param cameraY 수정된 카메라 Y 좌표
 * @param cameraZ 수정된 카메라 Z 좌표
 * @param worldX 수정된 월드 X 좌표
 * @param worldY 수정된 월드 Y 좌표
 * @param worldZ 수정된 월드 Z 좌표
 * @param updatedAt 핀 수정 시각
 */
public record PinPositionUpdatedEvent(
        UUID projectId,
        UUID pinId,
        UUID modifierUserId,
        Double cameraX,
        Double cameraY,
        Double cameraZ,
        Double worldX,
        Double worldY,
        Double worldZ,
        LocalDateTime updatedAt
) {

    /**
     * 핀 엔티티로부터 위치 수정 이벤트를 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param modifierUserId 수정한 사용자 ID
     * @param pin 수정된 핀
     * @return 위치 수정 이벤트
     */
    public static PinPositionUpdatedEvent from(UUID projectId, UUID modifierUserId, ProjectPin pin) {
        PinPosition cameraPosition = pin.getCameraPosition();
        PinPosition worldPosition = pin.getWorldPosition();

        return new PinPositionUpdatedEvent(
                projectId,
                pin.getPinId(),
                modifierUserId,
                cameraPosition.getX(),
                cameraPosition.getY(),
                cameraPosition.getZ(),
                worldPosition.getX(),
                worldPosition.getY(),
                worldPosition.getZ(),
                pin.getUpdatedAt()
        );
    }
}
