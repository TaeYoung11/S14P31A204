package com.a204.batang.domain.floorplan.messaging.event;

import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;

/**
 * Floor-plan command publish 실패를 표현하는 내부 이벤트이다.
 * 실제 confirm/returned 후처리는 이후 커밋에서 연결한다.
 */
public record FloorPlanPublishFailedEvent(
        FloorPlanGenerateCommandMessage message,
        String cause,
        boolean returned
) {
}
