package com.a204.batang.domain.floorplan.messaging.event;

import com.a204.batang.domain.floorplan.dto.FloorPlanStatusSseResponse;

import java.util.UUID;

/**
 * Floor-plan 상태 변경을 트랜잭션 커밋 이후 다른 계층으로 전달하는 내부 이벤트이다.
 */
public record FloorPlanStatusChangedEvent(
        UUID projectId,
        String eventName,
        FloorPlanStatusSseResponse payload
) {
}
