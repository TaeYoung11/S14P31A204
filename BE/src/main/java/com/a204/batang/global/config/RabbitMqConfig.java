package com.a204.batang.global.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.ExchangeBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.annotation.EnableRabbit;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * SD render command/event 흐름에 필요한 RabbitMQ 토폴로지를 정의한다.
 */
@EnableRabbit
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
}
