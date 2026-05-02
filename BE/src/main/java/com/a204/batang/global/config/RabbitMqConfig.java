package com.a204.batang.global.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.ExchangeBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.annotation.EnableRabbit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import com.a204.batang.domain.render.messaging.SdRenderCorrelationData;
import com.a204.batang.domain.render.messaging.event.SdRenderPublishFailedEvent;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * SD render command/event 흐름에 필요한 RabbitMQ 토폴로지를 정의한다.
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
    public static final String BE_JOB_EVENTS_QUEUE = "batang.be.job-events.queue";
    public static final String SD_RENDER_DLQ = "batang.sd-render.dlq";

    public static final String SD_RENDER_COMMAND_ROUTING_KEY = "command.sd-render.generate";
    public static final String SD_RENDER_COMMAND_BINDING_PATTERN = "command.sd-render.*";
    public static final String BE_EVENTS_BINDING_PATTERN = "event.#";
    public static final String SD_RENDER_DEAD_ROUTING_KEY = "dead.sd-render";

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
    public Queue beJobEventsQueue() {
        return QueueBuilder.durable(BE_JOB_EVENTS_QUEUE)
                .deadLetterExchange(DLX_EXCHANGE)
                .deadLetterRoutingKey(SD_RENDER_DEAD_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue sdRenderDlq() {
        return QueueBuilder.durable(SD_RENDER_DLQ)
                .build();
    }

    @Bean
    public Binding sdRenderCommandBinding(Queue sdRenderCommandQueue, TopicExchange commandExchange) {
        return BindingBuilder.bind(sdRenderCommandQueue)
                .to(commandExchange)
                .with(SD_RENDER_COMMAND_BINDING_PATTERN);
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

    /**
     * publish/consume 모두 동일한 JSON 직렬화 규칙을 사용한다.
     */
    @Bean
    public MessageConverter rabbitMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    /**
     * Publisher Confirm 및 Return 설정을 포함한 RabbitTemplate 빈을 정의한다.
     */
    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory, ApplicationEventPublisher eventPublisher) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(rabbitMessageConverter());

        // Publisher Confirm: 메시지가 익스체인지(Exchange)에 성공적으로 도달했는지 확인
        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (ack) {
                log.info("[✅ RabbitMQ] 메시지 발행 성공 (ACK)");
            } else {
                log.error("[❌ RabbitMQ] 메시지 발행 실패 (NACK): {}", cause);
                if (correlationData instanceof SdRenderCorrelationData sdCorrelationData) {
                    eventPublisher.publishEvent(new SdRenderPublishFailedEvent(
                            sdCorrelationData.getMessage(), cause, false));
                }
            }
        });

        // mandatory=true: Exchange→Queue 라우팅 실패 시 메시지를 반환하도록 Broker에 알림.
        // 이 플래그 없이는 setReturnsCallback()이 등록되어 있어도 절대 호출되지 않음.
        template.setMandatory(true);

        // Publisher Return: 메시지가 익스체인지에는 도달했으나 큐(Queue)로 라우팅되지 못한 경우
        template.setReturnsCallback(returned -> {
            log.error("[⚠️ RabbitMQ] 메시지 반환(Returned): code={}, text={}, exchange={}, routingKey={}, message={}",
                    returned.getReplyCode(), returned.getReplyText(), returned.getExchange(),
                    returned.getRoutingKey(), returned.getMessage());
            
            // Returned 메시지는 별도의 CorrelationData 매핑이 어렵지만, 
            // body를 역직렬화하여 이벤트를 발행할 수 있습니다. (여기서는 로그 우선)
        });

        return template;
    }
}
