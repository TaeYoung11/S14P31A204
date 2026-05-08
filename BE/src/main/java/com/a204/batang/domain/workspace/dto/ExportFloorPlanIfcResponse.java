package com.a204.batang.domain.workspace.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * IFC 파일 내보내기 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param revisionId 내보내기 기준 revision ID
 * @param ifcStorageUrl 저장된 IFC S3 경로
 * @param presignedUrl 브라우저 다운로드용 presigned URL
 * @param expiresAt presigned URL 만료 시각
 */
public record ExportFloorPlanIfcResponse(
        UUID projectId,
        String revisionId,
        String ifcStorageUrl,
        String presignedUrl,
        LocalDateTime expiresAt
) {
}
