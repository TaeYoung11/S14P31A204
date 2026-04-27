package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.ProjectPinComment;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 핀 댓글 생성 응답 DTO다.
 *
 * @param commentId 댓글 ID
 * @param pinId 핀 ID
 * @param authorUserId 작성자 사용자 ID
 * @param content 댓글 본문
 * @param createdAt 생성 시각
 */
public record CreatePinCommentResponse(
        UUID commentId,
        UUID pinId,
        UUID authorUserId,
        String content,
        LocalDateTime createdAt
) {

    /**
     * 댓글 엔티티를 생성 응답 DTO로 변환한다.
     *
     * @param comment 댓글 엔티티
     * @return 댓글 생성 응답
     */
    public static CreatePinCommentResponse from(ProjectPinComment comment) {
        return new CreatePinCommentResponse(
                comment.getCommentId(),
                comment.getProjectPin().getPinId(),
                comment.getAuthorUserId(),
                comment.getContent(),
                comment.getCreatedAt()
        );
    }
}
