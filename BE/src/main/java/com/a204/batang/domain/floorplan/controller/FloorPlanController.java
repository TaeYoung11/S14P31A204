package com.a204.batang.domain.floorplan.controller;

import com.a204.batang.domain.floorplan.dto.CreateFloorPlanGenerateRequest;
import com.a204.batang.domain.floorplan.dto.CreateFloorPlanGenerateResponse;
import com.a204.batang.domain.floorplan.service.FloorPlanGenerateCommandService;
import com.a204.batang.global.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Floor-plan 생성 작업 등록 API를 제공한다.
 *
 * 요청 본문을 wrapper DTO로 유지하는 이유는 raw {@code layout_import_v2}와
 * workspace snapshot fallback을 같은 엔드포인트 계약으로 묶기 위해서다.
 */
@Tag(name = "Floor Plan", description = "Floor-plan 생성 API")
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects")
public class FloorPlanController {

    private final FloorPlanGenerateCommandService floorPlanGenerateCommandService;

    @Operation(
            summary = "Floor-plan 생성 작업 등록",
            description = "비동기 floor-plan 생성 작업을 등록한다. "
                    + "요청 본문에 layoutImport가 있으면 raw layout_import_v2 payload를 우선 사용하고, "
                    + "요청 본문이 없거나 layoutImport가 null이면 저장된 workspace bubble snapshot을 fallback 입력으로 사용한다. "
                    + "응답의 jobId, jobStepId, targetRevisionId, expectedOutputArtifactId는 이후 상태 추적에 사용되는 식별자다."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200",
                    description = "Floor-plan 생성 작업 등록 성공",
                    content = @Content(schema = @Schema(implementation = CreateFloorPlanGenerateResponse.class))
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "400",
                    description = "잘못된 layout payload 또는 project identifier 형식 오류"
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
                    description = "Workspace snapshot이 없거나 workspace phase가 유효하지 않음"
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "502",
                    description = "Command 발행 실패"
            )
    })
    @PostMapping("/{projectId}/floor-plans/generate")
    public ApiResponse<CreateFloorPlanGenerateResponse> createFloorPlanGenerateJob(
            @Parameter(
                    description = "Floor-plan 생성 작업을 등록할 프로젝트 식별자다.",
                    required = true,
                    example = "96e243de-0abd-41e5-b97f-7c68afea4fa5"
            )
            @PathVariable UUID projectId,
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody(required = false) CreateFloorPlanGenerateRequest request
    ) {
        CreateFloorPlanGenerateResponse response =
                floorPlanGenerateCommandService.createFloorPlanGenerate(projectId, userId, request);
        return ApiResponse.success("Floor-plan 생성 작업 등록 성공", response);
    }
}
