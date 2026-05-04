package com.a204.batang.domain.render.messaging.event;

import com.a204.batang.domain.render.messaging.dto.SdRenderCommandMessage;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * RabbitMQ 메시지 발행 실패(NACK 또는 Returned) 시 발생하는 내부 이벤트.
 */
@Getter
@RequiredArgsConstructor
public class SdRenderPublishFailedEvent {
    private final SdRenderCommandMessage message;
    private final String cause;
    private final boolean isReturned; // true면 Returned(라우팅 실패), false면 NACK(브로커 도달 실패)
}
