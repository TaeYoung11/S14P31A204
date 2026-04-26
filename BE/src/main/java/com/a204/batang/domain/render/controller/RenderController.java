package com.a204.batang.domain.render.controller;

import com.a204.batang.domain.render.dto.ProjectRenderResponse;
import com.a204.batang.domain.render.service.RenderQueryService;
import com.a204.batang.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * 렌더링 결과 조회 API를 제공한다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects")
public class RenderController {

    private final RenderQueryService renderQueryService;

    /**
     * 프로젝트의 렌더링 결과 목록을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return 렌더링 결과 목록
     */
    @GetMapping("/{projectId}/renders")
    public ApiResponse<List<ProjectRenderResponse>> getProjectRenders(
            @PathVariable UUID projectId
            // TODO: 인증 구현 후 사용자 ID 연동
    ) {
        List<ProjectRenderResponse> response = renderQueryService.getProjectRenders(projectId);
        return ApiResponse.success("렌더링 결과 목록 조회 성공", response);
    }
}
