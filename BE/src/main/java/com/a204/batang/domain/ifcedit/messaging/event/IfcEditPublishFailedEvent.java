package com.a204.batang.domain.ifcedit.messaging.event;

import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;

/**
 * IFC Edit command publish 실패를 전달하는 내부 이벤트.
 * confirm NACK과 returned message 후처리에서 공통으로 사용한다.
 */
public record IfcEditPublishFailedEvent(
        IfcEditCommandMessage message,
        String cause,
        boolean returned
) {
}
