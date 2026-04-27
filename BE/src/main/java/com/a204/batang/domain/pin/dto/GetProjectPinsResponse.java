package com.a204.batang.domain.pin.dto;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트 핀 목록 조회 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param hasPinByOtherUser 현재 사용자 기준 타인이 등록한 핀 존재 여부
 * @param hasUnreadPinByOtherUser 현재 사용자 기준 미확인 핀 존재 여부
 * @param unreadPinCount 현재 사용자 기준 미확인 핀 개수
 * @param hasUnreadCommentByOtherUser 현재 사용자 기준 미확인 댓글이 달린 핀 존재 여부
 * @param unreadCommentPinCount 현재 사용자 기준 미확인 댓글이 달린 핀 개수
 * @param page 현재 페이지(1-base)
 * @param size 페이지 크기
 * @param totalElements 전체 핀 개수
 * @param totalPages 전체 페이지 수
 * @param hasNext 다음 페이지 존재 여부
 * @param pins 핀 목록
 */
public record GetProjectPinsResponse(
        UUID projectId,
        boolean hasPinByOtherUser,
        boolean hasUnreadPinByOtherUser,
        int unreadPinCount,
        boolean hasUnreadCommentByOtherUser,
        int unreadCommentPinCount,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean hasNext,
        List<ProjectPinResponse> pins
) {

    /**
     * 핀 목록과 페이지/집계 정보를 조합해 응답 DTO를 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param hasPinByOtherUser 현재 사용자 기준 타인 핀 존재 여부
     * @param unreadPinCount 현재 사용자 기준 미확인 핀 개수
     * @param unreadCommentPinCount 현재 사용자 기준 미확인 댓글이 달린 핀 개수
     * @param page 현재 페이지(1-base)
     * @param size 페이지 크기
     * @param totalElements 전체 핀 개수
     * @param totalPages 전체 페이지 수
     * @param hasNext 다음 페이지 존재 여부
     * @param pins 페이지 핀 목록
     * @return 프로젝트 핀 목록 응답 DTO
     */
    public static GetProjectPinsResponse of(
            UUID projectId,
            boolean hasPinByOtherUser,
            int unreadPinCount,
            int unreadCommentPinCount,
            int page,
            int size,
            long totalElements,
            int totalPages,
            boolean hasNext,
            List<ProjectPinResponse> pins
    ) {
        boolean hasUnreadPinByOtherUser = unreadPinCount > 0;
        boolean hasUnreadCommentByOtherUser = unreadCommentPinCount > 0;

        return new GetProjectPinsResponse(
                projectId,
                hasPinByOtherUser,
                hasUnreadPinByOtherUser,
                unreadPinCount,
                hasUnreadCommentByOtherUser,
                unreadCommentPinCount,
                page,
                size,
                totalElements,
                totalPages,
                hasNext,
                List.copyOf(pins)
        );
    }
}
