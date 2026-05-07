package com.a204.batang.domain.chat.controller;

import com.a204.batang.domain.chat.dto.GetProjectChatLogsResponse;
import com.a204.batang.domain.chat.service.ProjectChatLogQueryService;
import com.a204.batang.global.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 프로젝트 채팅 로그 조회 API를 제공한다.
 */
@Tag(name = "Chat", description = "프로젝트 채팅 로그 API")
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects")
public class ProjectChatLogController {

    private final ProjectChatLogQueryService projectChatLogQueryService;

    /**
     * 프로젝트 채팅 로그를 페이지 단위로 조회한다.
     *
     * <p>현재는 jobs 기반 virtual log를 반환하지만, 향후 chat_messages 테이블로 전환되더라도
     * 외부 응답 계약은 유지하는 것을 목표로 한다.
     */
    @Operation(
            summary = "프로젝트 채팅 로그 조회",
            description = "프로젝트의 채팅 로그를 최신 페이지 기준으로 조회합니다. 현재는 jobs 기반 virtual log를 사용하며, 같은 페이지 내부의 메시지는 시간 오름차순으로 반환합니다."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "200",
                    description = "채팅 로그 조회 성공",
                    content = @Content(schema = @Schema(implementation = GetProjectChatLogsResponse.class))
            ),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "잘못된 요청"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "프로젝트 접근 권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "프로젝트를 찾을 수 없음")
    })
    @GetMapping("/{projectId}/chat-logs")
    public ApiResponse<GetProjectChatLogsResponse> getProjectChatLogs(
            @Parameter(description = "프로젝트 ID", required = true)
            @PathVariable UUID projectId,
            @Parameter(description = "0-base 페이지 번호", example = "0")
            @RequestParam(defaultValue = "0")
            @Min(value = 0, message = "page는 0 이상이어야 합니다.")
            int page,
            @Parameter(description = "페이지 크기", example = "50")
            @RequestParam(defaultValue = "50")
            @Min(value = 1, message = "size는 1 이상이어야 합니다.")
            @Max(value = 100, message = "size는 100 이하이어야 합니다.")
            int size
    ) {
        GetProjectChatLogsResponse response = projectChatLogQueryService.getProjectChatLogs(projectId, page, size);
        return ApiResponse.success("프로젝트 채팅 로그 조회 성공", response);
    }
}
