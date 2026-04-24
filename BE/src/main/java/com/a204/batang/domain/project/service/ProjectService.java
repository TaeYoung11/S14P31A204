package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.dto.CadastralPolygonResponse;
import com.a204.batang.domain.project.dto.CreateProjectRequest;
import com.a204.batang.domain.project.dto.CreateProjectResponse;
import com.a204.batang.domain.project.dto.DeleteProjectsRequest;
import com.a204.batang.domain.project.dto.DeleteProjectsResponse;
import com.a204.batang.domain.project.dto.ProjectListResponse;
import com.a204.batang.domain.project.dto.ProjectSiteResponse;
import com.a204.batang.domain.project.dto.ProjectSummaryResponse;
import com.a204.batang.domain.project.dto.RegisterProjectSiteRequest;
import com.a204.batang.domain.project.dto.UpdateProjectRequest;
import com.a204.batang.domain.project.dto.UpdateProjectResponse;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.infrastructure.VworldCadastralClient;
import com.a204.batang.domain.project.infrastructure.dto.VworldCadastralInfo;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * 프로젝트 생성, 수정, 목록 조회, 대지 정보 등록을 처리하는 서비스이다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ProjectService {

    private static final int PROJECT_PAGE_SIZE = 6;
    private static final double PROJECT_SEARCH_SIMILARITY_THRESHOLD = 0.2d;

    private final ProjectRepository projectRepository;
    private final VworldCadastralClient vworldCadastralClient;

    /**
     * 새 프로젝트를 생성한다.
     *
     * @param request 프로젝트 생성 요청
     * @return 생성된 프로젝트 응답
     */
    @Transactional
    public CreateProjectResponse createProject(CreateProjectRequest request) {
        String normalizedName = request.name().trim();
        String normalizedDescription = normalizeDescription(request.description());

        if (StringUtils.hasText(request.primaryClientId())) {
            log.info("primaryClientId 값은 현재 회원/권한 기능 전까지 저장하지 않습니다. primaryClientId={}",
                    request.primaryClientId());
        }

        Project project = Project.create(normalizedName, normalizedDescription);
        Project savedProject = projectRepository.save(project);

        log.info("프로젝트 생성 완료. projectId={}", savedProject.getProjectId());
        return CreateProjectResponse.from(savedProject);
    }

    /**
     * 프로젝트 이름/설명을 수정한다.
     * 삭제되지 않았고 현재 사용자가 소유한 프로젝트만 수정할 수 있다.
     * 회원 기능 미구현 상태에서는 ownerUserId가 null인 프로젝트만 수정할 수 있다.
     *
     * @param projectId 대상 프로젝트 ID
     * @param request 프로젝트 수정 요청
     * @return 수정된 프로젝트 응답
     */
    @Transactional
    public UpdateProjectResponse updateProject(UUID projectId, UpdateProjectRequest request) {
        UUID currentUserId = resolveCurrentUserId();

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        validateProjectOwnerOrThrow(project, currentUserId);

        String normalizedName = request.name().trim();
        String normalizedDescription = normalizeDescription(request.description());

        project.updateBasicInfo(normalizedName, normalizedDescription);
        // Auditing(@LastModifiedDate)은 flush 시점에 반영되므로 응답에 최신 updatedAt을 담기 위해 즉시 flush한다.
        Project savedProject = projectRepository.saveAndFlush(project);

        log.info("프로젝트 수정 완료. projectId={}", savedProject.getProjectId());
        return UpdateProjectResponse.from(savedProject);
    }

    /**
     * 로그인 사용자의 프로젝트 목록을 최신 수정일 순으로 조회한다.
     * 회원 기능이 없으므로 현재는 ownerUserId가 null인 프로젝트를 조회한다.
     *
     * @param page 1-base 페이지 번호
     * @return 프로젝트 목록 응답
     */
    /**
     * 프로젝트를 다건 삭제(soft delete)한다.
     *
     * @param request 프로젝트 삭제 요청
     * @return 프로젝트 다건 삭제 결과
     */
    @Transactional
    public DeleteProjectsResponse deleteProjects(DeleteProjectsRequest request) {
        UUID currentUserId = resolveCurrentUserId();
        List<UUID> targetProjectIds = normalizeProjectIds(request.projectIds());

        List<Project> projects = projectRepository.findByProjectIdInAndDeletedAtIsNull(targetProjectIds);
        validateDeleteTargetsOrThrow(targetProjectIds, projects);

        LocalDateTime deletedAt = LocalDateTime.now();
        for (Project project : projects) {
            validateProjectOwnerOrThrow(project, currentUserId);
            project.softDelete(deletedAt);
        }

        projectRepository.saveAll(projects);

        log.info("프로젝트 다건 삭제 완료. deletedCount={}, projectIds={}", targetProjectIds.size(), targetProjectIds);
        return DeleteProjectsResponse.from(targetProjectIds);
    }

    /**
     * 로그인 사용자의 프로젝트를 이름으로 검색한다.
     * pg_trgm 유사도와 부분일치 검색을 함께 사용해 오타를 일부 허용한다.
     *
     * @param keyword 검색어
     * @param page 1-base 페이지 번호
     * @return 프로젝트 목록 응답
     */
    @Transactional(readOnly = true)
    public ProjectListResponse searchMyProjects(String keyword, int page) {
        if (!StringUtils.hasText(keyword)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "keyword는 필수입니다.");
        }
        if (page < 1) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "page는 1 이상이어야 합니다.");
        }

        String normalizedKeyword = keyword.trim();
        UUID currentUserId = resolveCurrentUserId();
        Pageable pageable = PageRequest.of(page - 1, PROJECT_PAGE_SIZE);

        Page<Project> projectPage = searchProjectsByCurrentUser(currentUserId, normalizedKeyword, pageable);
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

    @Transactional(readOnly = true)
    public ProjectListResponse getMyProjects(int page) {
        if (page < 1) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "page는 1 이상이어야 합니다.");
        }

        Pageable pageable = PageRequest.of(
                page - 1,
                PROJECT_PAGE_SIZE,
                Sort.by(Sort.Direction.DESC, "updatedAt")
        );

        UUID currentUserId = resolveCurrentUserId();
        Page<Project> projectPage = fetchProjectsByCurrentUser(currentUserId, pageable);

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

    /**
     * 프로젝트의 대지 정보를 등록한다.
     *
     * @param projectId 대상 프로젝트 ID
     * @param request 대지 정보 등록 요청
     * @return 대지 정보 등록 응답
     */
    @Transactional
    public ProjectSiteResponse registerProjectSite(UUID projectId, RegisterProjectSiteRequest request) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        VworldCadastralInfo cadastralInfo = vworldCadastralClient.fetchByCoordinates(
                        request.latitude(),
                        request.longitude(),
                        null
                )
                .orElseThrow(() -> new CustomException(
                        ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED,
                        "대지정보 조회에 실패했습니다. VWorld apiKey/Referer 설정을 확인해주세요."
                ));

        validateCadastralInfoOrThrow(projectId, cadastralInfo);

        CadastralPolygonResponse polygon = CadastralPolygonResponse.fromRawGeometry(cadastralInfo.geometry());
        if (polygon == null) {
            log.warn("대지 geometry 변환 실패. projectId={}, pnu={}, address={}, geometryPreview={}",
                    projectId,
                    StringUtils.hasText(cadastralInfo.pnu()) ? cadastralInfo.pnu() : "(없음)",
                    StringUtils.hasText(cadastralInfo.address()) ? cadastralInfo.address() : "(없음)",
                    truncate(cadastralInfo.geometry(), 300));
            throw new CustomException(
                    ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED,
                    "대지 geometry 변환에 실패했습니다."
            );
        }

        project.applyCadastralInfo(
                cadastralInfo.pnu(),
                cadastralInfo.address(),
                polygon.coordinates()
        );

        Project savedProject = projectRepository.save(project);
        log.info("대지정보 등록 완료. projectId={}", savedProject.getProjectId());
        return ProjectSiteResponse.from(savedProject, polygon);
    }

    /**
     * 회원 기능 도입 전까지는 ownerUserId를 null로 취급한다.
     * 추후 @AuthenticationPrincipal 기반 사용자 ID로 교체할 예정이다.
     *
     * @return 현재 사용자 ID(미구현 시 null)
     */
    private UUID resolveCurrentUserId() {
        // TODO: 인증/인가 도입 후 SecurityContext 또는 @AuthenticationPrincipal 기반으로 사용자 ID 주입
        return null;
    }

    /**
     * 현재 사용자 기준의 삭제되지 않은 프로젝트를 조회한다.
     * 회원 기능 미구현 시에는 ownerUserId가 null인 데이터로 조회한다.
     *
     * @param currentUserId 현재 사용자 ID
     * @param pageable 페이지/정렬 정보
     * @return 프로젝트 페이지
     */
    private Page<Project> fetchProjectsByCurrentUser(UUID currentUserId, Pageable pageable) {
        if (currentUserId == null) {
            return projectRepository.findByDeletedAtIsNullAndOwnerUserIdIsNull(pageable);
        }
        return projectRepository.findByDeletedAtIsNullAndOwnerUserId(currentUserId, pageable);
    }

    /**
     * 현재 사용자 기준으로 프로젝트 이름 유사 검색을 수행한다.
     *
     * @param currentUserId 현재 사용자 ID
     * @param keyword 검색어
     * @param pageable 페이지 정보
     * @return 검색 결과 페이지
     */
    private Page<Project> searchProjectsByCurrentUser(UUID currentUserId, String keyword, Pageable pageable) {
        if (currentUserId == null) {
            return projectRepository.searchByNameForAnonymous(
                    keyword,
                    PROJECT_SEARCH_SIMILARITY_THRESHOLD,
                    pageable
            );
        }

        return projectRepository.searchByNameForOwner(
                currentUserId,
                keyword,
                PROJECT_SEARCH_SIMILARITY_THRESHOLD,
                pageable
        );
    }

    /**
     * 프로젝트 수정 권한을 검증한다.
     *
     * @param project 수정 대상 프로젝트
     * @param currentUserId 현재 사용자 ID
     */
    private void validateProjectOwnerOrThrow(Project project, UUID currentUserId) {
        if (currentUserId == null) {
            if (project.getOwnerUserId() != null) {
                throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "본인이 생성한 프로젝트만 수정할 수 있습니다.");
            }
            return;
        }

        if (!Objects.equals(currentUserId, project.getOwnerUserId())) {
            throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "본인이 생성한 프로젝트만 수정할 수 있습니다.");
        }
    }

    /**
     * VWorld 응답의 필수값 누락 여부를 검증한다.
     *
     * @param projectId 프로젝트 ID
     * @param cadastralInfo VWorld 응답 데이터
     */
    private void validateCadastralInfoOrThrow(UUID projectId, VworldCadastralInfo cadastralInfo) {
        if (!StringUtils.hasText(cadastralInfo.geometry())) {
            log.warn("VWorld 응답 geometry 누락. projectId={}, pnu={}, address={}",
                    projectId,
                    StringUtils.hasText(cadastralInfo.pnu()) ? cadastralInfo.pnu() : "(없음)",
                    StringUtils.hasText(cadastralInfo.address()) ? cadastralInfo.address() : "(없음)");
            throw new CustomException(ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED, "VWorld 응답에 geometry 값이 없습니다.");
        }

        if (!StringUtils.hasText(cadastralInfo.pnu()) && !StringUtils.hasText(cadastralInfo.address())) {
            log.warn("VWorld 응답 pnu/address 누락. projectId={}, geometryPreview={}",
                    projectId,
                    truncate(cadastralInfo.geometry(), 200));
            throw new CustomException(ErrorCode.PROJECT_SITE_INFO_FETCH_FAILED, "VWorld 응답에 지번 정보(pnu/address)가 없습니다.");
        }
    }

    /**
     * description 값을 null 또는 trim된 값으로 정규화한다.
     *
     * @param description 원본 description
     * @return 값이 없으면 null, 값이 있으면 trim 결과
     */
    private String normalizeDescription(String description) {
        if (!StringUtils.hasText(description)) {
            return null;
        }
        return description.trim();
    }

    /**
     * 삭제 대상 프로젝트 ID 목록을 중복 제거 후 반환한다.
     *
     * @param projectIds 프로젝트 ID 목록
     * @return 중복 제거된 프로젝트 ID 목록
     */
    private List<UUID> normalizeProjectIds(List<UUID> projectIds) {
        return new ArrayList<>(new LinkedHashSet<>(projectIds));
    }

    /**
     * 삭제 대상 프로젝트 존재 여부를 검증한다.
     *
     * @param targetProjectIds 삭제 대상 프로젝트 ID 목록
     * @param projects 조회된 프로젝트 목록
     */
    private void validateDeleteTargetsOrThrow(List<UUID> targetProjectIds, List<Project> projects) {
        if (projects.size() == targetProjectIds.size()) {
            return;
        }

        Set<UUID> foundProjectIds = projects.stream()
                .map(Project::getProjectId)
                .collect(LinkedHashSet::new, Set::add, Set::addAll);

        List<UUID> missingProjectIds = targetProjectIds.stream()
                .filter(projectId -> !foundProjectIds.contains(projectId))
                .toList();

        throw new CustomException(
                ErrorCode.PROJECT_DELETE_TARGET_NOT_FOUND,
                "삭제 대상 프로젝트를 찾을 수 없습니다. missingProjectIds=" + missingProjectIds
        );
    }

    private String truncate(String value, int maxLength) {
        if (!StringUtils.hasText(value) || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
    }
}
