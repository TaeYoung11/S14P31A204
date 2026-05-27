package com.a204.batang.domain.job.controller;

import com.a204.batang.domain.job.dto.GetJobStatusResponse;
import com.a204.batang.domain.job.service.JobStatusQueryService;
import com.a204.batang.global.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 공통 단건 작업 상태 조회 API를 제공한다.
 */
@Tag(name = "Job", description = "공통 작업 상태 조회 API")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/jobs")
public class JobController {

    private final JobStatusQueryService jobStatusQueryService;

    /**
     * 공통 jobId 기준으로 단건 작업 상태를 조회한다.
     *
     * <p>실시간 변화는 SSE로 받을 수 있지만, 이 API가 최종 상태 확인의 기준이 된다.
     */
    @Operation(
            summary = "단건 작업 상태 조회",
            description = "공통 jobId 하나로 ifcedit, render, floorplan 작업의 현재 상태와 결과 이동용 식별자를 조회합니다."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "작업 상태 조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "잘못된 jobId 형식"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "프로젝트 접근 권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "작업 또는 프로젝트를 찾을 수 없음")
    })
    @GetMapping("/{jobId}")
    public ApiResponse<GetJobStatusResponse> getJobStatus(
            @Parameter(description = "조회할 작업 ID", required = true)
            @PathVariable UUID jobId
    ) {
        GetJobStatusResponse response = jobStatusQueryService.getJobStatus(jobId);
        return ApiResponse.success("작업 상태 조회 성공", response);
    }
}
