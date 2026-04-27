package com.a204.batang.domain.pin.dto;

import java.util.List;
import java.util.UUID;

/**
 * 핀 댓글 목록 조회 응답 DTO.
 *
 * @param pinId 핀 ID
 * @param hasCommentByOtherUser 현재 사용자 기준 타인 댓글 존재 여부
 * @param hasUnreadCommentByOtherUser 현재 사용자 기준 미확인 타인 댓글 존재 여부
 * @param unreadCommentCount 현재 사용자 기준 미확인 타인 댓글 개수
 * @param comments 댓글 목록
 */
public record GetPinCommentsResponse(
        UUID pinId,
        boolean hasCommentByOtherUser,
        boolean hasUnreadCommentByOtherUser,
        int unreadCommentCount,
        List<PinCommentResponse> comments
) {

    /**
     * 댓글 목록 응답 DTO를 생성한다.
     *
     * @param pinId 핀 ID
     * @param comments 댓글 목록
     * @return 댓글 목록 응답 DTO
     */
    public static GetPinCommentsResponse of(UUID pinId, List<PinCommentResponse> comments) {
        boolean hasCommentByOtherUser = comments.stream().anyMatch(PinCommentResponse::commentedByOtherUser);
        int unreadCommentCount = (int) comments.stream()
                .filter(PinCommentResponse::unreadByCurrentUser)
                .count();
        boolean hasUnreadCommentByOtherUser = unreadCommentCount > 0;

        return new GetPinCommentsResponse(
                pinId,
                hasCommentByOtherUser,
                hasUnreadCommentByOtherUser,
                unreadCommentCount,
                List.copyOf(comments)
        );
    }
}
