package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.event.PinCommentUpdatedEvent;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 댓글 수정 SSE 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param commentId 댓글 ID
 * @param authorUserId 댓글 작성자 ID
 * @param content 수정된 댓글 내용
 * @param updatedAt 수정 시각
 */
public record PinCommentUpdatedSseResponse(
        UUID projectId,
        UUID pinId,
        UUID commentId,
        UUID authorUserId,
        String content,
        LocalDateTime updatedAt
) {

    /**
     * 댓글 수정 이벤트를 SSE 응답으로 변환한다.
     *
     * @param event 댓글 수정 이벤트
     * @return SSE 응답 DTO
     */
    public static PinCommentUpdatedSseResponse from(PinCommentUpdatedEvent event) {
        return new PinCommentUpdatedSseResponse(
                event.projectId(),
                event.pinId(),
                event.commentId(),
                event.authorUserId(),
                event.content(),
                event.updatedAt()
        );
    }
}
