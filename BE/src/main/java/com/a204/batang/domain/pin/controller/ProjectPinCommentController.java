package com.a204.batang.domain.pin.controller;

import com.a204.batang.domain.pin.dto.CreatePinCommentRequest;
import com.a204.batang.domain.pin.dto.CreatePinCommentResponse;
import com.a204.batang.domain.pin.dto.GetPinCommentsResponse;
import com.a204.batang.domain.pin.service.ProjectPinCommentService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 프로젝트 핀 댓글 API를 제공한다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{projectId}/pins/{pinId}/comments")
public class ProjectPinCommentController {

    private final ProjectPinCommentService projectPinCommentService;

    /**
     * 핀 댓글을 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param request 댓글 생성 요청
     * @return 생성된 댓글 정보
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CreatePinCommentResponse> createComment(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @Valid @RequestBody CreatePinCommentRequest request
    ) {
        CreatePinCommentResponse response = projectPinCommentService.createComment(projectId, pinId, request);
        return ApiResponse.created("댓글이 등록되었습니다.", response);
    }

    /**
     * 특정 핀의 댓글 목록을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 댓글 목록
     */
    @GetMapping
    public ApiResponse<GetPinCommentsResponse> getComments(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId
    ) {
        GetPinCommentsResponse response = projectPinCommentService.getComments(projectId, pinId);
        return ApiResponse.success("핀 댓글 목록 조회 성공", response);
    }
}
