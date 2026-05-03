package com.a204.batang.domain.floorplan.messaging.event;

import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;

/**
 * Floor-plan command를 트랜잭션 커밋 이후에 발행하기 위한 내부 이벤트다.
 */
public record FloorPlanCommandPublishRequestedEvent(
        FloorPlanGenerateCommandMessage message
) {
}
