package com.a204.batang.domain.ifcedit.controller;

import com.a204.batang.domain.ifcedit.dto.DirectIfcEditRequest;
import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.service.DirectIfcEditCommandService;
import com.a204.batang.global.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
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

@Tag(name = "IFC Edit", description = "IFC 편집 API")
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects")
public class IfcEditController {

    private final DirectIfcEditCommandService directIfcEditCommandService;

    @Operation(
            summary = "직접 IFC 편집 요청",
            description = "엔진 요청 payload를 직접 전달하여 IFC 편집 작업을 등록한다. 응답의 jobId, jobStepId, targetRevisionId는 이후 상태 추적에 사용된다."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "작업 예약 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "잘못된 요청"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "접근 권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "프로젝트 또는 소스 revision 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "진행 중인 IFC 편집 작업 존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "502", description = "Worker command 발행 실패")
    })
    @PostMapping("/{projectId}/ifc-edit/direct")
    public ApiResponse<IfcEditJobResponse> createDirectIfcEdit(
            @Parameter(description = "IFC 편집 작업을 등록할 프로젝트 식별자", required = true)
            @PathVariable UUID projectId,
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody DirectIfcEditRequest request
    ) {
        IfcEditJobResponse response = directIfcEditCommandService.createDirectIfcEdit(projectId, userId, request);
        return ApiResponse.success("IFC 편집 작업 등록 성공", response);
    }
}
