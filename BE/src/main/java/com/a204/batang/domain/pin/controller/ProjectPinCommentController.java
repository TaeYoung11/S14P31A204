package com.a204.batang.domain.pin.controller;

import com.a204.batang.domain.pin.dto.CreatePinCommentRequest;
import com.a204.batang.domain.pin.dto.CreatePinCommentResponse;
import com.a204.batang.domain.pin.dto.GetPinCommentsResponse;
import com.a204.batang.domain.pin.dto.ResolvePinCommentResponse;
import com.a204.batang.domain.pin.dto.UpdatePinCommentRequest;
import com.a204.batang.domain.pin.dto.UpdatePinCommentResponse;
import com.a204.batang.domain.pin.service.ProjectPinCommentService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
     * 핀에 댓글을 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param request 댓글 생성 요청
     * @return 생성된 댓글 응답
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CreatePinCommentResponse> createComment(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @Valid @RequestBody CreatePinCommentRequest request
    ) {
        CreatePinCommentResponse response = projectPinCommentService.createComment(projectId, pinId, request);
        return ApiResponse.created("댓글 생성이 완료되었습니다.", response);
    }

    /**
     * 댓글 내용을 수정한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param commentId 댓글 ID
     * @param request 댓글 수정 요청
     * @return 수정된 댓글 응답
     */
    @PatchMapping("/{commentId}")
    public ApiResponse<UpdatePinCommentResponse> updateComment(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @PathVariable UUID commentId,
            @Valid @RequestBody UpdatePinCommentRequest request
    ) {
        UpdatePinCommentResponse response = projectPinCommentService.updateComment(projectId, pinId, commentId, request);
        return ApiResponse.success("댓글 수정이 완료되었습니다.", response);
    }

    /**
     * 댓글 하나를 완료 상태로 변경한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param commentId 댓글 ID
     * @return 완료 처리 응답
     */
    @PatchMapping("/{commentId}/resolve")
    public ApiResponse<ResolvePinCommentResponse> resolveComment(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @PathVariable UUID commentId
    ) {
        ResolvePinCommentResponse response = projectPinCommentService.resolveComment(projectId, pinId, commentId);
        return ApiResponse.success("댓글 완료 처리가 완료되었습니다.", response);
    }

    /**
     * 댓글을 삭제한다.
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
        return ApiResponse.success("댓글 삭제가 완료되었습니다.");
    }

    /**
     * 핀의 댓글 목록을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param page 1-base 페이지 번호
     * @param size 페이지 크기
     * @return 댓글 목록 응답
     */
    @GetMapping
    public ApiResponse<GetPinCommentsResponse> getComments(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @RequestParam(defaultValue = "1") @Min(value = 1, message = "page는 1 이상이어야 합니다.") int page,
            @RequestParam(defaultValue = "20") @Min(value = 1, message = "size는 1 이상이어야 합니다.") int size
    ) {
        GetPinCommentsResponse response = projectPinCommentService.getComments(projectId, pinId, page, size);
        return ApiResponse.success("핀 댓글 목록 조회에 성공했습니다.", response);
    }

    /**
     * 핀 댓글 전체를 읽음 처리한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 처리 결과
     */
    @PostMapping("/read")
    public ApiResponse<Void> markCommentsAsRead(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId
    ) {
        projectPinCommentService.markCommentsAsRead(projectId, pinId);
        return ApiResponse.success("핀 댓글 읽음 처리가 완료되었습니다.");
    }
}
