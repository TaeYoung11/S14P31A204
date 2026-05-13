package com.a204.batang.domain.notification.service;

import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationListResponse;
import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationReadResponse;
import com.a204.batang.domain.notification.entity.ProjectInvitationNotification;
import com.a204.batang.domain.notification.repository.ProjectInvitationNotificationRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ProjectInvitationNotificationServiceTest {

    @Mock
    private ProjectInvitationNotificationRepository projectInvitationNotificationRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @InjectMocks
    private ProjectInvitationNotificationService projectInvitationNotificationService;

    private UUID recipientUserId;
    private UUID inviterUserId;
    private UUID projectId;
    private ProjectInvitationNotification unreadNotification;
    private ProjectInvitationNotification readNotification;

    @BeforeEach
    void setUp() {
        recipientUserId = UUID.randomUUID();
        inviterUserId = UUID.randomUUID();
        projectId = UUID.randomUUID();

        unreadNotification = createNotification(
                UUID.randomUUID(),
                "unread-project",
                "초대한 사용자",
                LocalDateTime.of(2026, 5, 12, 15, 30, 0)
        );
        readNotification = createNotification(
                UUID.randomUUID(),
                "read-project",
                "초대한 사용자",
                LocalDateTime.of(2026, 5, 12, 15, 20, 0)
        );
        readNotification.markAsRead(LocalDateTime.of(2026, 5, 12, 15, 35, 0));
    }

    @Test
    void getMyProjectInvitationNotifications_returnsAllNotifications_whenIsReadIsNull() {
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(recipientUserId);
        given(projectInvitationNotificationRepository.findByRecipientUserIdOrderByCreatedAtDesc(recipientUserId))
                .willReturn(List.of(unreadNotification, readNotification));

        ProjectInvitationNotificationListResponse response =
                projectInvitationNotificationService.getMyProjectInvitationNotifications(null);

        assertThat(response.notifications()).hasSize(2);
        assertThat(response.notifications().get(0).notificationId()).isEqualTo(unreadNotification.getNotificationId());
        assertThat(response.notifications().get(0).isRead()).isFalse();
        assertThat(response.notifications().get(1).notificationId()).isEqualTo(readNotification.getNotificationId());
        assertThat(response.notifications().get(1).isRead()).isTrue();

        verify(projectInvitationNotificationRepository).findByRecipientUserIdOrderByCreatedAtDesc(recipientUserId);
        verify(projectInvitationNotificationRepository, never())
                .findByRecipientUserIdAndReadOrderByCreatedAtDesc(recipientUserId, false);
    }

    @Test
    void getMyProjectInvitationNotifications_returnsUnreadNotifications_whenIsReadIsFalse() {
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(recipientUserId);
        given(projectInvitationNotificationRepository.findByRecipientUserIdAndReadOrderByCreatedAtDesc(
                recipientUserId,
                false
        )).willReturn(List.of(unreadNotification));

        ProjectInvitationNotificationListResponse response =
                projectInvitationNotificationService.getMyProjectInvitationNotifications(false);

        assertThat(response.notifications()).hasSize(1);
        assertThat(response.notifications().get(0).notificationId()).isEqualTo(unreadNotification.getNotificationId());
        assertThat(response.notifications().get(0).isRead()).isFalse();

        verify(projectInvitationNotificationRepository, never()).findByRecipientUserIdOrderByCreatedAtDesc(recipientUserId);
        verify(projectInvitationNotificationRepository)
                .findByRecipientUserIdAndReadOrderByCreatedAtDesc(recipientUserId, false);
    }

    @Test
    void getMyProjectInvitationNotifications_returnsReadNotifications_whenIsReadIsTrue() {
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(recipientUserId);
        given(projectInvitationNotificationRepository.findByRecipientUserIdAndReadOrderByCreatedAtDesc(
                recipientUserId,
                true
        )).willReturn(List.of(readNotification));

        ProjectInvitationNotificationListResponse response =
                projectInvitationNotificationService.getMyProjectInvitationNotifications(true);

        assertThat(response.notifications()).hasSize(1);
        assertThat(response.notifications().get(0).notificationId()).isEqualTo(readNotification.getNotificationId());
        assertThat(response.notifications().get(0).isRead()).isTrue();
        assertThat(response.notifications().get(0).readAt()).isEqualTo(readNotification.getReadAt());

        verify(projectInvitationNotificationRepository)
                .findByRecipientUserIdAndReadOrderByCreatedAtDesc(recipientUserId, true);
    }

    @Test
    void getMyProjectInvitationNotifications_returnsEmptyList_whenNoNotificationsExist() {
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(recipientUserId);
        given(projectInvitationNotificationRepository.findByRecipientUserIdOrderByCreatedAtDesc(recipientUserId))
                .willReturn(List.of());

        ProjectInvitationNotificationListResponse response =
                projectInvitationNotificationService.getMyProjectInvitationNotifications(null);

        assertThat(response.notifications()).isEmpty();
    }

    @Test
    void markProjectInvitationNotificationAsRead_marksUnreadNotificationAndReturnsResponse() {
        UUID notificationId = unreadNotification.getNotificationId();

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(recipientUserId);
        given(projectInvitationNotificationRepository.findByNotificationIdAndRecipientUserId(
                notificationId,
                recipientUserId
        )).willReturn(Optional.of(unreadNotification));

        ProjectInvitationNotificationReadResponse response =
                projectInvitationNotificationService.markProjectInvitationNotificationAsRead(notificationId);

        assertThat(unreadNotification.isRead()).isTrue();
        assertThat(unreadNotification.getReadAt()).isNotNull();
        assertThat(response.notificationId()).isEqualTo(notificationId);
        assertThat(response.isRead()).isTrue();
        assertThat(response.readAt()).isEqualTo(unreadNotification.getReadAt());

        verify(projectInvitationNotificationRepository)
                .findByNotificationIdAndRecipientUserId(notificationId, recipientUserId);
    }

    @Test
    void markProjectInvitationNotificationAsRead_keepsExistingReadAt_whenNotificationIsAlreadyRead() {
        UUID notificationId = readNotification.getNotificationId();
        LocalDateTime originalReadAt = readNotification.getReadAt();

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(recipientUserId);
        given(projectInvitationNotificationRepository.findByNotificationIdAndRecipientUserId(
                notificationId,
                recipientUserId
        )).willReturn(Optional.of(readNotification));

        ProjectInvitationNotificationReadResponse response =
                projectInvitationNotificationService.markProjectInvitationNotificationAsRead(notificationId);

        assertThat(readNotification.isRead()).isTrue();
        assertThat(readNotification.getReadAt()).isEqualTo(originalReadAt);
        assertThat(response.notificationId()).isEqualTo(notificationId);
        assertThat(response.isRead()).isTrue();
        assertThat(response.readAt()).isEqualTo(originalReadAt);
    }

    @Test
    void markProjectInvitationNotificationAsRead_throwsNotFound_whenNotificationDoesNotExistOrBelongsToOtherUser() {
        UUID notificationId = UUID.randomUUID();

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(recipientUserId);
        given(projectInvitationNotificationRepository.findByNotificationIdAndRecipientUserId(
                notificationId,
                recipientUserId
        )).willReturn(Optional.empty());

        assertThatThrownBy(() -> projectInvitationNotificationService.markProjectInvitationNotificationAsRead(notificationId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVITATION_NOTIFICATION_NOT_FOUND);

        verify(projectInvitationNotificationRepository)
                .findByNotificationIdAndRecipientUserId(notificationId, recipientUserId);
    }

    private ProjectInvitationNotification createNotification(
            UUID notificationId,
            String projectName,
            String inviterName,
            LocalDateTime createdAt
    ) {
        ProjectInvitationNotification notification = ProjectInvitationNotification.create(
                recipientUserId,
                inviterUserId,
                projectId,
                projectName,
                inviterName
        );
        ReflectionTestUtils.setField(notification, "notificationId", notificationId);
        ReflectionTestUtils.setField(notification, "createdAt", createdAt);
        ReflectionTestUtils.setField(notification, "updatedAt", createdAt);
        return notification;
    }
}
