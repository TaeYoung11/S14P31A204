package com.a204.batang.domain.notification.dto;

import java.util.List;

/**
 * 프로젝트 초대 알림 목록 응답 DTO.
 *
 * @param notifications 프로젝트 초대 알림 목록
 */
public record ProjectInvitationNotificationListResponse(
        List<ProjectInvitationNotificationResponse> notifications
) {

    /**
     * 프로젝트 초대 알림 목록 응답 DTO를 생성한다.
     *
     * @param notifications 프로젝트 초대 알림 목록
     * @return 프로젝트 초대 알림 목록 응답 DTO
     */
    public static ProjectInvitationNotificationListResponse of(
            List<ProjectInvitationNotificationResponse> notifications
    ) {
        return new ProjectInvitationNotificationListResponse(List.copyOf(notifications));
    }
}
