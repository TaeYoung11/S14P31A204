package com.a204.batang.domain.floorplan.controller;

import com.a204.batang.domain.floorplan.dto.CreateFloorPlanGenerateRequest;
import com.a204.batang.domain.floorplan.dto.CreateFloorPlanGenerateResponse;
import com.a204.batang.global.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_IMPLEMENTED;

/**
 * Floor-plan 생성 API 계약을 제공한다.
 *
 * <p>이 컨트롤러는 Commit 3에서 외부 API 형태와 Swagger 문서를 먼저 고정하기 위해 추가되었다.
 * Worker orchestration과 persistence wiring은 이후 커밋에서 연결한다.</p>
 */
@Tag(name = "Floor Plan", description = "Floor-plan 생성 API")
@Validated
@RestController
@RequestMapping("/api/v1/projects")
public class FloorPlanController {

    @Operation(
            summary = "Floor-plan 생성 작업 등록",
            description = "비동기 floor-plan 생성 작업을 등록합니다. "
                    + "요청 본문에 layoutImport가 있으면 raw layout_import_v2 payload를 우선 사용하고, "
                    + "본문이 없거나 layoutImport가 null이면 저장된 workspace bubble snapshot으로 대체합니다. "
                    + "실제 command 발행과 worker orchestration은 이후 커밋에서 연결합니다."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200",
                    description = "Floor-plan 생성 작업 요청 등록 성공",
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
                    description = "Floor-plan 생성 작업을 등록할 프로젝트 식별자입니다.",
                    required = true,
                    example = "96e243de-0abd-41e5-b97f-7c68afea4fa5"
            )
            @PathVariable UUID projectId,
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody(required = false) CreateFloorPlanGenerateRequest request
    ) {
        throw new ResponseStatusException(
                NOT_IMPLEMENTED,
                "Commit 3에서는 floor-plan generate orchestration이 아직 연결되지 않았습니다. "
                        + "현재 엔드포인트는 외부 계약과 Swagger 문서를 고정하기 위한 용도입니다."
        );
    }
}
