package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.entity.ProjectPinComment;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * 핀 댓글 단건 응답 DTO.
 *
 * @param commentId 댓글 ID
 * @param pinId 핀 ID
 * @param authorUserId 작성자 사용자 ID
 * @param content 댓글 본문
 * @param status 핀 상태
 * @param commentedByOtherUser 현재 사용자 기준 타인 댓글 여부
 * @param unreadByCurrentUser 현재 사용자 기준 미확인 댓글 여부
 * @param createdAt 댓글 생성 시각
 * @param updatedAt 댓글 수정 시각
 */
public record PinCommentResponse(
        UUID commentId,
        UUID pinId,
        UUID authorUserId,
        String content,
        PinStatus status,
        boolean commentedByOtherUser,
        boolean unreadByCurrentUser,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    /**
     * 댓글 엔티티를 댓글 응답 DTO로 변환한다.
     *
     * @param comment 댓글 엔티티
     * @param pinId 핀 ID
     * @param status 핀 상태
     * @param currentUserId 현재 사용자 ID
     * @param lastReadAt 현재 사용자의 마지막 읽음 시각
     * @return 댓글 응답 DTO
     */
    public static PinCommentResponse from(
            ProjectPinComment comment,
            UUID pinId,
            PinStatus status,
            UUID currentUserId,
            LocalDateTime lastReadAt
    ) {
        boolean commentedByOtherUser = currentUserId != null
                && comment.getAuthorUserId() != null
                && !Objects.equals(currentUserId, comment.getAuthorUserId());

        boolean unreadByCurrentUser = commentedByOtherUser
                && (lastReadAt == null || comment.getCreatedAt().isAfter(lastReadAt));

        return new PinCommentResponse(
                comment.getCommentId(),
                pinId,
                comment.getAuthorUserId(),
                comment.getContent(),
                status,
                commentedByOtherUser,
                unreadByCurrentUser,
                comment.getCreatedAt(),
                comment.getUpdatedAt()
        );
    }
}
