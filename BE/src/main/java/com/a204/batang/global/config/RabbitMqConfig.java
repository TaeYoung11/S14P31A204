package com.a204.batang.global.config;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
import com.a204.batang.domain.floorplan.messaging.FloorPlanGenerateCorrelationData;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanPublishFailedEvent;
import com.a204.batang.domain.render.messaging.SdRenderCorrelationData;
import com.a204.batang.domain.render.messaging.event.SdRenderPublishFailedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.ExchangeBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.annotation.EnableRabbit;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * RabbitMQ exchange, queue, binding, callback 구성을 담당한다.
 *
 * render와 floor-plan은 같은 RabbitTemplate을 공유하지만, publish failure 후속 처리는
 * correlation data 타입으로 분리한다. 그래야 callback 책임이 섞이지 않고 각 도메인의
 * 재시도/실패 정책을 독립적으로 유지할 수 있다.
 */
@Slf4j
@EnableRabbit
@EnableAsync
@Configuration
public class RabbitMqConfig {

    public static final String COMMAND_EXCHANGE = "batang.commands.exchange";
    public static final String EVENT_EXCHANGE = "batang.events.exchange";
    public static final String DLX_EXCHANGE = "batang.dlx.exchange";

    public static final String SD_RENDER_COMMAND_QUEUE = "batang.sd-render.command.queue";
    public static final String IFC_GENERATE_COMMAND_QUEUE = "batang.ifc-generate.command.queue";
    public static final String BE_JOB_EVENTS_QUEUE = "batang.be.job-events.queue";
    public static final String SD_RENDER_DLQ = "batang.sd-render.dlq";
    public static final String IFC_GENERATE_DLQ = "batang.ifc-generate.dlq";

    public static final String SD_RENDER_COMMAND_ROUTING_KEY = "command.sd-render.generate";
    public static final String SD_RENDER_COMMAND_BINDING_PATTERN = "command.sd-render.*";
    public static final String IFC_GENERATE_COMMAND_ROUTING_KEY =
            FloorPlanConstants.COMMAND_ROUTING_KEY_IFC_GENERATE_FROM_BUBBLE;
    public static final String IFC_GENERATE_COMMAND_BINDING_PATTERN =
            FloorPlanConstants.COMMAND_BINDING_PATTERN_IFC_GENERATE;
    public static final String BE_EVENTS_BINDING_PATTERN = "event.#";
    public static final String SD_RENDER_DEAD_ROUTING_KEY = "dead.sd-render";
    public static final String IFC_GENERATE_DEAD_ROUTING_KEY = "dead.ifc-generate";

    @Bean
    public TopicExchange commandExchange() {
        return ExchangeBuilder.topicExchange(COMMAND_EXCHANGE)
                .durable(true)
                .build();
    }

    @Bean
    public TopicExchange eventExchange() {
        return ExchangeBuilder.topicExchange(EVENT_EXCHANGE)
                .durable(true)
                .build();
    }

    @Bean
    public DirectExchange deadLetterExchange() {
        return ExchangeBuilder.directExchange(DLX_EXCHANGE)
                .durable(true)
                .build();
    }

