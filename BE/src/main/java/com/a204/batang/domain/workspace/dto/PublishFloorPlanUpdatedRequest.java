package com.a204.batang.domain.workspace.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 파이썬 렌더링 완료 콜백 요청 DTO.
 *
 * @param revisionId 파이썬이 처리한 리비전 ID
 * @param floorPlanPayloadJson 프런트 동기화용 2D/3D payload
 * @param s3Url 파이썬 렌더 결과 S3 URL
 */
public record PublishFloorPlanUpdatedRequest(
        @Size(max = 50, message = "revisionId must be 50 characters or less.")
        String revisionId,
        @NotNull(message = "floorPlanPayloadJson is required.")
        JsonNode floorPlanPayloadJson,
        @NotBlank(message = "s3Url is required.")
        @Size(max = 2048, message = "s3Url must be 2048 characters or less.")
        String s3Url
) {
}
