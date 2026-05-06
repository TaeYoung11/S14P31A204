package com.a204.batang.global.config;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
import com.a204.batang.domain.floorplan.messaging.FloorPlanGenerateCorrelationData;
import com.a204.batang.domain.floorplan.messaging.FloorPlanGenerateCommandPublisher;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;
import com.a204.batang.domain.floorplan.messaging.event.FloorPlanPublishFailedEvent;
import com.a204.batang.domain.ifcedit.messaging.IfcEditCommandCorrelationData;
import com.a204.batang.domain.ifcedit.messaging.IfcEditCommandPublisher;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditPublishFailedEvent;
import com.a204.batang.domain.render.messaging.SdRenderCorrelationData;
import com.a204.batang.domain.render.messaging.event.SdRenderPublishFailedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.ExchangeBuilder;
import org.springframework.amqp.core.Message;
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

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
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
    public static final String BE_JOB_EVENTS_DLQ = "batang.be.job-events.dlq";

    public static final String SD_RENDER_COMMAND_ROUTING_KEY = "command.sd-render.generate";
    public static final String SD_RENDER_COMMAND_BINDING_PATTERN = "command.sd-render.*";
    public static final String IFC_GENERATE_COMMAND_ROUTING_KEY =
            FloorPlanConstants.COMMAND_ROUTING_KEY_IFC_GENERATE_FROM_BUBBLE;
    public static final String IFC_GENERATE_COMMAND_BINDING_PATTERN =
            FloorPlanConstants.COMMAND_BINDING_PATTERN_IFC_GENERATE;
    public static final String BE_EVENTS_BINDING_PATTERN = "event.#";
    public static final String SD_RENDER_DEAD_ROUTING_KEY = "dead.sd-render";
    public static final String IFC_GENERATE_DEAD_ROUTING_KEY = "dead.ifc-generate";
    public static final String BE_JOB_EVENTS_DEAD_ROUTING_KEY = "dead.be.job-events";

    public static final String IFC_EDIT_COMMAND_QUEUE = "batang.ifc-edit.command.queue";
    public static final String TWO_D_LLM_COMMAND_QUEUE = "batang.two-d-llm.command.queue";
    public static final String THREE_D_LLM_COMMAND_QUEUE = "batang.three-d-llm.command.queue";
    public static final String IFC_EDIT_DLQ = "batang.ifc-edit.dlq";
    public static final String TWO_D_LLM_DLQ = "batang.two-d-llm.dlq";
    public static final String THREE_D_LLM_DLQ = "batang.three-d-llm.dlq";

    public static final String IFC_EDIT_COMMAND_ROUTING_KEY = "command.ifc-edit.apply";
    public static final String TWO_D_LLM_COMMAND_ROUTING_KEY = "command.two-d-llm.generate";
    public static final String THREE_D_LLM_COMMAND_ROUTING_KEY = "command.three-d-llm.generate";
    public static final String IFC_EDIT_COMMAND_BINDING_PATTERN = "command.ifc-edit.*";
    public static final String TWO_D_LLM_COMMAND_BINDING_PATTERN = "command.two-d-llm.*";
    public static final String THREE_D_LLM_COMMAND_BINDING_PATTERN = "command.three-d-llm.*";
    public static final String IFC_EDIT_DEAD_ROUTING_KEY = "dead.ifc-edit";
    public static final String TWO_D_LLM_DEAD_ROUTING_KEY = "dead.two-d-llm";
    public static final String THREE_D_LLM_DEAD_ROUTING_KEY = "dead.three-d-llm";

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
        // worker event는 render/floor-plan/ifc-edit이 같은 BE consumer queue에서 함께 받는다.
        // 도메인별 필터링은 listener 쪽에서 수행한다.
        return QueueBuilder.durable(BE_JOB_EVENTS_QUEUE)
                .deadLetterExchange(DLX_EXCHANGE)
                .deadLetterRoutingKey(BE_JOB_EVENTS_DEAD_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue ifcEditCommandQueue() {
        return QueueBuilder.durable(IFC_EDIT_COMMAND_QUEUE)
                .deadLetterExchange(DLX_EXCHANGE)
                .deadLetterRoutingKey(IFC_EDIT_DEAD_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue twoDLlmCommandQueue() {
        return QueueBuilder.durable(TWO_D_LLM_COMMAND_QUEUE)
                .deadLetterExchange(DLX_EXCHANGE)
                .deadLetterRoutingKey(TWO_D_LLM_DEAD_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue threeDLlmCommandQueue() {
        return QueueBuilder.durable(THREE_D_LLM_COMMAND_QUEUE)
                .deadLetterExchange(DLX_EXCHANGE)
                .deadLetterRoutingKey(THREE_D_LLM_DEAD_ROUTING_KEY)
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
    public Queue beJobEventsDlq() {
        return QueueBuilder.durable(BE_JOB_EVENTS_DLQ).build();
    }

    @Bean
    public Queue ifcEditDlq() {
        return QueueBuilder.durable(IFC_EDIT_DLQ).build();
    }

    @Bean
    public Queue twoDLlmDlq() {
        return QueueBuilder.durable(TWO_D_LLM_DLQ).build();
    }

    @Bean
    public Queue threeDLlmDlq() {
        return QueueBuilder.durable(THREE_D_LLM_DLQ).build();
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
    public Binding beJobEventsDlqBinding(Queue beJobEventsDlq, DirectExchange deadLetterExchange) {
        return BindingBuilder.bind(beJobEventsDlq)
                .to(deadLetterExchange)
                .with(BE_JOB_EVENTS_DEAD_ROUTING_KEY);
    }

    @Bean
    public Binding ifcEditCommandBinding(Queue ifcEditCommandQueue, TopicExchange commandExchange) {
        return BindingBuilder.bind(ifcEditCommandQueue)
                .to(commandExchange)
                .with(IFC_EDIT_COMMAND_BINDING_PATTERN);
    }

    @Bean
    public Binding twoDLlmCommandBinding(Queue twoDLlmCommandQueue, TopicExchange commandExchange) {
        return BindingBuilder.bind(twoDLlmCommandQueue)
                .to(commandExchange)
                .with(TWO_D_LLM_COMMAND_BINDING_PATTERN);
    }

    @Bean
    public Binding threeDLlmCommandBinding(Queue threeDLlmCommandQueue, TopicExchange commandExchange) {
        return BindingBuilder.bind(threeDLlmCommandQueue)
                .to(commandExchange)
                .with(THREE_D_LLM_COMMAND_BINDING_PATTERN);
    }

    @Bean
    public Binding ifcEditDlqBinding(Queue ifcEditDlq, DirectExchange deadLetterExchange) {
        return BindingBuilder.bind(ifcEditDlq)
                .to(deadLetterExchange)
                .with(IFC_EDIT_DEAD_ROUTING_KEY);
    }

    @Bean
    public Binding twoDLlmDlqBinding(Queue twoDLlmDlq, DirectExchange deadLetterExchange) {
        return BindingBuilder.bind(twoDLlmDlq)
                .to(deadLetterExchange)
                .with(TWO_D_LLM_DEAD_ROUTING_KEY);
    }

    @Bean
    public Binding threeDLlmDlqBinding(Queue threeDLlmDlq, DirectExchange deadLetterExchange) {
        return BindingBuilder.bind(threeDLlmDlq)
                .to(deadLetterExchange)
                .with(THREE_D_LLM_DEAD_ROUTING_KEY);
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

    @Bean(name = "ifcEditPublishFailureExecutor")
    public Executor ifcEditPublishFailureExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("ifc-edit-publish-failure-");
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
            } else if (correlationData instanceof IfcEditCommandCorrelationData ifcEditCorrelationData) {
                eventPublisher.publishEvent(new IfcEditPublishFailedEvent(
                        ifcEditCorrelationData.getMessage(),
                        cause,
                        false
                ));
            }
        });

        template.setMandatory(true);
        template.setReturnsCallback(returned -> {
            log.error(
                    "[RabbitMQ] message returned. code={}, text={}, exchange={}, routingKey={}",
                    returned.getReplyCode(),
                    returned.getReplyText(),
                    returned.getExchange(),
                    returned.getRoutingKey()
            );

            String routingKey = returned.getRoutingKey();
            if (IFC_GENERATE_COMMAND_ROUTING_KEY.equals(routingKey)) {
                try {
                    // floor-plan은 returned를 라우팅 실패로 간주하고 즉시 실패 처리한다.
                    // 같은 메시지를 재발행해도 설정 오류면 반복 실패할 가능성이 크기 때문이다.
                    FloorPlanGenerateCommandMessage message = readReturnedFloorPlanMessage(objectMapper, returned.getMessage());
                    String cause = "returned: code=%s, text=%s, exchange=%s, routingKey=%s".formatted(
                            returned.getReplyCode(),
                            returned.getReplyText(),
                            returned.getExchange(),
                            returned.getRoutingKey()
                    );
                    eventPublisher.publishEvent(new FloorPlanPublishFailedEvent(message, cause, true));
                } catch (Exception e) {
                    log.error(
                            "[RabbitMQ] Floor-plan returned 메시지 복원에 실패했습니다. exchange={}, routingKey={}, headers={}, body={}",
                            returned.getExchange(),
                            returned.getRoutingKey(),
                            returned.getMessage().getMessageProperties().getHeaders(),
                            new String(returned.getMessage().getBody(), StandardCharsets.UTF_8),
                            e
                    );
                }
            } else if (IFC_EDIT_COMMAND_ROUTING_KEY.equals(routingKey)
                    || TWO_D_LLM_COMMAND_ROUTING_KEY.equals(routingKey)
                    || THREE_D_LLM_COMMAND_ROUTING_KEY.equals(routingKey)) {
                try {
                    // IFC Edit 계열 returned 처리는 현재 공용 callback에 남아 있다.
                    // callback 구조의 전면 추상화는 별도 리팩터링 범위로 남긴다.
                    IfcEditCommandMessage message = readReturnedIfcEditMessage(objectMapper, returned.getMessage());
                    String cause = "returned: code=%s, text=%s, exchange=%s, routingKey=%s".formatted(
                            returned.getReplyCode(),
                            returned.getReplyText(),
                            returned.getExchange(),
                            returned.getRoutingKey()
                    );
                    eventPublisher.publishEvent(new IfcEditPublishFailedEvent(message, cause, true));
                } catch (Exception e) {
                    log.error(
                            "[RabbitMQ] IFC Edit returned 메시지 복원에 실패했습니다. exchange={}, routingKey={}, headers={}, body={}",
                            returned.getExchange(),
                            returned.getRoutingKey(),
                            returned.getMessage().getMessageProperties().getHeaders(),
                            new String(returned.getMessage().getBody(), StandardCharsets.UTF_8),
                            e
                    );
                }
            }
        });

        return template;
    }

    private FloorPlanGenerateCommandMessage readReturnedFloorPlanMessage(ObjectMapper objectMapper, Message returnedMessage)
            throws Exception {
        try {
            return objectMapper.readValue(returnedMessage.getBody(), FloorPlanGenerateCommandMessage.class);
        } catch (Exception ignored) {
            return reconstructFloorPlanMessageFromHeaders(returnedMessage.getMessageProperties().getHeaders());
        }
    }

    private FloorPlanGenerateCommandMessage reconstructFloorPlanMessageFromHeaders(Map<String, Object> headers) {
        return new FloorPlanGenerateCommandMessage(
                readUuidHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_MESSAGE_ID),
                readStringHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_SCHEMA_VERSION),
                readStringHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_MESSAGE_TYPE),
                readStringHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_COMMAND_TYPE),
                readStringHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_ROUTING_KEY),
                readUuidHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_JOB_ID),
                readUuidHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_JOB_STEP_ID),
                readIntegerHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_STEP_NO),
                readIntegerHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_TOTAL_STEPS),
                readUuidHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_PROJECT_ID),
                readUuidHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_REQUESTED_BY),
                null,
                null,
                readStringHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_SOURCE_SCENE_TYPE),
                readUuidHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_TARGET_REVISION_ID),
                readUuidHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_EXPECTED_OUTPUT_ARTIFACT_ID),
                null,
                new FloorPlanGenerateCommandMessage.ExpectedOutput(
                        readStringHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_IFC_STORAGE_URL),
                        readNullableStringHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_VALIDATION_REPORT_STORAGE_URL)
                ),
                null,
                readIntegerHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_ATTEMPT_NO),
                readIntegerHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_MAX_ATTEMPTS),
                readStringHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_IDEMPOTENCY_KEY),
                readUuidHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_CORRELATION_ID),
                OffsetDateTime.parse(readStringHeader(headers, FloorPlanGenerateCommandPublisher.HEADER_CREATED_AT))
        );
    }

    private UUID readUuidHeader(Map<String, Object> headers, String key) {
        return UUID.fromString(readStringHeader(headers, key));
    }

    private Integer readIntegerHeader(Map<String, Object> headers, String key) {
        Object value = headers.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.valueOf(String.valueOf(value));
    }

    private String readStringHeader(Map<String, Object> headers, String key) {
        Object value = headers.get(key);
        if (value == null) {
            throw new IllegalArgumentException("Missing RabbitMQ header: " + key);
        }
        return String.valueOf(value);
    }

    private String readNullableStringHeader(Map<String, Object> headers, String key) {
        Object value = headers.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private IfcEditCommandMessage readReturnedIfcEditMessage(ObjectMapper objectMapper, Message returnedMessage)
            throws Exception {
        try {
            return objectMapper.readValue(returnedMessage.getBody(), IfcEditCommandMessage.class);
        } catch (Exception ignored) {
            return reconstructIfcEditMessageFromHeaders(returnedMessage.getMessageProperties().getHeaders());
        }
    }

    private IfcEditCommandMessage reconstructIfcEditMessageFromHeaders(Map<String, Object> headers) {
        return new IfcEditCommandMessage(
                readUuidHeader(headers, IfcEditCommandPublisher.HEADER_MESSAGE_ID),
                readStringHeader(headers, IfcEditCommandPublisher.HEADER_SCHEMA_VERSION),
                readStringHeader(headers, IfcEditCommandPublisher.HEADER_MESSAGE_TYPE),
                readStringHeader(headers, IfcEditCommandPublisher.HEADER_COMMAND_TYPE),
                readStringHeader(headers, IfcEditCommandPublisher.HEADER_ROUTING_KEY),
                readUuidHeader(headers, IfcEditCommandPublisher.HEADER_JOB_ID),
                readUuidHeader(headers, IfcEditCommandPublisher.HEADER_JOB_STEP_ID),
                readIntegerHeader(headers, IfcEditCommandPublisher.HEADER_STEP_NO),
                readIntegerHeader(headers, IfcEditCommandPublisher.HEADER_TOTAL_STEPS),
                readUuidHeader(headers, IfcEditCommandPublisher.HEADER_PROJECT_ID),
                readUuidHeader(headers, IfcEditCommandPublisher.HEADER_REQUESTED_BY),
                null,
                null,
                readStringHeader(headers, IfcEditCommandPublisher.HEADER_SOURCE_SCENE_TYPE),
                readUuidHeader(headers, IfcEditCommandPublisher.HEADER_TARGET_REVISION_ID),
                readUuidHeader(headers, IfcEditCommandPublisher.HEADER_EXPECTED_OUTPUT_ARTIFACT_ID),
                null,
                new IfcEditCommandMessage.ExpectedOutput(
                        readStringHeader(headers, IfcEditCommandPublisher.HEADER_IFC_STORAGE_URL),
                        readNullableStringHeader(headers, IfcEditCommandPublisher.HEADER_VALIDATION_REPORT_STORAGE_URL),
                        readNullableStringHeader(headers, IfcEditCommandPublisher.HEADER_EDIT_PLAN_STORAGE_URL)
                ),
                null,
                readIntegerHeader(headers, IfcEditCommandPublisher.HEADER_ATTEMPT_NO),
                readIntegerHeader(headers, IfcEditCommandPublisher.HEADER_MAX_ATTEMPTS),
                readStringHeader(headers, IfcEditCommandPublisher.HEADER_IDEMPOTENCY_KEY),
                readUuidHeader(headers, IfcEditCommandPublisher.HEADER_CORRELATION_ID),
                OffsetDateTime.parse(readStringHeader(headers, IfcEditCommandPublisher.HEADER_CREATED_AT))
        );
    }
}
