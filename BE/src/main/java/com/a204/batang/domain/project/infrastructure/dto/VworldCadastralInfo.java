package com.a204.batang.domain.project.infrastructure.dto;

/**
 * VWorld 지적도 조회 결과를 담는 DTO다.
 *
 * @param pnu 필지 고유번호
 * @param address 주소
 * @param geometry geometry(wkt/json) 원문
 */
public record VworldCadastralInfo(
        String pnu,
        String address,
        String geometry
) {
}
