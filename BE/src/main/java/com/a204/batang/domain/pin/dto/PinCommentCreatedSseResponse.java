package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.event.PinCommentCreatedEvent;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 새 댓글 등록 SSE 응답 DTO다.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param commentId 댓글 ID
 * @param authorUserId 댓글 작성자 사용자 ID
 * @param content 댓글 본문
 * @param createdAt 댓글 생성 시각
 */
public record PinCommentCreatedSseResponse(
        UUID projectId,
        UUID pinId,
        UUID commentId,
        UUID authorUserId,
        String content,
        LocalDateTime createdAt
) {

    /**
     * 댓글 생성 이벤트를 SSE 응답 DTO로 변환한다.
     *
     * @param event 댓글 생성 이벤트
     * @return 새 댓글 등록 SSE 응답
     */
    public static PinCommentCreatedSseResponse from(PinCommentCreatedEvent event) {
        return new PinCommentCreatedSseResponse(
                event.projectId(),
                event.pinId(),
                event.commentId(),
                event.authorUserId(),
                event.content(),
                event.createdAt()
        );
    }
}
