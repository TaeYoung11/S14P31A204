package com.a204.batang.domain.notification.event;

import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationCreatedSseResponse;
import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class NotificationEventListenerTest {

    @Mock
    private NotificationSseService notificationSseService;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @InjectMocks
    private NotificationEventListener notificationEventListener;

    @Test
    void handleProjectInvitationNotificationCreated_sendsSseOnlyToRecipient() {
        UUID notificationId = UUID.randomUUID();
        UUID recipientUserId = UUID.randomUUID();
        UUID inviterUserId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        LocalDateTime createdAt = LocalDateTime.of(2026, 5, 14, 12, 30);

        ProjectInvitationNotificationCreatedEvent event = new ProjectInvitationNotificationCreatedEvent(
                notificationId,
                recipientUserId,
                inviterUserId,
                "owner",
                projectId,
                "project",
                false,
                null,
                createdAt
        );

        notificationEventListener.handleProjectInvitationNotificationCreated(event);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Set<UUID>> targetUserIdsCaptor = ArgumentCaptor.forClass(Set.class);
        ArgumentCaptor<String> eventNameCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object> payloadCaptor = ArgumentCaptor.forClass(Object.class);

        verify(notificationSseService).sendToUsers(
                targetUserIdsCaptor.capture(),
                eventNameCaptor.capture(),
                payloadCaptor.capture()
        );

        assertThat(targetUserIdsCaptor.getValue()).containsExactly(recipientUserId);
        assertThat(eventNameCaptor.getValue()).isEqualTo("project-invitation-created");
        assertThat(payloadCaptor.getValue()).isInstanceOf(ProjectInvitationNotificationCreatedSseResponse.class);

        ProjectInvitationNotificationCreatedSseResponse payload =
                (ProjectInvitationNotificationCreatedSseResponse) payloadCaptor.getValue();
        assertThat(payload.notificationId()).isEqualTo(notificationId);
        assertThat(payload.projectId()).isEqualTo(projectId);
        assertThat(payload.projectName()).isEqualTo("project");
        assertThat(payload.inviterUserId()).isEqualTo(inviterUserId);
        assertThat(payload.inviterName()).isEqualTo("owner");
        assertThat(payload.isRead()).isFalse();
        assertThat(payload.readAt()).isNull();
        assertThat(payload.createdAt()).isEqualTo(createdAt);

        verifyNoInteractions(projectRepository, projectAccessService);
    }
}
