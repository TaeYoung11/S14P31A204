package com.a204.batang.domain.pin.controller;

import com.a204.batang.domain.pin.dto.CreatePinRequest;
import com.a204.batang.domain.pin.dto.CreatePinResponse;
import com.a204.batang.domain.pin.dto.GetProjectPinsResponse;
import com.a204.batang.domain.pin.service.ProjectPinService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 프로젝트 핀 API를 제공한다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{projectId}/pins")
public class ProjectPinController {

    private final ProjectPinService projectPinService;

    /**
     * 프로젝트의 핀 목록을 페이지 단위로 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param page 1-base 페이지 번호
     * @param size 페이지 크기
     * @return 핀 목록 응답
     */
    @GetMapping
    public ApiResponse<GetProjectPinsResponse> getPins(
            @PathVariable UUID projectId,
            @RequestParam(defaultValue = "1") @Min(value = 1, message = "page는 1 이상이어야 합니다.") int page,
            @RequestParam(defaultValue = "20") @Min(value = 1, message = "size는 1 이상이어야 합니다.") int size
            // TODO: 인증 구현 시 @AuthenticationPrincipal 기반 사용자 검증 연동
    ) {
        GetProjectPinsResponse response = projectPinService.getPins(projectId, page, size);
        return ApiResponse.success("핀 목록 조회 성공", response);
    }

    /**
     * 프로젝트 핀 목록을 읽음 처리한다.
     *
     * @param projectId 프로젝트 ID
     * @return 처리 결과
     */
    @PostMapping("/read")
    public ApiResponse<Void> markPinsAsRead(
            @PathVariable UUID projectId
            // TODO: 인증 구현 시 @AuthenticationPrincipal 기반 사용자 검증 연동
    ) {
        projectPinService.markPinsAsRead(projectId);
        return ApiResponse.success("핀 목록 읽음 처리 완료");
    }

    /**
     * 프로젝트에 핀(리뷰 코멘트)을 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 핀 생성 요청
     * @return 생성된 핀 요약 정보
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CreatePinResponse> createPin(
            @PathVariable UUID projectId,
            @Valid @RequestBody CreatePinRequest request
            // TODO: 인증 구현 시 @AuthenticationPrincipal 기반 사용자 검증 연동
    ) {
        CreatePinResponse response = projectPinService.createPin(projectId, request);
        return ApiResponse.created("리뷰 코멘트가 등록되었습니다.", response);
    }
}
