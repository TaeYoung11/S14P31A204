package com.a204.batang.domain.workspace.controller;

import com.a204.batang.domain.workspace.dto.ExportFloorPlanIfcResponse;
import com.a204.batang.domain.workspace.service.WorkspaceExportService;
import com.a204.batang.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * IFC 파일 내보내기 API를 제공한다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{projectId}/ifc")
public class IfcExportController {

    private final WorkspaceExportService workspaceExportService;

    /**
     * 프로젝트의 최신 IFC 파일 다운로드를 위한 presigned URL을 발급한다.
     *
     * @param projectId 프로젝트 ID
     * @return IFC export 응답
     */
    @GetMapping("/export")
    public ApiResponse<ExportFloorPlanIfcResponse> exportFloorPlanIfc(
            @PathVariable UUID projectId
    ) {
        ExportFloorPlanIfcResponse response = workspaceExportService.exportFloorPlanIfc(projectId);
        return ApiResponse.success("IFC 파일 다운로드 URL을 생성했습니다.", response);
    }
}
