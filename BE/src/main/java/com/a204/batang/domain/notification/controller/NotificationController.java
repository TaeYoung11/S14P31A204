package com.a204.batang.domain.notification.controller;

import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationListResponse;
import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationReadResponse;
import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.notification.service.ProjectInvitationNotificationService;
import com.a204.batang.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;

/**
 * 통합 알림 엔드포인트를 제공한다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationSseService notificationSseService;
    private final ProjectInvitationNotificationService projectInvitationNotificationService;

    /**
     * 현재 로그인 사용자의 프로젝트 초대 알림 목록을 조회한다.
     *
     * @param isRead 읽음 여부 필터. null이면 전체 조회
     * @return 프로젝트 초대 알림 목록
     */
    @GetMapping("/invitations")
    public ApiResponse<ProjectInvitationNotificationListResponse> getProjectInvitationNotifications(
            @RequestParam(required = false) Boolean isRead
    ) {
        ProjectInvitationNotificationListResponse response =
                projectInvitationNotificationService.getMyProjectInvitationNotifications(isRead);
        return ApiResponse.success("초대 알림 조회 성공", response);
    }

    /**
     * 현재 로그인 사용자의 프로젝트 초대 알림을 읽음 처리한다.
     *
     * @param notificationId 알림 ID
     * @return 프로젝트 초대 알림 읽음 처리 결과
     */
    @PatchMapping("/invitations/{notificationId}/read")
    public ApiResponse<ProjectInvitationNotificationReadResponse> readProjectInvitationNotification(
            @PathVariable UUID notificationId
    ) {
        ProjectInvitationNotificationReadResponse response =
                projectInvitationNotificationService.markProjectInvitationNotificationAsRead(notificationId);
        return ApiResponse.success("초대 알림 읽음 처리 완료", response);
    }

    /**
     * 사용자 단위 단일 SSE 연결을 구독한다.
     *
     * @return SSE emitter
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> subscribe() {
        SseEmitter emitter = notificationSseService.subscribe();

        return ResponseEntity.ok()
                .header("X-Accel-Buffering", "no")
                .header("Cache-Control", "no-cache")
                .header("Connection", "keep-alive")
                .body(emitter);
    }
}
