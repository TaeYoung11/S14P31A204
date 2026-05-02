package com.a204.batang.domain.floorplan.controller;

import com.a204.batang.domain.floorplan.dto.CreateFloorPlanGenerateResponse;
import com.a204.batang.domain.floorplan.service.FloorPlanGenerateCommandService;
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

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(FloorPlanController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class FloorPlanControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FloorPlanGenerateCommandService floorPlanGenerateCommandService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockitoBean
    private JwtAuthFilter jwtAuthFilter;

    @Test
    void createFloorPlanGenerateJob_returnsWrappedResponse() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID targetRevisionId = UUID.randomUUID();
        UUID expectedOutputArtifactId = UUID.randomUUID();

        given(floorPlanGenerateCommandService.createFloorPlanGenerate(eq(projectId), any(), any()))
                .willReturn(new CreateFloorPlanGenerateResponse(
                        projectId,
                        jobId,
                        jobStepId,
                        targetRevisionId,
                        expectedOutputArtifactId,
                        "RAW_REQUEST",
                        "QUEUED",
                        0
                ));

        mockMvc.perform(post("/api/v1/projects/{projectId}/floor-plans/generate", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "layoutImport": {
                                    "schema_version": "v2",
                                    "id": "sample-id",
                                    "name": "sample-name",
                                    "rooms": [
                                      {
                                        "id": "room-1",
                                        "name": "거실",
                                        "type": "living",
                                        "width": 4000,
                                        "height": 3200,
                                        "floor": 1,
                                        "x": 1000.0,
                                        "y": 1500.0,
                                        "angle": 0.0,
                                        "locked": false,
                                        "zoneId": null
                                      }
                                    ],
                                    "adjacency": [],
                                    "generation_options": {
                                      "generate_spaces": true,
                                      "generate_walls": true,
                                      "generate_slabs": true,
                                      "generate_roof": true,
                                      "generate_openings": false
                                    },
                                    "generation_policy": {
                                      "boundary_wall_mode": "outer_boundary",
                                      "shared_wall_policy": "from_adjacency",
                                      "roof_shape": "flat"
                                    }
                                  }
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("Floor-plan 생성 작업 등록 성공"))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.jobId").value(jobId.toString()))
                .andExpect(jsonPath("$.data.jobStepId").value(jobStepId.toString()))
                .andExpect(jsonPath("$.data.targetRevisionId").value(targetRevisionId.toString()))
                .andExpect(jsonPath("$.data.expectedOutputArtifactId").value(expectedOutputArtifactId.toString()))
                .andExpect(jsonPath("$.data.inputSource").value("RAW_REQUEST"))
                .andExpect(jsonPath("$.data.status").value("QUEUED"))
                .andExpect(jsonPath("$.data.progress").value(0));
    }
}
