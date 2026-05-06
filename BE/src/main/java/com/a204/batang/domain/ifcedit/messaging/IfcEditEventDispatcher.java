package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditEventMessage;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.EVENT_PREFIX_IFC_EDIT_APPLY;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.EVENT_PREFIX_THREE_D_LLM;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.EVENT_PREFIX_TWO_D_LLM;

@Slf4j
@Component
@RequiredArgsConstructor
public class IfcEditEventDispatcher {

    private final TwoDLlmEventListener twoDLlmEventListener;
    private final ThreeDLlmEventListener threeDLlmEventListener;
    private final IfcEditApplyEventListener ifcEditApplyEventListener;

    @RabbitListener(queues = RabbitMqConfig.BE_JOB_EVENTS_QUEUE)
    @Transactional
    public void handle(IfcEditEventMessage event) {
        if (event == null || event.eventType() == null) {
            throw new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID);
        }

        if (event.eventType().startsWith(EVENT_PREFIX_TWO_D_LLM)) {
            twoDLlmEventListener.handle(event);
            return;
        }
        if (event.eventType().startsWith(EVENT_PREFIX_THREE_D_LLM)) {
            threeDLlmEventListener.handle(event);
            return;
        }
        if (event.eventType().startsWith(EVENT_PREFIX_IFC_EDIT_APPLY)) {
            ifcEditApplyEventListener.handle(event);
            return;
        }

        log.info("Unsupported IFC Edit event type ignored. eventType={}, jobId={}, jobStepId={}",
                event.eventType(), event.jobId(), event.jobStepId());
    }
}
