package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditEventMessage;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.EVENT_IFC_EDIT_APPLY_STARTED;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.EVENT_THREE_D_LLM_STARTED;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.EVENT_TWO_D_LLM_STARTED;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.WORKER_TYPE_IFC_EDIT_APPLY;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class IfcEditEventDispatcherTest {

    @Mock private TwoDLlmEventListener twoDLlmEventListener;
    @Mock private ThreeDLlmEventListener threeDLlmEventListener;
    @Mock private IfcEditApplyEventListener ifcEditApplyEventListener;

    @InjectMocks
    private IfcEditEventDispatcher dispatcher;

    @Test
    void handle_twoDLlmEvent_dispatchesToTwoDHandler() {
        IfcEditEventMessage event = buildEvent(EVENT_TWO_D_LLM_STARTED);

        dispatcher.handle(event);

        verify(twoDLlmEventListener).handle(event);
        verify(threeDLlmEventListener, never()).handle(event);
        verify(ifcEditApplyEventListener, never()).handle(event);
    }

    @Test
    void handle_threeDLlmEvent_dispatchesToThreeDHandler() {
        IfcEditEventMessage event = buildEvent(EVENT_THREE_D_LLM_STARTED);

        dispatcher.handle(event);

        verify(threeDLlmEventListener).handle(event);
        verify(twoDLlmEventListener, never()).handle(event);
        verify(ifcEditApplyEventListener, never()).handle(event);
    }

    @Test
    void handle_ifcEditApplyEvent_dispatchesToApplyHandler() {
        IfcEditEventMessage event = buildEvent(EVENT_IFC_EDIT_APPLY_STARTED);

        dispatcher.handle(event);

        verify(ifcEditApplyEventListener).handle(event);
        verify(twoDLlmEventListener, never()).handle(event);
        verify(threeDLlmEventListener, never()).handle(event);
    }

    @Test
    void handle_unsupportedEventType_ignored() {
        IfcEditEventMessage event = buildEvent("SOMETHING_ELSE");

        dispatcher.handle(event);

        verify(twoDLlmEventListener, never()).handle(event);
        verify(threeDLlmEventListener, never()).handle(event);
        verify(ifcEditApplyEventListener, never()).handle(event);
    }

    @Test
    void handle_nullEventType_throwsInvalidEvent() {
        IfcEditEventMessage event = buildEvent(null);

        assertThatThrownBy(() -> dispatcher.handle(event))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.IFC_EDIT_EVENT_INVALID);
    }

    private IfcEditEventMessage buildEvent(String eventType) {
        return new IfcEditEventMessage(
                UUID.randomUUID(), "v1", "EVENT", eventType,
                "event.ifc-edit.apply",
                UUID.randomUUID(), UUID.randomUUID(), 1, 1,
                UUID.randomUUID(), WORKER_TYPE_IFC_EDIT_APPLY, "worker-1",
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "started", 0.0,
                null, null,
                "idempotency-key",
                UUID.randomUUID(), OffsetDateTime.now(ZoneOffset.UTC)
        );
    }
}
