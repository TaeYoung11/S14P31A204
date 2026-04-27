package com.a204.batang.domain.pin.controller;

import com.a204.batang.domain.pin.dto.CreatePinCommentRequest;
import com.a204.batang.domain.pin.dto.CreatePinCommentResponse;
import com.a204.batang.domain.pin.service.ProjectPinCommentService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
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
     * 핀에 댓글을 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param request 댓글 생성 요청
     * @return 생성된 댓글 정보
     */
    @PostMapping
    public ResponseEntity<ApiResponse<CreatePinCommentResponse>> createComment(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @Valid @RequestBody CreatePinCommentRequest request
    ) {
        CreatePinCommentResponse response = projectPinCommentService.createComment(projectId, pinId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created("댓글이 등록되었습니다.", response));
    }
}
