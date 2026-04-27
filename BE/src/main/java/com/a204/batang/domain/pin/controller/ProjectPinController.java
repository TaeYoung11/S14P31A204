package com.a204.batang.domain.pin.controller;

import com.a204.batang.domain.pin.dto.CreatePinRequest;
import com.a204.batang.domain.pin.dto.CreatePinResponse;
import com.a204.batang.domain.pin.service.ProjectPinService;
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
 * 프로젝트 핀 API를 제공한다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{projectId}/pins")
public class ProjectPinController {

    private final ProjectPinService projectPinService;

    /**
     * 프로젝트에 새 핀(리뷰 코멘트)을 등록한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 핀 생성 요청
     * @return 생성된 핀 요약 정보
     */
    @PostMapping
    public ResponseEntity<ApiResponse<CreatePinResponse>> createPin(
            @PathVariable UUID projectId,
            @Valid @RequestBody CreatePinRequest request
            // TODO: 인증 구현 시 @AuthenticationPrincipal 기반 사용자 검증 연동
    ) {
        CreatePinResponse response = projectPinService.createPin(projectId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created("리뷰 코멘트가 등록되었습니다.", response));
    }
}
