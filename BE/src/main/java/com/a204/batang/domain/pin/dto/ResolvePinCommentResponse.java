package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.entity.ProjectPinComment;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 댓글 완료 처리 응답 DTO다.
 *
 * @param commentId 댓글 ID
 * @param pinId 핀 ID
 * @param status 댓글 상태
 * @param resolvedByUserId 완료 처리자 사용자 ID
 * @param resolvedAt 완료 처리 시각
 * @param updatedAt 댓글 수정 시각
 */
public record ResolvePinCommentResponse(
        UUID commentId,
        UUID pinId,
        PinStatus status,
        UUID resolvedByUserId,
        LocalDateTime resolvedAt,
        LocalDateTime updatedAt
) {

    /**
     * 댓글 엔티티를 완료 처리 응답 DTO로 변환한다.
     *
     * @param comment 댓글 엔티티
     * @return 댓글 완료 처리 응답
     */
    public static ResolvePinCommentResponse from(ProjectPinComment comment) {
        return new ResolvePinCommentResponse(
                comment.getCommentId(),
                comment.getProjectPin().getPinId(),
                comment.getStatus(),
                comment.getResolvedByUserId(),
                comment.getResolvedAt(),
                comment.getUpdatedAt()
        );
    }
}
