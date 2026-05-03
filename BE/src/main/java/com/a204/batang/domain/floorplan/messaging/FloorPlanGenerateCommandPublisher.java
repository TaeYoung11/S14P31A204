package com.a204.batang.domain.floorplan.messaging;

import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

/**
 * Floor-plan generate command를 RabbitMQ로 발행한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FloorPlanGenerateCommandPublisher {

    private final RabbitTemplate rabbitTemplate;

    public void publish(FloorPlanGenerateCommandMessage message) {
        try {
            log.info(
                    "Floor-plan command 발행을 시도합니다. projectId={}, jobId={}, jobStepId={}, correlationId={}, attemptNo={}, maxAttempts={}",
                    message.projectId(),
                    message.jobId(),
                    message.jobStepId(),
                    message.correlationId(),
                    message.attemptNo(),
                    message.maxAttempts()
            );

            rabbitTemplate.convertAndSend(
                    RabbitMqConfig.COMMAND_EXCHANGE,
                    RabbitMqConfig.IFC_GENERATE_COMMAND_ROUTING_KEY,
                    message,
                    new FloorPlanGenerateCorrelationData(message.jobId().toString(), message)
            );
        } catch (RuntimeException e) {
            log.error(
                    "Floor-plan command 발행에 실패했습니다. projectId={}, jobId={}, jobStepId={}, correlationId={}, attemptNo={}, maxAttempts={}",
                    message.projectId(),
                    message.jobId(),
                    message.jobStepId(),
                    message.correlationId(),
                    message.attemptNo(),
                    message.maxAttempts(),
                    e
            );
            throw new CustomException(ErrorCode.FLOOR_PLAN_COMMAND_PUBLISH_FAILED);
        }
    }
}
