package com.a204.batang.domain.render.controller;

import com.a204.batang.domain.render.dto.CreateRenderRequest;
import com.a204.batang.domain.render.dto.CreateRenderResponse;
import com.a204.batang.domain.render.dto.ProjectRenderResponse;
import com.a204.batang.domain.render.service.RenderCommandService;
import com.a204.batang.domain.render.service.RenderQueryService;
import com.a204.batang.global.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트 렌더링 조회/요청 API를 제공한다.
 */
@Tag(name = "Render", description = "프로젝트 렌더링 API")
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects")
public class RenderController {

    private final RenderCommandService renderCommandService;
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
    ) {
        List<ProjectRenderResponse> response = renderQueryService.getProjectRenders(projectId);
        return ApiResponse.success("렌더링 결과 목록 조회 성공", response);
    }

    /**
     * 프로젝트의 렌더링 결과를 단건 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param renderId 렌더링 ID(jobId)
     * @return 렌더링 결과
     */
    @Operation(
            summary = "프로젝트 렌더링 결과 단건 조회",
            description = "특정 프로젝트의 렌더링 결과를 jobId 기준으로 조회하며 imageUrl은 presigned URL로 반환합니다."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200",
                    description = "렌더링 결과 단건 조회 성공",
                    content = @Content(schema = @Schema(implementation = ProjectRenderResponse.class))
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "400",
                    description = "잘못된 프로젝트 ID 또는 렌더링 ID 형식"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "403",
                    description = "프로젝트 접근 권한 없음"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "404",
                    description = "프로젝트 또는 렌더링 결과를 찾을 수 없음"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "502",
                    description = "렌더링 이미지 URL 생성 실패"
            )
    })
    @GetMapping("/{projectId}/renders/{renderId}")
    public ApiResponse<ProjectRenderResponse> getProjectRender(
            @Parameter(
                    description = "렌더링 결과를 조회할 프로젝트 ID",
                    required = true,
                    example = "96e243de-0abd-41e5-b97f-7c68afea4fa5"
            )
            @PathVariable UUID projectId,
            @Parameter(
                    description = "렌더링 ID(jobId)",
                    required = true,
                    example = "96e243de-0abd-41e5-b97f-7c68afea4fa5"
            )
            @PathVariable UUID renderId
    ) {
        ProjectRenderResponse response = renderQueryService.getProjectRender(projectId, renderId);
        return ApiResponse.success("렌더링 결과 조회 성공", response);
    }

    /**
     * 프로젝트에 대한 실사 렌더링 작업을 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 렌더링 생성 요청
     * @return 생성된 렌더링 작업 정보
     */
    @Operation(
            summary = "프로젝트 렌더링 요청 생성",
            description = "특정 프로젝트에 대한 실사 이미지 렌더링 작업을 생성하고 Stable Diffusion Worker 실행을 위한 비동기 작업을 등록한다."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200",
                    description = "렌더링 요청 등록 성공",
                    content = @Content(schema = @Schema(implementation = CreateRenderResponse.class))
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "400",
                    description = "잘못된 요청 본문 또는 프로젝트 ID 형식"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "403",
                    description = "프로젝트 접근 권한 없음"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "404",
                    description = "프로젝트를 찾을 수 없음"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "409",
                    description = "렌더링할 IFC 모델이 없음"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "502",
                    description = "렌더링 작업 요청 발행 실패"
            )
    })
    @PostMapping("/{projectId}/renders")
    public ApiResponse<CreateRenderResponse> createProjectRender(
            @Parameter(
                    description = "렌더링 작업을 생성할 프로젝트 ID",
                    required = true,
                    example = "96e243de-0abd-41e5-b97f-7c68afea4fa5"
            )
            @PathVariable UUID projectId,
            @Valid @RequestBody CreateRenderRequest request
    ) {
        CreateRenderResponse response = renderCommandService.createRender(projectId, request);
        return ApiResponse.success("렌더링 요청 등록 성공", response);
    }
}
