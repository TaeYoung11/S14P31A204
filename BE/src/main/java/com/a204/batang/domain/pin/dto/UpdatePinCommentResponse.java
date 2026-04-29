package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.ProjectPinComment;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 핀 댓글 수정 응답 DTO.
 *
 * @param commentId 댓글 ID
 * @param pinId 핀 ID
 * @param authorUserId 작성자 사용자 ID
 * @param content 수정된 댓글 본문
 * @param updatedAt 수정 시각
 */
public record UpdatePinCommentResponse(
        UUID commentId,
        UUID pinId,
        UUID authorUserId,
        String content,
        LocalDateTime updatedAt
) {

    /**
     * 댓글 엔티티를 댓글 수정 응답 DTO로 변환한다.
     *
     * @param comment 댓글 엔티티
     * @param pinId 핀 ID
     * @return 댓글 수정 응답 DTO
     */
    public static UpdatePinCommentResponse from(ProjectPinComment comment, UUID pinId) {
        return new UpdatePinCommentResponse(
                comment.getCommentId(),
                pinId,
                comment.getAuthorUserId(),
                comment.getContent(),
                comment.getUpdatedAt()
        );
    }
}
