package com.a204.batang.domain.pin.event;

import com.a204.batang.domain.pin.entity.ProjectPin;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 새 핀 등록 완료 후 발행되는 도메인 이벤트이다.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param authorUserId 핀 작성자 사용자 ID
 * @param content 핀 본문
 * @param createdAt 핀 생성 시각
 */
public record PinCreatedEvent(
        UUID projectId,
        UUID pinId,
        UUID authorUserId,
        String content,
        LocalDateTime createdAt
) {

    /**
     * 핀 엔티티를 새 핀 생성 이벤트로 변환한다.
     *
     * @param projectId 프로젝트 ID
     * @param pin 생성된 핀 엔티티
     * @return 새 핀 생성 이벤트
     */
    public static PinCreatedEvent from(UUID projectId, ProjectPin pin) {
        return new PinCreatedEvent(
                projectId,
                pin.getPinId(),
                pin.getAuthorUserId(),
                pin.getContent(),
                pin.getCreatedAt()
        );
    }
}
