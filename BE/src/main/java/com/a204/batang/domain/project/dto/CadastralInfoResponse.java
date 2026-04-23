package com.a204.batang.domain.project.dto;

/**
 * 대지 정보 응답 DTO.
 *
 * @param polygon 지적도 폴리곤 정보
 */
public record CadastralInfoResponse(
        CadastralPolygonResponse polygon
) {
}