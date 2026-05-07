package com.a204.batang.domain.chat.controller;

import com.a204.batang.domain.chat.dto.GetProjectChatLogsResponse;
import com.a204.batang.domain.chat.dto.ProjectChatLogItemResponse;
import com.a204.batang.domain.chat.service.ProjectChatLogQueryService;
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

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProjectChatLogController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class ProjectChatLogControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProjectChatLogQueryService projectChatLogQueryService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockitoBean
    private JwtAuthFilter jwtAuthFilter;

    @Test
    void getProjectChatLogs_returnsWrappedResponse() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();

        GetProjectChatLogsResponse response = GetProjectChatLogsResponse.of(
                projectId,
                0,
                50,
                2,
                1,
                false,
                List.of(
                        new ProjectChatLogItemResponse(
                                "USER",
                                "COMMAND",
                                "거실 벽을 추가해줘",
                                UUID.randomUUID(),
                                "홍길동",
                                "2026-05-07T02:00:00Z",
                                jobId,
                                jobId,
                                "TWO_D_TO_IFC_EDIT",
                                "QUEUED"
                        ),
                        new ProjectChatLogItemResponse(
                                "AI",
                                "RESULT",
                                "IFC 편집 작업이 완료되었습니다.",
                                null,
                                null,
                                "2026-05-07T02:03:00Z",
                                jobId,
                                jobId,
                                "TWO_D_TO_IFC_EDIT",
                                "SUCCEEDED"
                        )
                )
        );

        given(projectChatLogQueryService.getProjectChatLogs(eq(projectId), eq(0), eq(50))).willReturn(response);

        mockMvc.perform(get("/api/v1/projects/{projectId}/chat-logs", projectId)
                        .param("page", "0")
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("프로젝트 채팅 로그 조회 성공"))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(50))
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.totalPages").value(1))
                .andExpect(jsonPath("$.data.hasNext").value(false))
                .andExpect(jsonPath("$.data.messages[0].type").value("USER"))
                .andExpect(jsonPath("$.data.messages[0].senderName").value("홍길동"))
                .andExpect(jsonPath("$.data.messages[1].subType").value("RESULT"))
                .andExpect(jsonPath("$.data.messages[1].jobStatus").value("SUCCEEDED"));
    }

    @Test
    void getProjectChatLogs_returnsBadRequestForInvalidProjectId() throws Exception {
        mockMvc.perform(get("/api/v1/projects/{projectId}/chat-logs", "not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void getProjectChatLogs_returnsBadRequestWhenPageIsNegative() throws Exception {
        mockMvc.perform(get("/api/v1/projects/{projectId}/chat-logs", UUID.randomUUID())
                        .param("page", "-1")
                        .param("size", "50"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void getProjectChatLogs_returnsBadRequestWhenSizeExceedsLimit() throws Exception {
        mockMvc.perform(get("/api/v1/projects/{projectId}/chat-logs", UUID.randomUUID())
                        .param("page", "0")
                        .param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void getProjectChatLogs_returnsNotFoundWhenProjectDoesNotExist() throws Exception {
        given(projectChatLogQueryService.getProjectChatLogs(eq(UUID.fromString("11111111-1111-1111-1111-111111111111")), anyInt(), anyInt()))
                .willThrow(new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        mockMvc.perform(get("/api/v1/projects/{projectId}/chat-logs", "11111111-1111-1111-1111-111111111111"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void getProjectChatLogs_returnsForbiddenWhenNoAccess() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(projectChatLogQueryService.getProjectChatLogs(eq(projectId), anyInt(), anyInt()))
                .willThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS));

        mockMvc.perform(get("/api/v1/projects/{projectId}/chat-logs", projectId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("COMMON_FORBIDDEN_ACCESS"));
    }
}
