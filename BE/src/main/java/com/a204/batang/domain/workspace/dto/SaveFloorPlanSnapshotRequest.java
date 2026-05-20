package com.a204.batang.domain.workspace.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * 2D/3D 결과물을 영구 저장할 때 사용하는 요청 DTO.
 *
 * @param revisionId 부모 revision ID(선택). 미입력 시 현재 workspace revision을 부모로 사용한다.
 * @param baseIndex 저장할 Redis floor-plan 히스토리 인덱스
 * @param s3Url 저장할 IFC 결과물의 S3 URL
 */
public record SaveFloorPlanSnapshotRequest(
        @Size(max = 50, message = "revisionId must be 50 characters or less.")
        String revisionId,
        @Min(value = 0, message = "baseIndex must be greater than or equal to 0.")
        Integer baseIndex,
        @Size(max = 2048, message = "s3Url must be 2048 characters or less.")
        String s3Url
) {
}

