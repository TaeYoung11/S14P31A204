package com.a204.batang.domain.pin.event;

import com.a204.batang.domain.pin.service.ProjectPinSseService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 새 핀 생성 이벤트를 수신해 SSE 알림 전송으로 연결한다.
 */
@Component
@RequiredArgsConstructor
public class ProjectPinSseEventListener {

    private final ProjectPinSseService projectPinSseService;

    /**
     * 트랜잭션 커밋 이후 새 핀 이벤트를 SSE로 전송한다.
     *
     * @param event 새 핀 생성 이벤트
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handlePinCreatedEvent(PinCreatedEvent event) {
        projectPinSseService.publishPinCreated(event);
    }
}
