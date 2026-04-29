package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.event.PinCommentResolvedEvent;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 댓글 완료 SSE 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param pinId 핀 ID
 * @param commentId 댓글 ID
 * @param status 댓글 상태
 * @param resolvedByUserId 완료 처리 사용자 ID
 * @param resolvedAt 완료 시각
 * @param updatedAt 수정 시각
 */
public record PinCommentResolvedSseResponse(
        UUID projectId,
        UUID pinId,
        UUID commentId,
        PinStatus status,
        UUID resolvedByUserId,
        LocalDateTime resolvedAt,
        LocalDateTime updatedAt
) {

    /**
     * 댓글 완료 이벤트를 SSE 응답으로 변환한다.
     *
     * @param event 댓글 완료 이벤트
     * @return SSE 응답 DTO
     */
    public static PinCommentResolvedSseResponse from(PinCommentResolvedEvent event) {
        return new PinCommentResolvedSseResponse(
                event.projectId(),
                event.pinId(),
                event.commentId(),
                event.status(),
                event.resolvedByUserId(),
                event.resolvedAt(),
                event.updatedAt()
        );
    }
}
