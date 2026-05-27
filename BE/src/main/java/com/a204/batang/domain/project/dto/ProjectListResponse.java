package com.a204.batang.domain.project.dto;

import java.util.List;

/**
 * 프로젝트 목록 조회 응답 DTO.
 *
 * @param projects 프로젝트 목록
 * @param page 현재 페이지(1-base)
 * @param size 페이지 크기
 * @param totalElements 전체 개수
 * @param totalPages 전체 페이지 수
 * @param hasNext 다음 페이지 존재 여부
 */
public record ProjectListResponse(
        List<ProjectSummaryResponse> projects,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean hasNext
) {

    /**
     * 목록과 페이지 메타데이터로 응답 DTO를 생성한다.
     *
     * @param projects 프로젝트 목록
     * @param page 현재 페이지(1-base)
     * @param size 페이지 크기
     * @param totalElements 전체 개수
     * @param totalPages 전체 페이지 수
     * @param hasNext 다음 페이지 존재 여부
     * @return 프로젝트 목록 응답 DTO
     */
    public static ProjectListResponse of(
            List<ProjectSummaryResponse> projects,
            int page,
            int size,
            long totalElements,
            int totalPages,
            boolean hasNext
    ) {
        return new ProjectListResponse(
                List.copyOf(projects),
                page,
                size,
                totalElements,
                totalPages,
                hasNext
        );
    }
}
