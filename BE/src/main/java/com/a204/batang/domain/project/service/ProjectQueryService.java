package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.dto.ProjectListResponse;
import com.a204.batang.domain.project.dto.ProjectSummaryResponse;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 프로젝트 목록/검색 조회를 담당하는 서비스다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProjectQueryService {

    private static final int PROJECT_PAGE_SIZE = 6;
    private static final double PROJECT_SEARCH_SIMILARITY_THRESHOLD = 0.2d;

    private final ProjectAccessService projectAccessService;

    /**
     * 내 프로젝트 목록을 최신 수정일 기준으로 조회한다.
     *
     * @param page 1-base 페이지 번호
     * @return 프로젝트 목록 응답
     */
    public ProjectListResponse getMyProjects(int page) {
        validatePageOrThrow(page);

        Pageable pageable = PageRequest.of(
                page - 1,
                PROJECT_PAGE_SIZE,
                Sort.by(Sort.Direction.DESC, "updatedAt")
        );

        Page<Project> projectPage = projectAccessService.fetchProjectsByCurrentUser(pageable);
        return toProjectListResponse(projectPage, page);
    }

    /**
     * 내 프로젝트를 이름 기준으로 검색한다.
     * pg_trgm 기반 유사도 검색을 함께 수행해 오타를 일부 허용한다.
     *
     * @param keyword 검색어
     * @param page 1-base 페이지 번호
     * @return 검색 결과 응답
     */
    public ProjectListResponse searchMyProjects(String keyword, int page) {
        if (!StringUtils.hasText(keyword)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "keyword는 필수 입력값입니다.");
        }
        validatePageOrThrow(page);

        String normalizedKeyword = keyword.trim();
        Pageable pageable = PageRequest.of(page - 1, PROJECT_PAGE_SIZE);

        Page<Project> projectPage = projectAccessService.searchProjectsByCurrentUser(
                normalizedKeyword,
                PROJECT_SEARCH_SIMILARITY_THRESHOLD,
                pageable
        );
        return toProjectListResponse(projectPage, page);
    }

    private void validatePageOrThrow(int page) {
        if (page < 1) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "page는 1 이상이어야 합니다.");
        }
    }

    private ProjectListResponse toProjectListResponse(Page<Project> projectPage, int page) {
        List<ProjectSummaryResponse> projects = projectPage.getContent()
                .stream()
                .map(ProjectSummaryResponse::from)
                .toList();

        return ProjectListResponse.of(
                projects,
                page,
                PROJECT_PAGE_SIZE,
                projectPage.getTotalElements(),
                projectPage.getTotalPages(),
                projectPage.hasNext()
        );
    }
}
