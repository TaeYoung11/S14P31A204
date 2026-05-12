package com.a204.batang.domain.render.controller;

import com.a204.batang.domain.render.dto.CreateRenderResponse;
import com.a204.batang.domain.render.dto.ProjectRenderResponse;
import com.a204.batang.domain.render.dto.ProjectRenderStyleResponse;
import com.a204.batang.domain.render.service.RenderCommandService;
import com.a204.batang.domain.render.service.RenderQueryService;
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
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
    private RenderCommandService renderCommandService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockitoBean
    private JwtAuthFilter jwtAuthFilter;

    @Test
    void getProjectRenders_returnsWrappedResponse() throws Exception {
        UUID projectId = UUID.fromString("96e243de-0abd-41e5-b97f-7c68afea4fa5");
        ProjectRenderResponse response = new ProjectRenderResponse(
                projectId,
                new ProjectRenderStyleResponse("EVENING", "EXTERIOR", "SPRING", "CLEAR"),
                "https://minio.local/renderings/render-001.png",
                "SUCCEEDED",
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
                .andExpect(jsonPath("$.data[0].status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.data[0].createdAt").value("2026-04-15T07:50:00Z"))
                .andExpect(jsonPath("$.data[0].completedAt").value("2026-04-15T07:50:28Z"));
    }

    @Test
    void getProjectRender_returnsWrappedResponse() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID renderId = UUID.randomUUID();
        ProjectRenderResponse response = new ProjectRenderResponse(
                renderId,
                new ProjectRenderStyleResponse("EVENING", "EXTERIOR", "SPRING", "CLEAR"),
                "https://download.example.com/render.png?signature=test",
                "SUCCEEDED",
                "2026-04-15T07:50:00Z",
                "2026-04-15T07:50:28Z"
        );
        given(renderQueryService.getProjectRender(projectId, renderId)).willReturn(response);

        mockMvc.perform(get("/api/v1/projects/{projectId}/renders/{renderId}", projectId, renderId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("렌더링 결과 조회 성공"))
                .andExpect(jsonPath("$.data.renderId").value(renderId.toString()))
                .andExpect(jsonPath("$.data.style.timeOfDay").value("EVENING"))
                .andExpect(jsonPath("$.data.imageUrl").value("https://download.example.com/render.png?signature=test"))
                .andExpect(jsonPath("$.data.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.data.createdAt").value("2026-04-15T07:50:00Z"))
                .andExpect(jsonPath("$.data.completedAt").value("2026-04-15T07:50:28Z"));
    }

    @Test
    void createProjectRender_returnsWrappedResponse() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID renderId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID artifactId = UUID.randomUUID();

        given(renderCommandService.createRender(eq(projectId), any()))
                .willReturn(new CreateRenderResponse(
                        renderId,
                        jobStepId,
                        projectId,
                        null,
                        artifactId,
                        "QUEUED",
                        0
                ));

        mockMvc.perform(post("/api/v1/projects/{projectId}/renders", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "prompt": "quiet library exterior",
                                  "width": 1024,
                                  "height": 1024
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("렌더링 요청 등록 성공"))
                .andExpect(jsonPath("$.data.renderId").value(renderId.toString()))
                .andExpect(jsonPath("$.data.jobStepId").value(jobStepId.toString()))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.expectedOutputArtifactId").value(artifactId.toString()))
                .andExpect(jsonPath("$.data.status").value("QUEUED"))
                .andExpect(jsonPath("$.data.progress").value(0));
    }

    @Test
    void createProjectRender_returnsBadRequestWhenValidationFails() throws Exception {
        UUID projectId = UUID.randomUUID();

        mockMvc.perform(post("/api/v1/projects/{projectId}/renders", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "prompt": "",
                                  "width": 128,
                                  "height": 4096
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void getProjectRenders_returnsBadRequestForInvalidUuid() throws Exception {
        mockMvc.perform(get("/api/v1/projects/{projectId}/renders", "not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void getProjectRender_returnsBadRequestForInvalidUuid() throws Exception {
        mockMvc.perform(get("/api/v1/projects/{projectId}/renders/{renderId}", UUID.randomUUID(), "not-a-uuid"))
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

    @Test
    void getProjectRender_returnsNotFoundWhenRenderJobDoesNotExist() throws Exception {
        given(renderQueryService.getProjectRender(any(), any()))
                .willThrow(new CustomException(ErrorCode.RENDER_JOB_NOT_FOUND));

        mockMvc.perform(get("/api/v1/projects/{projectId}/renders/{renderId}", UUID.randomUUID(), UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("RENDER_JOB_NOT_FOUND"));
    }

    @Test
    void getProjectRender_returnsForbiddenWhenNoAccess() throws Exception {
        given(renderQueryService.getProjectRender(any(), any()))
                .willThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS));

        mockMvc.perform(get("/api/v1/projects/{projectId}/renders/{renderId}", UUID.randomUUID(), UUID.randomUUID()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.code").value("COMMON_FORBIDDEN_ACCESS"));
    }

    @Test
    void getProjectRender_returnsBadGatewayWhenPresignFails() throws Exception {
        given(renderQueryService.getProjectRender(any(), any()))
                .willThrow(new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED));

        mockMvc.perform(get("/api/v1/projects/{projectId}/renders/{renderId}", UUID.randomUUID(), UUID.randomUUID()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.status").value(502))
                .andExpect(jsonPath("$.code").value("RENDER_IMAGE_PRESIGN_FAILED"));
    }
}
