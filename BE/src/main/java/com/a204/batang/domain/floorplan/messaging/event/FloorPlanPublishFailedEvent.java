package com.a204.batang.domain.floorplan.messaging.event;

import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;

/**
 * Floor-plan command publish 실패를 전달하는 내부 이벤트다.
 * confirm NACK과 returned message 후처리에서 공통으로 사용한다.
 */
public record FloorPlanPublishFailedEvent(
        FloorPlanGenerateCommandMessage message,
        String cause,
        boolean returned
) {
}
