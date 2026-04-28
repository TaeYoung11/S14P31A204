package com.a204.batang.domain.pin.controller;

import com.a204.batang.domain.pin.dto.CreatePinCommentRequest;
import com.a204.batang.domain.pin.dto.CreatePinCommentResponse;
import com.a204.batang.domain.pin.dto.GetPinCommentsResponse;
import com.a204.batang.domain.pin.dto.UpdatePinCommentRequest;
import com.a204.batang.domain.pin.dto.UpdatePinCommentResponse;
import com.a204.batang.domain.pin.service.ProjectPinCommentService;
import com.a204.batang.domain.pin.service.ProjectPinCommentSseService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

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
    private final ProjectPinCommentSseService projectPinCommentSseService;

    /**
     * 핀 댓글 생성 이벤트를 SSE로 구독한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return SSE emitter
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> subscribeCommentEvents(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId
    ) {
        SseEmitter emitter = projectPinCommentSseService.subscribe(projectId, pinId);
        return ResponseEntity.ok()
                .header("X-Accel-Buffering", "no")
                .header("Cache-Control", "no-cache, no-store, must-revalidate")
                .header("Pragma", "no-cache")
                .header("Expires", "0")
                .body(emitter);
    }

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
     * 핀 댓글 본문을 수정한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param commentId 댓글 ID
     * @param request 댓글 수정 요청
     * @return 댓글 수정 결과
     */
    @PatchMapping("/{commentId}")
    public ApiResponse<UpdatePinCommentResponse> updateComment(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @PathVariable UUID commentId,
            @Valid @RequestBody UpdatePinCommentRequest request
    ) {
        UpdatePinCommentResponse response = projectPinCommentService.updateComment(projectId, pinId, commentId, request);
        return ApiResponse.success("댓글 수정 완료", response);
    }

    /**
     * 핀 댓글을 삭제한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param commentId 댓글 ID
     * @return 삭제 결과
     */
    @DeleteMapping("/{commentId}")
    public ApiResponse<Void> deleteComment(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @PathVariable UUID commentId
    ) {
        projectPinCommentService.deleteComment(projectId, pinId, commentId);
        return ApiResponse.success("댓글 삭제 완료");
    }

    /**
     * 특정 핀의 댓글 목록을 페이지 단위로 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param page 1-base 페이지 번호
     * @param size 페이지 크기
     * @return 댓글 목록
     */
    @GetMapping
    public ApiResponse<GetPinCommentsResponse> getComments(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @RequestParam(defaultValue = "1") @Min(value = 1, message = "page는 1 이상이어야 합니다.") int page,
            @RequestParam(defaultValue = "20") @Min(value = 1, message = "size는 1 이상이어야 합니다.") int size
    ) {
        GetPinCommentsResponse response = projectPinCommentService.getComments(projectId, pinId, page, size);
        return ApiResponse.success("핀 댓글 목록 조회 성공", response);
    }

    /**
     * 특정 핀의 댓글 목록을 읽음 처리한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 처리 결과
     */
    @PostMapping("/read")
    public ApiResponse<Void> markCommentsAsRead(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId
            // TODO: 인증 구현 시 @AuthenticationPrincipal 기반 사용자 검증 연동
    ) {
        projectPinCommentService.markCommentsAsRead(projectId, pinId);
        return ApiResponse.success("핀 댓글 읽음 처리 완료");
    }
}
