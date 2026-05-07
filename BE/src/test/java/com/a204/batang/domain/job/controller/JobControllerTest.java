package com.a204.batang.domain.job.controller;

import com.a204.batang.domain.job.dto.GetJobStatusResponse;
import com.a204.batang.domain.job.dto.JobArtifactResponse;
import com.a204.batang.domain.job.dto.JobDetailsResponse;
import com.a204.batang.domain.job.dto.JobOutputsResponse;
import com.a204.batang.domain.job.dto.JobStepResponse;
import com.a204.batang.domain.job.dto.RenderJobDetailsResponse;
import com.a204.batang.domain.job.service.JobStatusQueryService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.exception.controller.GlobalExceptionHandler;
import com.a204.batang.global.jwt.JwtAuthFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(JobController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class JobControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JobStatusQueryService jobStatusQueryService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockitoBean
    private JwtAuthFilter jwtAuthFilter;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void getJobStatus_returnsWrappedResponse() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID stepId = UUID.randomUUID();
        UUID artifactId = UUID.randomUUID();

        GetJobStatusResponse response = new GetJobStatusResponse(
                jobId,
                projectId,
                "RENDER",
                "SD_RENDER",
                "SUCCEEDED",
                100,
                true,
                "2026-05-07T01:00:00Z",
                "2026-05-07T01:01:00Z",
                "2026-05-07T01:05:00Z",
                null,
                new JobStepResponse(
                        stepId,
                        1,
                        "SD_RENDER",
                        "SUCCEEDED",
                        100,
                        0,
                        "2026-05-07T01:00:00Z",
                        "2026-05-07T01:01:00Z",
                        "2026-05-07T01:05:00Z",
                        null
                ),
                List.of(
                        new JobStepResponse(
                                stepId,
                                1,
                                "SD_RENDER",
                                "SUCCEEDED",
                                100,
                                0,
                                "2026-05-07T01:00:00Z",
                                "2026-05-07T01:01:00Z",
                                "2026-05-07T01:05:00Z",
                                null
                        )
                ),
                new JobOutputsResponse(
                        null,
                        artifactId,
                        "https://minio.local/renderings/render-001.png",
                        List.of(
                                new JobArtifactResponse(
                                        artifactId,
                                        "RENDER_IMAGE",
                                        null,
                                        "render-001.png",
                                        "image/png",
                                        "https://minio.local/renderings/render-001.png",
                                        "2026-05-07T01:05:00Z"
                                )
                        )
                ),
                new JobDetailsResponse(
                        null,
                        new RenderJobDetailsResponse(
                                UUID.randomUUID(),
                                "IFC_MODEL",
                                artifactId,
                                "quiet library exterior",
                                "rain",
                                objectMapper.readTree("""
                                        {
                                          "timeOfDay": "EVENING"
                                        }
                                        """),
                                1024,
                                1024,
                                "s3://batang/reference.png"
                        ),
                        null
                )
        );

        given(jobStatusQueryService.getJobStatus(eq(jobId))).willReturn(response);

        mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("작업 상태 조회 성공"))
                .andExpect(jsonPath("$.data.jobId").value(jobId.toString()))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.jobDomain").value("RENDER"))
                .andExpect(jsonPath("$.data.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.data.currentStep.stepNo").value(1))
                .andExpect(jsonPath("$.data.outputs.primaryArtifactId").value(artifactId.toString()))
                .andExpect(jsonPath("$.data.outputs.primaryResultUrl").value("https://minio.local/renderings/render-001.png"))
                .andExpect(jsonPath("$.data.details.render.prompt").value("quiet library exterior"))
                .andExpect(jsonPath("$.data.details.render.style.timeOfDay").value("EVENING"))
                .andExpect(jsonPath("$.data.requestPayload").doesNotExist())
                .andExpect(jsonPath("$.data.steps[0].inputPayload").doesNotExist())
                .andExpect(jsonPath("$.data.steps[0].outputPayload").doesNotExist());
    }

    @Test
    void getJobStatus_returnsBadRequestForInvalidUuid() throws Exception {
        mockMvc.perform(get("/api/v1/jobs/{jobId}", "not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_INVALID_REQUEST"));
    }

    @Test
    void getJobStatus_returnsNotFoundWhenJobDoesNotExist() throws Exception {
        UUID jobId = UUID.randomUUID();
        given(jobStatusQueryService.getJobStatus(eq(jobId)))
                .willThrow(new CustomException(ErrorCode.JOB_NOT_FOUND));

        mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_NOT_FOUND"));
    }

    @Test
    void getJobStatus_returnsNotFoundWhenProjectDoesNotExist() throws Exception {
        UUID jobId = UUID.randomUUID();
        given(jobStatusQueryService.getJobStatus(eq(jobId)))
                .willThrow(new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void getJobStatus_returnsForbiddenWhenNoAccess() throws Exception {
        UUID jobId = UUID.randomUUID();
        given(jobStatusQueryService.getJobStatus(eq(jobId)))
                .willThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS));

        mockMvc.perform(get("/api/v1/jobs/{jobId}", jobId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("COMMON_FORBIDDEN_ACCESS"));
    }
}
