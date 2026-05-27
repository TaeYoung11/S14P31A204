package com.a204.batang.domain.notification.event;

import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationCreatedSseResponse;
import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.pin.dto.PinCommentCreatedSseResponse;
import com.a204.batang.domain.pin.dto.PinCommentResolvedSseResponse;
import com.a204.batang.domain.pin.dto.PinCommentUpdatedSseResponse;
import com.a204.batang.domain.pin.dto.PinCreatedSseResponse;
import com.a204.batang.domain.pin.dto.PinPositionUpdatedSseResponse;
import com.a204.batang.domain.pin.dto.PinResolvedSseResponse;
import com.a204.batang.domain.pin.event.PinCommentCreatedEvent;
import com.a204.batang.domain.pin.event.PinCommentResolvedEvent;
import com.a204.batang.domain.pin.event.PinCommentUpdatedEvent;
import com.a204.batang.domain.pin.event.PinCreatedEvent;
import com.a204.batang.domain.pin.event.PinPositionUpdatedEvent;
import com.a204.batang.domain.pin.event.PinResolvedEvent;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * 핀/댓글 도메인 이벤트를 통합 SSE 알림으로 중계한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationEventListener {

    private static final String EVENT_PIN_CREATED = "pin-created";
    private static final String EVENT_PIN_POSITION_UPDATED = "pin-position-updated";
    private static final String EVENT_PIN_RESOLVED = "pin-resolved";
    private static final String EVENT_COMMENT_CREATED = "comment-created";
    private static final String EVENT_COMMENT_UPDATED = "comment-updated";
    private static final String EVENT_COMMENT_RESOLVED = "comment-resolved";
    private static final String EVENT_PROJECT_INVITATION_CREATED = "project-invitation-created";

    private final NotificationSseService notificationSseService;
    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;

    /**
     * 핀 생성 알림을 브로드캐스트한다.
     *
     * @param event 핀 생성 이벤트
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handlePinCreated(PinCreatedEvent event) {
        sendNotification(
                event.projectId(),
                event.authorUserId(),
                EVENT_PIN_CREATED,
                PinCreatedSseResponse.from(event)
        );
    }

    /**
     * 핀 위치 수정 알림을 브로드캐스트한다.
     *
     * @param event 핀 위치 수정 이벤트
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handlePinPositionUpdated(PinPositionUpdatedEvent event) {
        sendNotification(
                event.projectId(),
                event.modifierUserId(),
                EVENT_PIN_POSITION_UPDATED,
                PinPositionUpdatedSseResponse.from(event)
        );
    }

    /**
     * 핀 완료 알림을 브로드캐스트한다.
     *
     * @param event 핀 완료 이벤트
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handlePinResolved(PinResolvedEvent event) {
        sendNotification(
                event.projectId(),
                event.resolvedByUserId(),
                EVENT_PIN_RESOLVED,
                PinResolvedSseResponse.from(event)
        );
    }

    /**
     * 댓글 생성 알림을 브로드캐스트한다.
     *
     * @param event 댓글 생성 이벤트
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleCommentCreated(PinCommentCreatedEvent event) {
        sendNotification(
                event.projectId(),
                event.authorUserId(),
                EVENT_COMMENT_CREATED,
                PinCommentCreatedSseResponse.from(event)
        );
    }

    /**
     * 댓글 수정 알림을 브로드캐스트한다.
     *
     * @param event 댓글 수정 이벤트
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleCommentUpdated(PinCommentUpdatedEvent event) {
        sendNotification(
                event.projectId(),
                event.authorUserId(),
                EVENT_COMMENT_UPDATED,
                PinCommentUpdatedSseResponse.from(event)
        );
    }

    /**
     * 댓글 완료 알림을 브로드캐스트한다.
     *
     * @param event 댓글 완료 이벤트
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleCommentResolved(PinCommentResolvedEvent event) {
        sendNotification(
                event.projectId(),
                event.resolvedByUserId(),
                EVENT_COMMENT_RESOLVED,
                PinCommentResolvedSseResponse.from(event)
        );
    }

    /**
     * Sends a project invitation notification to the invited user.
     *
     * @param event project invitation notification created event
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleProjectInvitationNotificationCreated(ProjectInvitationNotificationCreatedEvent event) {
        notificationSseService.sendToUsers(
                Set.of(event.recipientUserId()),
                EVENT_PROJECT_INVITATION_CREATED,
                ProjectInvitationNotificationCreatedSseResponse.from(event)
        );
    }

    private void sendNotification(UUID projectId, UUID actorUserId, String eventName, Object payload) {
        Set<UUID> targetUserIds = resolveTargetUserIds(projectId, actorUserId);
        if (targetUserIds.isEmpty()) {
            return;
        }

        notificationSseService.sendToUsers(targetUserIds, eventName, payload);
    }

    /**
     * 프로젝트 멤버 목록을 조회한 뒤 이벤트 발생 사용자(actor)를 제외한 대상 사용자 집합을 만든다.
     *
     * @param projectId 프로젝트 ID
     * @param actorUserId 이벤트를 발생시킨 사용자 ID
     * @return 알림 발송 대상 사용자 ID 집합
     */
    private Set<UUID> resolveTargetUserIds(UUID projectId, UUID actorUserId) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElse(null);
        if (project == null) {
            log.warn("알림 대상 사용자 조회 중 프로젝트를 찾지 못했습니다. projectId={}", projectId);
            return Set.of();
        }

        Set<UUID> memberUserIds = new HashSet<>(projectAccessService.resolveProjectMemberUserIds(project));
        if (actorUserId != null) {
            memberUserIds.remove(actorUserId);
        }

        return memberUserIds;
    }
}
