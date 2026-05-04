package com.a204.batang.domain.render.messaging;

import com.a204.batang.domain.render.messaging.dto.SdRenderCommandMessage;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class SdRenderCommandPublisher {

    private final RabbitTemplate rabbitTemplate;

    public void publish(SdRenderCommandMessage message) {
        log.info("[🚀 RabbitMQ] 메시지 발행 중... Exchange: {}, RoutingKey: {}", 
                RabbitMqConfig.COMMAND_EXCHANGE, RabbitMqConfig.SD_RENDER_COMMAND_ROUTING_KEY);
        try {
            rabbitTemplate.convertAndSend(
                    RabbitMqConfig.COMMAND_EXCHANGE,
                    RabbitMqConfig.SD_RENDER_COMMAND_ROUTING_KEY,
                    message,
                    new SdRenderCorrelationData(message.jobId().toString(), message)
            );
        } catch (RuntimeException e) {
            throw new CustomException(ErrorCode.RENDER_COMMAND_PUBLISH_FAILED);
        }
    }
}
