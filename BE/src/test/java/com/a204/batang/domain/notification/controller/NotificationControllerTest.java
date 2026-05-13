package com.a204.batang.domain.notification.controller;

import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationListResponse;
import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationReadResponse;
import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationResponse;
import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.notification.service.ProjectInvitationNotificationService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.exception.controller.GlobalExceptionHandler;
import com.a204.batang.global.jwt.JwtAuthFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(NotificationController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class NotificationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private NotificationSseService notificationSseService;

    @MockitoBean
    private ProjectInvitationNotificationService projectInvitationNotificationService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockitoBean
    private JwtAuthFilter jwtAuthFilter;

    @Test
    void getProjectInvitationNotifications_returnsWrappedResponse() throws Exception {
        ProjectInvitationNotificationListResponse response = ProjectInvitationNotificationListResponse.of(List.of(
                createNotificationResponse(false)
        ));

        given(projectInvitationNotificationService.getMyProjectInvitationNotifications(null))
                .willReturn(response);

        mockMvc.perform(get("/api/v1/notifications/invitations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("초대 알림 조회 성공"))
                .andExpect(jsonPath("$.data.notifications[0].notificationId").value(
                        response.notifications().get(0).notificationId().toString()
                ))
                .andExpect(jsonPath("$.data.notifications[0].projectName").value("초대 프로젝트"))
                .andExpect(jsonPath("$.data.notifications[0].isRead").value(false));

        verify(projectInvitationNotificationService).getMyProjectInvitationNotifications(null);
    }

    @Test
    void getProjectInvitationNotifications_returnsUnreadNotifications_whenIsReadIsFalse() throws Exception {
        ProjectInvitationNotificationListResponse response = ProjectInvitationNotificationListResponse.of(List.of(
                createNotificationResponse(false)
        ));

        given(projectInvitationNotificationService.getMyProjectInvitationNotifications(false))
                .willReturn(response);

        mockMvc.perform(get("/api/v1/notifications/invitations")
                        .param("isRead", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.data.notifications[0].isRead").value(false));

        verify(projectInvitationNotificationService).getMyProjectInvitationNotifications(false);
    }

    @Test
    void getProjectInvitationNotifications_returnsReadNotifications_whenIsReadIsTrue() throws Exception {
        ProjectInvitationNotificationListResponse response = ProjectInvitationNotificationListResponse.of(List.of(
                createNotificationResponse(true)
        ));

        given(projectInvitationNotificationService.getMyProjectInvitationNotifications(true))
                .willReturn(response);

        mockMvc.perform(get("/api/v1/notifications/invitations")
                        .param("isRead", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.data.notifications[0].isRead").value(true));

        verify(projectInvitationNotificationService).getMyProjectInvitationNotifications(true);
    }

    @Test
    void getProjectInvitationNotifications_returnsBadRequest_whenIsReadIsInvalidBoolean() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/invitations")
                        .param("isRead", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void readProjectInvitationNotification_returnsWrappedResponse() throws Exception {
        UUID notificationId = UUID.randomUUID();
        LocalDateTime readAt = LocalDateTime.of(2026, 5, 13, 10, 30, 0);
        ProjectInvitationNotificationReadResponse response =
                new ProjectInvitationNotificationReadResponse(notificationId, true, readAt);

        given(projectInvitationNotificationService.markProjectInvitationNotificationAsRead(notificationId))
                .willReturn(response);

        mockMvc.perform(patch("/api/v1/notifications/invitations/{notificationId}/read", notificationId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("초대 알림 읽음 처리 완료"))
                .andExpect(jsonPath("$.data.notificationId").value(notificationId.toString()))
                .andExpect(jsonPath("$.data.isRead").value(true))
                .andExpect(jsonPath("$.data.readAt").value("2026-05-13T10:30:00"));

        verify(projectInvitationNotificationService).markProjectInvitationNotificationAsRead(notificationId);
    }

    @Test
    void readProjectInvitationNotification_returnsBadRequest_whenNotificationIdIsInvalidUuid() throws Exception {
        mockMvc.perform(patch("/api/v1/notifications/invitations/{notificationId}/read", "not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void readProjectInvitationNotification_returnsNotFound_whenNotificationDoesNotExist() throws Exception {
        UUID notificationId = UUID.randomUUID();

        given(projectInvitationNotificationService.markProjectInvitationNotificationAsRead(notificationId))
                .willThrow(new CustomException(ErrorCode.INVITATION_NOTIFICATION_NOT_FOUND));

        mockMvc.perform(patch("/api/v1/notifications/invitations/{notificationId}/read", notificationId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("INVITATION_NOTIFICATION_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("초대 알림을 찾을 수 없습니다."));
    }

    private ProjectInvitationNotificationResponse createNotificationResponse(boolean isRead) {
        LocalDateTime readAt = isRead ? LocalDateTime.of(2026, 5, 12, 15, 40, 0) : null;
        return new ProjectInvitationNotificationResponse(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "초대 프로젝트",
                UUID.randomUUID(),
                "초대한 사용자",
                isRead,
                readAt,
                LocalDateTime.of(2026, 5, 12, 15, 30, 0)
        );
    }
}
