package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.event.PinCreatedEvent;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 새 핀 등록 SSE 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param authorUserId 핀 작성자 사용자 ID
 * @param content 핀 본문
 * @param createdAt 핀 생성 시각
 */
public record PinCreatedSseResponse(
        UUID projectId,
        UUID pinId,
        UUID authorUserId,
        String content,
        LocalDateTime createdAt
) {

    /**
     * 새 핀 생성 이벤트를 SSE 응답 DTO로 변환한다.
     *
     * @param event 새 핀 생성 이벤트
     * @return 새 핀 등록 SSE 응답
     */
    public static PinCreatedSseResponse from(PinCreatedEvent event) {
        return new PinCreatedSseResponse(
                event.projectId(),
                event.pinId(),
                event.authorUserId(),
                event.content(),
                event.createdAt()
        );
    }
}
