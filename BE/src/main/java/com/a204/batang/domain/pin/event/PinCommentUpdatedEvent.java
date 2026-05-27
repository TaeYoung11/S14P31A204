package com.a204.batang.domain.pin.event;

import com.a204.batang.domain.pin.entity.ProjectPinComment;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 댓글 내용이 수정되었을 때 발행하는 도메인 이벤트.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param commentId 댓글 ID
 * @param authorUserId 댓글 작성자 ID
 * @param content 수정된 댓글 내용
 * @param updatedAt 댓글 수정 시각
 */
public record PinCommentUpdatedEvent(
        UUID projectId,
        UUID pinId,
        UUID commentId,
        UUID authorUserId,
        String content,
        LocalDateTime updatedAt
) {

    /**
     * 댓글 엔티티로부터 댓글 수정 이벤트를 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param comment 수정된 댓글
     * @return 댓글 수정 이벤트
     */
    public static PinCommentUpdatedEvent from(UUID projectId, UUID pinId, ProjectPinComment comment) {
        return new PinCommentUpdatedEvent(
                projectId,
                pinId,
                comment.getCommentId(),
                comment.getAuthorUserId(),
                comment.getContent(),
                comment.getUpdatedAt()
        );
    }
}
