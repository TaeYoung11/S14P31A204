package com.a204.batang.domain.workspace.controller;

import com.a204.batang.domain.workspace.dto.PublishFloorPlanUpdatedRequest;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotResponse;
import com.a204.batang.domain.workspace.service.WorkspaceCommandService;
import com.a204.batang.domain.workspace.service.WorkspaceFloorPlanRealtimeService;
import com.a204.batang.global.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 프로젝트 워크스페이스 편집 API를 제공한다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{projectId}/workspace")
public class WorkspaceController {

    private final WorkspaceCommandService workspaceCommandService;
    private final WorkspaceFloorPlanRealtimeService workspaceFloorPlanRealtimeService;

    /**
     * 버블 다이어그램을 명시적으로 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 저장 요청 payload
     * @return 저장 결과 응답
     */
    @PostMapping("/bubble/save")
    public ApiResponse<SaveBubbleSnapshotResponse> saveBubbleSnapshot(
            @PathVariable UUID projectId,
            @Valid @RequestBody SaveBubbleSnapshotRequest request
    ) {
        SaveBubbleSnapshotResponse response = workspaceCommandService.saveBubbleSnapshot(projectId, request);
        return ApiResponse.success("버블 다이어그램 저장이 완료되었습니다.", response);
    }

    /**
     * 파이썬 렌더링 완료 콜백을 수신해 floor-plan 업데이트 완료 이벤트를 발행한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 파이썬 완료 콜백 payload
     * @return 처리 완료 응답
     */
    @PostMapping("/floor-plan/webhook")
    public ApiResponse<Void> publishFloorPlanUpdated(
            @PathVariable UUID projectId,
            @Valid @RequestBody PublishFloorPlanUpdatedRequest request
    ) {
        workspaceFloorPlanRealtimeService.publishFloorPlanUpdated(projectId, request);
        return ApiResponse.success("floor-plan 업데이트 완료 이벤트를 발행했습니다.");
    }
}
