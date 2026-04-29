package com.a204.batang.domain.pin.event;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.entity.ProjectPinComment;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 댓글이 완료 상태로 변경되었을 때 발행하는 도메인 이벤트.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param commentId 댓글 ID
 * @param status 댓글 상태
 * @param resolvedByUserId 완료 처리한 사용자 ID
 * @param resolvedAt 완료 시각
 * @param updatedAt 댓글 수정 시각
 */
public record PinCommentResolvedEvent(
        UUID projectId,
        UUID pinId,
        UUID commentId,
        PinStatus status,
        UUID resolvedByUserId,
        LocalDateTime resolvedAt,
        LocalDateTime updatedAt
) {

    /**
     * 댓글 엔티티로부터 댓글 완료 이벤트를 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param comment 완료된 댓글
     * @return 댓글 완료 이벤트
     */
    public static PinCommentResolvedEvent from(UUID projectId, UUID pinId, ProjectPinComment comment) {
        return new PinCommentResolvedEvent(
                projectId,
                pinId,
                comment.getCommentId(),
                comment.getStatus(),
                comment.getResolvedByUserId(),
                comment.getResolvedAt(),
                comment.getUpdatedAt()
        );
    }
}
