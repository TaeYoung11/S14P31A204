package com.a204.batang.domain.workspace.controller;

import com.a204.batang.domain.workspace.dto.PublishFloorPlanUpdatedRequest;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotResponse;
import com.a204.batang.domain.workspace.dto.SaveFloorPlanSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveFloorPlanSnapshotResponse;
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
 * 프로젝트 워크스페이스 명령 API를 제공한다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{projectId}/workspace")
public class WorkspaceController {

    private final WorkspaceCommandService workspaceCommandService;
    private final WorkspaceFloorPlanRealtimeService workspaceFloorPlanRealtimeService;

    /**
     * 버블 스냅샷을 명시적으로 DB에 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 저장 요청 payload
     * @return 저장 결과
     */
    @PostMapping("/bubble/save")
    public ApiResponse<SaveBubbleSnapshotResponse> saveBubbleSnapshot(
            @PathVariable UUID projectId,
            @Valid @RequestBody SaveBubbleSnapshotRequest request
    ) {
        SaveBubbleSnapshotResponse response = workspaceCommandService.saveBubbleSnapshot(projectId, request);
        return ApiResponse.success("버블 스냅샷을 저장했습니다.", response);
    }

    /**
     * 파이썬 렌더링 완료 콜백을 수신해 실시간 업데이트 이벤트를 발행한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 파이썬 콜백 payload
     * @return 처리 결과
     */
    @PostMapping("/floor-plan/webhook")
    public ApiResponse<Void> publishFloorPlanUpdated(
            @PathVariable UUID projectId,
            @Valid @RequestBody PublishFloorPlanUpdatedRequest request
    ) {
        workspaceFloorPlanRealtimeService.publishFloorPlanUpdated(projectId, request);
        return ApiResponse.success("floor-plan 업데이트 완료 이벤트를 발행했습니다.");
    }

    /**
     * 2D/3D 저장 버튼 요청을 받아 IFC 결과물을 RDB에 영구 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 저장 요청 payload
     * @return 저장 결과
     */
    @PostMapping("/floor-plan/save")
    public ApiResponse<SaveFloorPlanSnapshotResponse> saveFloorPlanSnapshot(
            @PathVariable UUID projectId,
            @Valid @RequestBody SaveFloorPlanSnapshotRequest request
    ) {
        SaveFloorPlanSnapshotResponse response = workspaceCommandService.saveFloorPlanSnapshot(projectId, request);
        return ApiResponse.success("floor-plan 결과물을 저장했습니다.", response);
    }
}
