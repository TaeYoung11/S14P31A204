package com.a204.batang.domain.project.dto;

/**
 * 대지정보 응답 DTO.
 *
 * @param polygon 지적도 다각형 정보
 */
public record CadastralInfoResponse(
        CadastralPolygonResponse polygon
) {
}
