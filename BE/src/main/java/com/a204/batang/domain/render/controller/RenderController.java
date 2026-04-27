package com.a204.batang.domain.render.controller;

import com.a204.batang.domain.render.dto.ProjectRenderResponse;
import com.a204.batang.domain.render.service.RenderQueryService;
import com.a204.batang.global.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Render", description = "프로젝트 렌더링 결과 조회 API")
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
    @Operation(
            summary = "프로젝트 렌더링 결과 목록 조회",
            description = "특정 프로젝트의 렌더링 결과 목록을 최신 요청순으로 조회하며 createdAt/completedAt은 UTC ISO-8601(Z) 형식으로 반환합니다."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200",
                    description = "렌더링 결과 목록 조회 성공",
                    content = @Content(array = @ArraySchema(schema = @Schema(implementation = ProjectRenderResponse.class)))
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "400",
                    description = "잘못된 프로젝트 ID 형식"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "403",
                    description = "프로젝트 접근 권한 없음"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "404",
                    description = "프로젝트를 찾을 수 없음"
            )
    })
    @GetMapping("/{projectId}/renders")
    public ApiResponse<List<ProjectRenderResponse>> getProjectRenders(
            @Parameter(
                    description = "렌더링 결과를 조회할 프로젝트 ID",
                    required = true,
                    example = "96e243de-0abd-41e5-b97f-7c68afea4fa5"
            )
            @PathVariable UUID projectId
            // TODO: 인증 구현 후 사용자 ID 연동
    ) {
        List<ProjectRenderResponse> response = renderQueryService.getProjectRenders(projectId);
        return ApiResponse.success("렌더링 결과 목록 조회 성공", response);
    }
}
