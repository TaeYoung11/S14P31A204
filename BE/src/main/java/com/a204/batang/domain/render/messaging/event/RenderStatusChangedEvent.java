package com.a204.batang.domain.render.messaging.event;

import com.a204.batang.domain.render.dto.RenderStatusSseResponse;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.UUID;

/**
 * 렌더링 상태 변경을 알리는 내부 이벤트.
 * 트랜잭션 성공 후 SSE 발송을 보장하기 위해 사용된다.
 */
@Getter
@RequiredArgsConstructor
public class RenderStatusChangedEvent {
    private final UUID projectId;
    private final String eventName;
    private final RenderStatusSseResponse payload;
}