    @Bean
    public Queue sdRenderCommandQueue() {
        return QueueBuilder.durable(SD_RENDER_COMMAND_QUEUE)
                .deadLetterExchange(DLX_EXCHANGE)
                .deadLetterRoutingKey(SD_RENDER_DEAD_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue ifcGenerateCommandQueue() {
        return QueueBuilder.durable(IFC_GENERATE_COMMAND_QUEUE)
                .deadLetterExchange(DLX_EXCHANGE)
                .deadLetterRoutingKey(IFC_GENERATE_DEAD_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue beJobEventsQueue() {
        // worker event는 render/floor-plan이 같은 BE consumer queue에서 함께 받는다.
        // 도메인별 필터링은 listener 쪽에서 수행한다.
        return QueueBuilder.durable(BE_JOB_EVENTS_QUEUE)
                .deadLetterExchange(DLX_EXCHANGE)
                .deadLetterRoutingKey(SD_RENDER_DEAD_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue sdRenderDlq() {
        return QueueBuilder.durable(SD_RENDER_DLQ).build();
    }

    @Bean
    public Queue ifcGenerateDlq() {
        return QueueBuilder.durable(IFC_GENERATE_DLQ).build();
    }

    @Bean
    public Binding sdRenderCommandBinding(Queue sdRenderCommandQueue, TopicExchange commandExchange) {
        return BindingBuilder.bind(sdRenderCommandQueue)
                .to(commandExchange)
                .with(SD_RENDER_COMMAND_BINDING_PATTERN);
    }

    @Bean
    public Binding ifcGenerateCommandBinding(Queue ifcGenerateCommandQueue, TopicExchange commandExchange) {
        return BindingBuilder.bind(ifcGenerateCommandQueue)
                .to(commandExchange)
                .with(IFC_GENERATE_COMMAND_BINDING_PATTERN);
    }

    @Bean
    public Binding beJobEventsBinding(Queue beJobEventsQueue, TopicExchange eventExchange) {
        return BindingBuilder.bind(beJobEventsQueue)
                .to(eventExchange)
                .with(BE_EVENTS_BINDING_PATTERN);
    }

    @Bean
    public Binding sdRenderDlqBinding(Queue sdRenderDlq, DirectExchange deadLetterExchange) {
        return BindingBuilder.bind(sdRenderDlq)
                .to(deadLetterExchange)
                .with(SD_RENDER_DEAD_ROUTING_KEY);
    }

    @Bean
    public Binding ifcGenerateDlqBinding(Queue ifcGenerateDlq, DirectExchange deadLetterExchange) {
        return BindingBuilder.bind(ifcGenerateDlq)
                .to(deadLetterExchange)
                .with(IFC_GENERATE_DEAD_ROUTING_KEY);
    }

    @Bean
    public MessageConverter rabbitMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean(name = "floorPlanPublishFailureExecutor")
    public Executor floorPlanPublishFailureExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("floor-plan-publish-failure-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.initialize();
        return executor;
    }

    @Bean
    public RabbitTemplate rabbitTemplate(
            ConnectionFactory connectionFactory,
            ApplicationEventPublisher eventPublisher,
            ObjectMapper objectMapper
    ) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(rabbitMessageConverter());

        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (ack) {
                log.debug("[RabbitMQ] 메시지 발행 ACK를 확인했습니다.");
                return;
            }

            log.error("[RabbitMQ] 메시지 발행 NACK. cause={}", cause);
            if (correlationData instanceof SdRenderCorrelationData sdCorrelationData) {
                eventPublisher.publishEvent(new SdRenderPublishFailedEvent(
                        sdCorrelationData.getMessage(),
                        cause,
                        false
                ));
            } else if (correlationData instanceof FloorPlanGenerateCorrelationData floorPlanCorrelationData) {
                // floor-plan은 confirm NACK를 publish 실패 경로로 명시적으로 전이한다.
                eventPublisher.publishEvent(new FloorPlanPublishFailedEvent(
                        floorPlanCorrelationData.getMessage(),
                        cause,
                        false
                ));
            }
        });

        template.setMandatory(true);
        template.setReturnsCallback(returned -> {
            log.error(
                    "[RabbitMQ] 메시지 returned. code={}, text={}, exchange={}, routingKey={}",
                    returned.getReplyCode(),
                    returned.getReplyText(),
                    returned.getExchange(),
                    returned.getRoutingKey()
            );

            if (!IFC_GENERATE_COMMAND_ROUTING_KEY.equals(returned.getRoutingKey())) {
                return;
            }

            try {
                // floor-plan은 returned를 라우팅 실패로 간주하고 즉시 실패 처리한다.
                // 같은 메시지를 재발행해도 설정 오류면 반복 실패할 가능성이 크기 때문이다.
                FloorPlanGenerateCommandMessage message = objectMapper.readValue(
                        returned.getMessage().getBody(),
                        FloorPlanGenerateCommandMessage.class
                );
                String cause = "returned: code=%s, text=%s, exchange=%s, routingKey=%s".formatted(
                        returned.getReplyCode(),
                        returned.getReplyText(),
                        returned.getExchange(),
                        returned.getRoutingKey()
                );
                eventPublisher.publishEvent(new FloorPlanPublishFailedEvent(message, cause, true));
            } catch (Exception e) {
                log.error("[RabbitMQ] Floor-plan returned 메시지 복원에 실패했습니다.", e);
            }
        });

        return template;
    }
}
