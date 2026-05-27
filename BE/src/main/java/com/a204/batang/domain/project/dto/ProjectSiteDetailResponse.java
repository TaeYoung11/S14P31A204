package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.project.entity.Project;

import java.util.List;

/**
 * 프로젝트에 저장된 대지 정보를 표현한다.
 *
 * @param pnu 대지 PNU
 * @param address 대지 주소
 * @param polygon 대지 폴리곤(MultiPolygon)
 */
public record ProjectSiteDetailResponse(
        String pnu,
        String address,
        CadastralPolygonResponse polygon
) {

    /**
     * 프로젝트 엔티티를 대지 정보 응답 DTO로 변환한다.
     *
     * @param project 프로젝트 엔티티
     * @return 대지 정보 응답 DTO
     */
    public static ProjectSiteDetailResponse from(Project project) {
        return new ProjectSiteDetailResponse(
                project.getCadastralPnu(),
                project.getCadastralAddress(),
                toPolygon(project.getCadastralGeometry())
        );
    }

    private static CadastralPolygonResponse toPolygon(List<List<List<List<Double>>>> geometry) {
        if (geometry == null || geometry.isEmpty()) {
            return null;
        }

        return new CadastralPolygonResponse("MultiPolygon", geometry);
    }
}
