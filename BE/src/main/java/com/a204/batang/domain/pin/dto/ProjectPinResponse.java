package com.a204.batang.domain.pin.dto;

import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.entity.ProjectPin;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * 핀 단건 응답 DTO.
 *
 * @param pinId 핀 ID
 * @param authorUserId 핀 작성자 사용자 ID
 * @param status 핀 상태
 * @param cameraPosition 카메라 좌표
 * @param worldPosition 월드 좌표
 * @param targetElementId 핀 대상 엘리먼트 ID
 * @param content 핀 본문
 * @param commentCount 댓글 수(핀 본문 포함)
 * @param lastCommentAt 마지막 댓글 시각
 * @param lastCommentAuthorUserId 마지막 댓글 작성자 사용자 ID
 * @param pinnedByOtherUser 현재 사용자 기준 타인이 등록한 핀 여부
 * @param unreadPinByCurrentUser 현재 사용자 기준 미확인 핀 여부
 * @param hasUnreadCommentByOtherUser 현재 사용자 기준 타인 미확인 댓글 존재 여부
 * @param createdAt 핀 생성 시각
 * @param updatedAt 핀 수정 시각
 */
public record ProjectPinResponse(
        UUID pinId,
        UUID authorUserId,
        PinStatus status,
        PinPositionResponse cameraPosition,
        PinPositionResponse worldPosition,
        String targetElementId,
        String content,
        int commentCount,
        LocalDateTime lastCommentAt,
        UUID lastCommentAuthorUserId,
        boolean pinnedByOtherUser,
        boolean unreadPinByCurrentUser,
        boolean hasUnreadCommentByOtherUser,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    /**
     * 핀 엔티티를 사용자 기준 상태를 포함한 응답 DTO로 변환한다.
     *
     * @param pin 핀 엔티티
     * @param currentUserId 현재 사용자 ID
     * @param lastPinReadAt 현재 사용자의 프로젝트 핀 목록 마지막 읽음 시각
     * @param hasUnreadCommentByOtherUser 현재 사용자 기준 타인 미확인 댓글 존재 여부
     * @return 핀 응답 DTO
     */
    public static ProjectPinResponse from(
            ProjectPin pin,
            UUID currentUserId,
            LocalDateTime lastPinReadAt,
            boolean hasUnreadCommentByOtherUser
    ) {
        boolean pinnedByOtherUser = currentUserId != null
                && pin.getAuthorUserId() != null
                && !Objects.equals(currentUserId, pin.getAuthorUserId());

        boolean unreadPinByCurrentUser = pinnedByOtherUser
                && (lastPinReadAt == null || pin.getCreatedAt().isAfter(lastPinReadAt));

        boolean unreadCommentByCurrentUser = currentUserId != null && hasUnreadCommentByOtherUser;

        return new ProjectPinResponse(
                pin.getPinId(),
                pin.getAuthorUserId(),
                pin.getStatus(),
                PinPositionResponse.from(pin.getCameraPosition()),
                PinPositionResponse.from(pin.getWorldPosition()),
                pin.getTargetElementId(),
                pin.getContent(),
                pin.getCommentCount(),
                pin.getLastCommentAt(),
                pin.getLastCommentAuthorUserId(),
                pinnedByOtherUser,
                unreadPinByCurrentUser,
                unreadCommentByCurrentUser,
                pin.getCreatedAt(),
                pin.getUpdatedAt()
        );
    }
}
