package com.a204.batang.domain.notification.service;

import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationListResponse;
import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationResponse;
import com.a204.batang.domain.notification.entity.ProjectInvitationNotification;
import com.a204.batang.domain.notification.repository.ProjectInvitationNotificationRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트 초대 알림 조회를 처리하는 서비스다.
 */
@Service
@RequiredArgsConstructor
public class ProjectInvitationNotificationService {

    private final ProjectInvitationNotificationRepository projectInvitationNotificationRepository;
    private final ProjectAccessService projectAccessService;

    /**
     * 현재 로그인 사용자의 프로젝트 초대 알림 목록을 조회한다.
     *
     * @param isRead 읽음 여부 필터. null이면 전체 조회
     * @return 프로젝트 초대 알림 목록 응답
     */
    @Transactional(readOnly = true)
    public ProjectInvitationNotificationListResponse getMyProjectInvitationNotifications(Boolean isRead) {
        UUID currentUserId = projectAccessService.resolveCurrentUserIdOrThrow();

        List<ProjectInvitationNotification> notifications = isRead == null
                ? projectInvitationNotificationRepository.findByRecipientUserIdOrderByCreatedAtDesc(currentUserId)
                : projectInvitationNotificationRepository.findByRecipientUserIdAndReadOrderByCreatedAtDesc(
                        currentUserId,
                        isRead
                );

        List<ProjectInvitationNotificationResponse> responses = notifications.stream()
                .map(ProjectInvitationNotificationResponse::from)
                .toList();

        return ProjectInvitationNotificationListResponse.of(responses);
    }
}
