package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.messaging.event.IfcEditCommandPublishRequestedEvent;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditPublishFailedEvent;
import com.a204.batang.global.exception.CustomException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class IfcEditCommandPublishRequestedEventListener {

    private final IfcEditCommandPublisher ifcEditCommandPublisher;
    private final ApplicationEventPublisher eventPublisher;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleCommandPublishRequested(IfcEditCommandPublishRequestedEvent event) {
        try {
            ifcEditCommandPublisher.publish(event.message());
        } catch (CustomException e) {
            eventPublisher.publishEvent(new IfcEditPublishFailedEvent(event.message(), e.getMessage(), false));
        }
    }
}
