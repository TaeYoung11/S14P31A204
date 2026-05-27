package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditCommandPublishRequestedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditPublishFailedEvent;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.ATTEMPT_NO;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.COMMAND_TYPE_IFC_EDIT_APPLY;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.MAX_ATTEMPTS;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.TOTAL_STEPS_DIRECT;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class IfcEditCommandPublishRequestedEventListenerTest {

    @Mock private IfcEditCommandPublisher ifcEditCommandPublisher;
    @Mock private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private IfcEditCommandPublishRequestedEventListener listener;

    @Test
    void handleCommandPublishRequested_publishesMessage() {
        IfcEditCommandMessage message = buildCommandMessage();

        listener.handleCommandPublishRequested(new IfcEditCommandPublishRequestedEvent(message));

        verify(ifcEditCommandPublisher).publish(message);
    }

    @Test
    void handleCommandPublishRequested_failure_publishesFailedEvent() {
        IfcEditCommandMessage message = buildCommandMessage();
        doThrow(new CustomException(ErrorCode.IFC_EDIT_COMMAND_PUBLISH_FAILED))
                .when(ifcEditCommandPublisher).publish(message);

        listener.handleCommandPublishRequested(new IfcEditCommandPublishRequestedEvent(message));

        verify(eventPublisher).publishEvent(any(IfcEditPublishFailedEvent.class));
    }

    private IfcEditCommandMessage buildCommandMessage() {
        ObjectMapper objectMapper = new ObjectMapper();
        return new IfcEditCommandMessage(
                UUID.randomUUID(), "v1", "COMMAND",
                COMMAND_TYPE_IFC_EDIT_APPLY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY,
                UUID.randomUUID(), UUID.randomUUID(), 1, TOTAL_STEPS_DIRECT,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), null, "IFC_MODEL",
                UUID.randomUUID(), UUID.randomUUID(),
                Map.of("source_ifc_storage_url", "projects/p/revisions/r/ifc/model.v1.ifc"),
                new IfcEditCommandMessage.ExpectedOutput(
                        "projects/p/revisions/new/ifc/model.v1.ifc",
                        "projects/p/jobs/j/steps/001/engine/validation-report.v1.json",
                        null,
                        null
                ),
                objectMapper.createObjectNode(),
                ATTEMPT_NO, MAX_ATTEMPTS,
                "key", UUID.randomUUID(), OffsetDateTime.now()
        );
    }
}
