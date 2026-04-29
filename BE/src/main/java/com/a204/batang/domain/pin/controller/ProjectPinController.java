package com.a204.batang.domain.pin.controller;

import com.a204.batang.domain.pin.dto.CreatePinRequest;
import com.a204.batang.domain.pin.dto.CreatePinResponse;
import com.a204.batang.domain.pin.dto.GetProjectPinsResponse;
import com.a204.batang.domain.pin.dto.ResolvePinResponse;
import com.a204.batang.domain.pin.dto.UpdatePinPositionRequest;
import com.a204.batang.domain.pin.dto.UpdatePinPositionResponse;
import com.a204.batang.domain.pin.service.ProjectPinService;
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
 * 프로젝트 핀 API를 제공한다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{projectId}/pins")
public class ProjectPinController {

    private final ProjectPinService projectPinService;

    /**
     * 프로젝트의 핀 목록을 조회한다.
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
    ) {
        GetProjectPinsResponse response = projectPinService.getPins(projectId, page, size);
        return ApiResponse.success("핀 목록 조회에 성공했습니다.", response);
    }

    /**
     * 프로젝트의 핀 전체를 읽음 처리한다.
     *
     * @param projectId 프로젝트 ID
     * @return 처리 결과
     */
    @PostMapping("/read")
    public ApiResponse<Void> markPinsAsRead(@PathVariable UUID projectId) {
        projectPinService.markPinsAsRead(projectId);
        return ApiResponse.success("핀 읽음 처리가 완료되었습니다.");
    }

    /**
     * 프로젝트에 새 핀을 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 핀 생성 요청
     * @return 생성된 핀 응답
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CreatePinResponse> createPin(
            @PathVariable UUID projectId,
            @Valid @RequestBody CreatePinRequest request
    ) {
        CreatePinResponse response = projectPinService.createPin(projectId, request);
        return ApiResponse.created("핀 생성이 완료되었습니다.", response);
    }

    /**
     * 핀의 카메라/월드 좌표를 수정한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @param request 위치 수정 요청
     * @return 수정된 위치 응답
     */
    @PatchMapping("/{pinId}/position")
    public ApiResponse<UpdatePinPositionResponse> updatePinPosition(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId,
            @Valid @RequestBody UpdatePinPositionRequest request
    ) {
        UpdatePinPositionResponse response = projectPinService.updatePinPosition(projectId, pinId, request);
        return ApiResponse.success("핀 위치 수정이 완료되었습니다.", response);
    }

    /**
     * 핀을 완료 상태로 변경한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 완료 처리 응답
     */
    @PatchMapping("/{pinId}/resolve")
    public ApiResponse<ResolvePinResponse> resolvePin(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId
    ) {
        ResolvePinResponse response = projectPinService.resolvePin(projectId, pinId);
        return ApiResponse.success("핀 완료 처리가 완료되었습니다.", response);
    }

    /**
     * 핀과 하위 댓글을 삭제한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return 삭제 결과
     */
    @DeleteMapping("/{pinId}")
    public ApiResponse<Void> deletePin(
            @PathVariable UUID projectId,
            @PathVariable UUID pinId
    ) {
        projectPinService.deletePin(projectId, pinId);
        return ApiResponse.success("핀 삭제가 완료되었습니다.");
    }
}
