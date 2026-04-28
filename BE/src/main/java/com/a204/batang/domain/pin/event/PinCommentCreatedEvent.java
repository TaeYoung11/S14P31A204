package com.a204.batang.domain.pin.event;

import com.a204.batang.domain.pin.entity.ProjectPinComment;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 새 댓글 등록 완료 후 발행되는 도메인 이벤트다.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param commentId 댓글 ID
 * @param authorUserId 댓글 작성자 사용자 ID
 * @param content 댓글 본문
 * @param createdAt 댓글 생성 시각
 */
public record PinCommentCreatedEvent(
        UUID projectId,
        UUID pinId,
        UUID commentId,
        UUID authorUserId,
        String content,
        LocalDateTime createdAt
) {

    /**
     * 댓글 엔티티를 댓글 생성 이벤트로 변환한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param comment 생성된 댓글 엔티티
     * @return 댓글 생성 이벤트
     */
    public static PinCommentCreatedEvent from(UUID projectId, UUID pinId, ProjectPinComment comment) {
        return new PinCommentCreatedEvent(
                projectId,
                pinId,
                comment.getCommentId(),
                comment.getAuthorUserId(),
                comment.getContent(),
                comment.getCreatedAt()
        );
    }
}
