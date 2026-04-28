package com.a204.batang.domain.pin.controller;

import com.a204.batang.domain.pin.dto.CreatePinRequest;
import com.a204.batang.domain.pin.dto.CreatePinResponse;
import com.a204.batang.domain.pin.dto.GetProjectPinsResponse;
import com.a204.batang.domain.pin.dto.ResolvePinResponse;
import com.a204.batang.domain.pin.dto.UpdatePinPositionRequest;
import com.a204.batang.domain.pin.dto.UpdatePinPositionResponse;
import com.a204.batang.domain.pin.service.ProjectPinService;
import com.a204.batang.domain.pin.service.ProjectPinSseService;
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
 * 프로젝트 핀 API를 제공한다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{projectId}/pins")
public class ProjectPinController {

    private final ProjectPinService projectPinService;
    private final ProjectPinSseService projectPinSseService;

    /**
     * 프로젝트 핀 생성 이벤트를 SSE로 구독한다.
     *
     * @param projectId 프로젝트 ID
     * @return SSE emitter
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> subscribePinEvents(@PathVariable UUID projectId) {
        SseEmitter emitter = projectPinSseService.subscribe(projectId);
        return ResponseEntity.ok()
                .header("X-Accel-Buffering", "no")
                .header("Cache-Control", "no-cache, no-store, must-revalidate")
                .header("Pragma", "no-cache")
                .header("Expires", "0")
                .body(emitter);
    }

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

    /**
     * 프로젝트의 특정 핀 위치(카메라/월드 좌표)를 수정한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param request 핀 위치 수정 요청
     * @return 위치 수정 결과
     */
    @PatchMapping("/{pinId}/position")
    public ApiResponse<UpdatePinPositionResponse> updatePinPosition(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @Valid @RequestBody UpdatePinPositionRequest request
            // TODO: 인증 구현 시 @AuthenticationPrincipal 기반 사용자 검증 연동
    ) {
        UpdatePinPositionResponse response = projectPinService.updatePinPosition(projectId, pinId, request);
        return ApiResponse.success("핀 위치 수정 완료", response);
    }

    /**
     * 프로젝트의 특정 핀을 완료 처리한다.
     * 댓글 상태는 핀 상태를 상속하므로, 핀 완료 처리 시 해당 핀의 댓글도 완료 상태로 노출된다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 완료 처리 결과
     */
    @PatchMapping("/{pinId}/resolve")
    public ApiResponse<ResolvePinResponse> resolvePin(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId
            // TODO: 인증 구현 시 @AuthenticationPrincipal 기반 사용자 검증 연동
    ) {
        ResolvePinResponse response = projectPinService.resolvePin(projectId, pinId);
        return ApiResponse.success("핀 완료 처리 완료", response);
    }

    /**
     * 프로젝트의 특정 핀을 삭제한다.
     * 핀 삭제 시 핀에 속한 댓글도 함께 삭제된다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 삭제 결과
     */
    @DeleteMapping("/{pinId}")
    public ApiResponse<Void> deletePin(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId
            // TODO: 인증 구현 시 @AuthenticationPrincipal 기반 사용자 검증 연동
    ) {
        projectPinService.deletePin(projectId, pinId);
        return ApiResponse.success("핀 삭제 완료");
    }
}
