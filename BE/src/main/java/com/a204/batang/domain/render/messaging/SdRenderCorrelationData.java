package com.a204.batang.domain.render.messaging;

import com.a204.batang.domain.render.messaging.dto.SdRenderCommandMessage;
import lombok.Getter;
import org.springframework.amqp.rabbit.connection.CorrelationData;

/**
 * RabbitMQ 발행 확인(Confirm) 시 원본 메시지를 참조하기 위한 커스텀 CorrelationData.
 */
@Getter
public class SdRenderCorrelationData extends CorrelationData {

    private final SdRenderCommandMessage message;

    public SdRenderCorrelationData(String id, SdRenderCommandMessage message) {
        super(id);
        this.message = message;
    }
}
