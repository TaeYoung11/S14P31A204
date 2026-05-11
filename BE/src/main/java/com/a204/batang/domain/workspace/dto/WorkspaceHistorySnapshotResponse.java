package com.a204.batang.domain.workspace.dto;

import com.a204.batang.domain.project.dto.ProjectSiteDetailResponse;
import com.a204.batang.domain.workspace.entity.PhaseStatus;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * 워크스페이스 최초 진입 시 복원에 사용하는 최신 히스토리 스냅샷 응답 DTO.
 *
 * @param phaseStatus 현재 워크스페이스 단계
 * @param siteInfo 대지 정보
 * @param bubble 버블 히스토리 최신 상태
 * @param floorPlan 2D/3D 히스토리 최신 상태
 */
public record WorkspaceHistorySnapshotResponse(
        PhaseStatus phaseStatus,
        ProjectSiteDetailResponse siteInfo,
        WorkspaceHistoryState bubble,
        WorkspaceHistoryState floorPlan
) {

    /**
     * 히스토리 영역의 공통 표현 모델.
     *
     * @param baseIndex 현재 스냅샷 인덱스
     * @param redoDepth redo 가능 깊이(최신 기준 0)
     * @param snapshot 최신 스냅샷 payload
     * @param s3Url 스냅샷과 연관된 S3 URL
     */
    public record WorkspaceHistoryState(
            int baseIndex,
            int redoDepth,
            JsonNode snapshot,
            String s3Url
    ) {

        /**
         * 히스토리가 없는 초기 상태를 생성한다.
         *
         * @return 빈 히스토리 상태
         */
        public static WorkspaceHistoryState empty() {
            return new WorkspaceHistoryState(-1, 0, null, null);
        }

        /**
         * 최신 스냅샷 기준 히스토리 상태를 생성한다.
         *
         * @param baseIndex 최신 스냅샷 인덱스
         * @param snapshot 최신 스냅샷 payload
         * @param s3Url 최신 스냅샷 S3 URL
         * @return 히스토리 상태
         */
        public static WorkspaceHistoryState latest(int baseIndex, JsonNode snapshot, String s3Url) {
            return new WorkspaceHistoryState(baseIndex, 0, snapshot, s3Url);
        }
    }
}
