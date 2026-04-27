package com.a204.batang.domain.render.controller;

import com.a204.batang.domain.render.dto.ProjectRenderResponse;
import com.a204.batang.domain.render.dto.ProjectRenderStyleResponse;
import com.a204.batang.domain.render.service.RenderQueryService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.exception.controller.GlobalExceptionHandler;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RenderController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class RenderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RenderQueryService renderQueryService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @Test
    void getProjectRenders_returnsWrappedResponse() throws Exception {
        UUID projectId = UUID.fromString("96e243de-0abd-41e5-b97f-7c68afea4fa5");
        ProjectRenderResponse response = new ProjectRenderResponse(
                projectId,
                new ProjectRenderStyleResponse("EVENING", "EXTERIOR", "SPRING", "CLEAR"),
                "https://minio.local/renderings/render-001.png",
                "SUCCESS",
                "2026-04-15T07:50:00Z",
                "2026-04-15T07:50:28Z"
        );
        given(renderQueryService.getProjectRenders(projectId)).willReturn(List.of(response));

        mockMvc.perform(get("/api/v1/projects/{projectId}/renders", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("렌더링 결과 목록 조회 성공"))
                .andExpect(jsonPath("$.data[0].renderId").value(projectId.toString()))
                .andExpect(jsonPath("$.data[0].style.timeOfDay").value("EVENING"))
                .andExpect(jsonPath("$.data[0].imageUrl").value("https://minio.local/renderings/render-001.png"))
                .andExpect(jsonPath("$.data[0].status").value("SUCCESS"))
                .andExpect(jsonPath("$.data[0].createdAt").value("2026-04-15T07:50:00Z"))
                .andExpect(jsonPath("$.data[0].completedAt").value("2026-04-15T07:50:28Z"));
    }

    @Test
    void getProjectRenders_returnsBadRequestForInvalidUuid() throws Exception {
        mockMvc.perform(get("/api/v1/projects/{projectId}/renders", "not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void getProjectRenders_returnsNotFoundWhenProjectDoesNotExist() throws Exception {
        given(renderQueryService.getProjectRenders(any()))
                .willThrow(new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        mockMvc.perform(get("/api/v1/projects/{projectId}/renders", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }
}
