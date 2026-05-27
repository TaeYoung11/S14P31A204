package com.a204.batang.domain.workspace.controller;

import com.a204.batang.domain.workspace.dto.ExportFloorPlanIfcResponse;
import com.a204.batang.domain.workspace.service.WorkspaceExportService;
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
import java.util.UUID;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(IfcExportController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class IfcExportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private WorkspaceExportService workspaceExportService;

    @MockitoBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @MockitoBean
    private JwtAuthFilter jwtAuthFilter;

    @Test
    void exportFloorPlanIfc_returnsWrappedResponse() throws Exception {
        UUID projectId = UUID.randomUUID();
        String revisionId = UUID.randomUUID().toString();

        given(workspaceExportService.exportFloorPlanIfc(projectId))
                .willReturn(new ExportFloorPlanIfcResponse(
                        projectId,
                        revisionId,
                        "projects/%s/revisions/%s/ifc/model.v1.ifc".formatted(projectId, revisionId),
                        "https://download.example.com/model.ifc?signature=test",
                        LocalDateTime.of(2026, 5, 7, 10, 0, 0)
                ));

        mockMvc.perform(get("/api/v1/projects/{projectId}/ifc/export", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("IFC 파일 다운로드 URL을 생성했습니다."))
                .andExpect(jsonPath("$.data.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.data.revisionId").value(revisionId))
                .andExpect(jsonPath("$.data.presignedUrl").value("https://download.example.com/model.ifc?signature=test"));
    }

    @Test
    void exportFloorPlanIfc_mapsSourceNotFoundException() throws Exception {
        UUID projectId = UUID.randomUUID();
        given(workspaceExportService.exportFloorPlanIfc(projectId))
                .willThrow(new CustomException(ErrorCode.WORKSPACE_IFC_EXPORT_SOURCE_NOT_FOUND));

        mockMvc.perform(get("/api/v1/projects/{projectId}/ifc/export", projectId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("WORKSPACE_IFC_EXPORT_SOURCE_NOT_FOUND"));
    }
}
