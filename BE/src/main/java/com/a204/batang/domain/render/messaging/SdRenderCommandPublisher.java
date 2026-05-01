package com.a204.batang.domain.render.messaging;

import com.a204.batang.domain.render.messaging.dto.SdRenderCommandMessage;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SdRenderCommandPublisher {

    private final RabbitTemplate rabbitTemplate;

    public void publish(SdRenderCommandMessage message) {
        try {
            rabbitTemplate.convertAndSend(
                    RabbitMqConfig.COMMAND_EXCHANGE,
                    RabbitMqConfig.SD_RENDER_COMMAND_ROUTING_KEY,
                    message
            );
        } catch (RuntimeException e) {
            throw new CustomException(ErrorCode.RENDER_COMMAND_PUBLISH_FAILED);
        }
    }
}
