package com.a204.batang.domain.job.messaging;

import com.a204.batang.domain.floorplan.messaging.FloorPlanGenerateEventListener;
import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateEventMessage;
import com.a204.batang.domain.ifcedit.messaging.IfcEditEventDispatcher;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditEventMessage;
import com.a204.batang.domain.job.messaging.dto.CommonJobEventMessage;
import com.a204.batang.domain.render.messaging.SdRenderEventListener;
import com.a204.batang.domain.render.messaging.dto.SdRenderEventMessage;
import com.a204.batang.global.config.RabbitMqConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.EVENT_PREFIX_IFC_EDIT_APPLY;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.EVENT_PREFIX_THREE_D_LLM;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.EVENT_PREFIX_TWO_D_LLM;

/**
 * BE job event queue를 단일 consumer로 수신하고 도메인별 handler로 전달한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JobEventOrchestrator {

    private static final String FLOOR_PLAN_EVENT_PREFIX = "IFC_GENERATE_FROM_BUBBLE_";
    private static final String RENDER_EVENT_PREFIX = "SD_RENDER_";

    private final ObjectMapper objectMapper;
    private final FloorPlanGenerateEventListener floorPlanGenerateEventListener;
    private final SdRenderEventListener sdRenderEventListener;
    private final IfcEditEventDispatcher ifcEditEventDispatcher;

    @RabbitListener(queues = RabbitMqConfig.BE_JOB_EVENTS_QUEUE)
    @Transactional
    public void consume(Message message) {
        try {
            handle(objectMapper.readTree(message.getBody()));
        } catch (Exception e) {
            log.warn("worker event payload를 해석하지 못해 메시지를 무시합니다.", e);
        }
    }

    void handle(JsonNode payload) {
        CommonJobEventMessage event = objectMapper.convertValue(payload, CommonJobEventMessage.class);
        if (event == null || event.eventType() == null) {
            log.warn("지원하지 않는 worker event를 무시합니다. payload={}", payload);
            return;
        }

        if (event.eventType().startsWith(FLOOR_PLAN_EVENT_PREFIX)) {
            floorPlanGenerateEventListener.handle(objectMapper.convertValue(payload, FloorPlanGenerateEventMessage.class));
            return;
        }
        if (event.eventType().startsWith(RENDER_EVENT_PREFIX)) {
            sdRenderEventListener.handle(objectMapper.convertValue(payload, SdRenderEventMessage.class));
            return;
        }
        if (event.eventType().startsWith(EVENT_PREFIX_TWO_D_LLM)
                || event.eventType().startsWith(EVENT_PREFIX_THREE_D_LLM)
                || event.eventType().startsWith(EVENT_PREFIX_IFC_EDIT_APPLY)) {
            ifceditDispatch(payload);
            return;
        }

        log.info("지원하지 않는 worker event를 무시합니다. eventType={}, jobId={}, jobStepId={}",
                event.eventType(), event.jobId(), event.jobStepId());
    }

    private void ifceditDispatch(JsonNode payload) {
        ifcEditEventDispatcher.handle(objectMapper.convertValue(payload, IfcEditEventMessage.class));
    }
}
