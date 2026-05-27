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
 * @param page 현재 페이지(1-base)
 * @param size 페이지 크기
 * @param totalElements 전체 댓글 개수
 * @param totalPages 전체 페이지 수
 * @param hasNext 다음 페이지 존재 여부
 * @param comments 댓글 목록
 */
public record GetPinCommentsResponse(
        UUID pinId,
        boolean hasCommentByOtherUser,
        boolean hasUnreadCommentByOtherUser,
        int unreadCommentCount,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean hasNext,
        List<PinCommentResponse> comments
) {

    /**
     * 댓글 목록과 페이지/집계 정보를 조합해 응답 DTO를 생성한다.
     *
     * @param pinId 핀 ID
     * @param hasCommentByOtherUser 현재 사용자 기준 타인 댓글 존재 여부
     * @param unreadCommentCount 현재 사용자 기준 미확인 타인 댓글 개수
     * @param page 현재 페이지(1-base)
     * @param size 페이지 크기
     * @param totalElements 전체 댓글 개수
     * @param totalPages 전체 페이지 수
     * @param hasNext 다음 페이지 존재 여부
     * @param comments 페이지 댓글 목록
     * @return 핀 댓글 목록 응답 DTO
     */
    public static GetPinCommentsResponse of(
            UUID pinId,
            boolean hasCommentByOtherUser,
            int unreadCommentCount,
            int page,
            int size,
            long totalElements,
            int totalPages,
            boolean hasNext,
            List<PinCommentResponse> comments
    ) {
        boolean hasUnreadCommentByOtherUser = unreadCommentCount > 0;

        return new GetPinCommentsResponse(
                pinId,
                hasCommentByOtherUser,
                hasUnreadCommentByOtherUser,
                unreadCommentCount,
                page,
                size,
                totalElements,
                totalPages,
                hasNext,
                List.copyOf(comments)
        );
    }
}
