package com.a204.batang.domain.notification.controller;

import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationListResponse;
import com.a204.batang.domain.notification.dto.ProjectInvitationNotificationResponse;
import com.a204.batang.domain.notification.service.NotificationSseService;
import com.a204.batang.domain.notification.service.ProjectInvitationNotificationService;
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
