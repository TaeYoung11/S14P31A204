package com.a204.batang.domain.workspace.controller;

import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotRequest;
import com.a204.batang.domain.workspace.dto.SaveBubbleSnapshotResponse;
import com.a204.batang.domain.workspace.service.WorkspaceCommandService;
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
 * 프로젝트 워크스페이스의 버블 다이어그램 저장 API를 제공한다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects/{projectId}/workspace")
public class WorkspaceController {

    private final WorkspaceCommandService workspaceCommandService;

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
}
