package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.dto.CreateProjectRequest;
import com.a204.batang.domain.project.dto.CreateProjectResponse;
import com.a204.batang.domain.project.dto.DeleteProjectsRequest;
import com.a204.batang.domain.project.dto.DeleteProjectsResponse;
import com.a204.batang.domain.project.dto.UpdateProjectRequest;
import com.a204.batang.domain.project.dto.UpdateProjectResponse;
import com.a204.batang.domain.project.dto.UpdateProjectThumbnailRequest;
import com.a204.batang.domain.project.dto.UpdateProjectThumbnailResponse;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * 프로젝트 생성, 수정, 삭제(소프트 삭제)를 처리하는 서비스다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectService {

    private static final int MAX_THUMBNAIL_URL_LENGTH = 1_000_000;
    private static final Set<String> SUPPORTED_THUMBNAIL_MODES = Set.of("bubble", "2d", "3d");

    private final ProjectRepository projectRepository;
    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final ProjectAccessService projectAccessService;

    /**
     * 새 프로젝트를 생성한다.
     *
     * @param request 프로젝트 생성 요청
     * @return 생성된 프로젝트 응답
     */
    @Transactional
    public CreateProjectResponse createProject(CreateProjectRequest request) {
        projectAccessService.validateDesignerOrThrow();
        UUID currentUserId = resolveCurrentUserIdOrThrow();

        String normalizedName = normalizeNameOrThrow(request.name());
        String normalizedDescription = normalizeDescription(request.description());

        Project project = Project.create(normalizedName, normalizedDescription, currentUserId);
        Project savedProject = projectRepository.save(project);
        projectWorkspaceRepository.save(ProjectWorkspace.create(savedProject));

        log.info("프로젝트 생성 완료. projectId={}", savedProject.getProjectId());
        return CreateProjectResponse.from(savedProject);
    }

    /**
     * 프로젝트 기본 정보(이름, 설명)를 수정한다.
     * 추후 인증 기능 추가 시 현재 사용자와 소유자 일치 여부를 검증한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 프로젝트 수정 요청
     * @return 수정된 프로젝트 응답
     */
    @Transactional
    public UpdateProjectResponse updateProject(UUID projectId, UpdateProjectRequest request) {
        projectAccessService.validateDesignerOrThrow();
        UUID currentUserId = resolveCurrentUserIdOrThrow();

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

        String normalizedName = normalizeNameOrThrow(request.name());
        String normalizedDescription = normalizeDescription(request.description());

        project.updateBasicInfo(normalizedName, normalizedDescription);
        // Auditing(@LastModifiedDate) 값 반영을 위해 flush 시점까지 동기화한다.
        Project savedProject = projectRepository.saveAndFlush(project);

        log.info("프로젝트 수정 완료. projectId={}", savedProject.getProjectId());
        return UpdateProjectResponse.from(savedProject);
    }

    /**
     * 프로젝트 카드 썸네일을 갱신한다.
     *
     * @param projectId 프로젝트 ID
     * @param request 썸네일 갱신 요청
     * @return 갱신된 썸네일 정보
     */
    @Transactional
    public UpdateProjectThumbnailResponse updateProjectThumbnail(UUID projectId, UpdateProjectThumbnailRequest request) {
        UUID currentUserId = resolveCurrentUserIdOrThrow();

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        projectAccessService.validateProjectPinWriterOrThrow(project, currentUserId);

        String thumbnailUrl = normalizeThumbnailUrlOrThrow(request.thumbnailUrl());
        String thumbnailMode = normalizeThumbnailModeOrThrow(request.thumbnailMode());

        projectRepository.updateThumbnailByProjectId(projectId, thumbnailUrl, thumbnailMode);

        log.info("프로젝트 썸네일 갱신 완료. projectId={}, mode={}", project.getProjectId(), thumbnailMode);
        return new UpdateProjectThumbnailResponse(
                project.getProjectId(),
                thumbnailUrl,
                thumbnailMode,
                project.getUpdatedAt()
        );
    }

    /**
     * 여러 프로젝트를 소프트 삭제한다.
     *
     * @param request 삭제 대상 프로젝트 ID 목록
     * @return 삭제 결과 응답
     */
    @Transactional
    public DeleteProjectsResponse deleteProjects(DeleteProjectsRequest request) {
        projectAccessService.validateDesignerOrThrow();
        UUID currentUserId = resolveCurrentUserIdOrThrow();
        List<UUID> targetProjectIds = normalizeProjectIds(request.projectIds());

        List<Project> projects = projectRepository.findByProjectIdInAndDeletedAtIsNull(targetProjectIds);
        validateDeleteTargetsOrThrow(targetProjectIds, projects);

        LocalDateTime deletedAt = LocalDateTime.now();
        for (Project project : projects) {
            projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);
            project.softDelete(deletedAt);
        }

        projectRepository.saveAll(projects);

        log.info("프로젝트 삭제 완료. deletedCount={}, projectIds={}", targetProjectIds.size(), targetProjectIds);
        return DeleteProjectsResponse.from(targetProjectIds);
    }

    /**
     * 설명 필드를 정규화한다.
     * null/blank는 null로 저장하고, 값이 있으면 trim 처리한다.
     *
     * @param description 원본 설명
     * @return 정규화된 설명
     */
    private String normalizeDescription(String description) {
        if (!StringUtils.hasText(description)) {
            return null;
        }
        return description.trim();
    }

    /**
     * 프로젝트 이름을 정규화하고 필수 여부를 검증한다.
     *
     * @param name 원본 이름
     * @return 정규화된 이름
     * @throws CustomException name이 null/blank인 경우
     */
    private String normalizeNameOrThrow(String name) {
        if (!StringUtils.hasText(name)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "name은 필수 입력값입니다.");
        }
        return name.trim();
    }

    private String normalizeThumbnailUrlOrThrow(String thumbnailUrl) {
        if (!StringUtils.hasText(thumbnailUrl)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "thumbnailUrl은 필수 입력값입니다.");
        }
        String normalized = thumbnailUrl.trim();
        if (normalized.length() > MAX_THUMBNAIL_URL_LENGTH) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "thumbnailUrl이 너무 큽니다.");
        }
        if (
                !normalized.startsWith("data:image/") &&
                !normalized.startsWith("http://") &&
                !normalized.startsWith("https://")
        ) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "thumbnailUrl은 표시 가능한 이미지 URL이어야 합니다.");
        }
        return normalized;
    }

    private String normalizeThumbnailModeOrThrow(String thumbnailMode) {
        if (!StringUtils.hasText(thumbnailMode)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "thumbnailMode는 필수 입력값입니다.");
        }
        String normalized = thumbnailMode.trim();
        if (!SUPPORTED_THUMBNAIL_MODES.contains(normalized)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST, "지원하지 않는 thumbnailMode입니다.");
        }
        return normalized;
    }

    /**
     * 프로젝트 ID 목록을 중복 제거한 순서 보장 목록으로 정규화한다.
     *
     * @param projectIds 원본 프로젝트 ID 목록
     * @return 중복 제거된 프로젝트 ID 목록
     */
    private List<UUID> normalizeProjectIds(List<UUID> projectIds) {
        return new ArrayList<>(new LinkedHashSet<>(projectIds));
    }

    /**
     * 삭제 대상 프로젝트가 모두 실제 조회되었는지 검증한다.
     *
     * @param targetProjectIds 삭제 요청 ID 목록
     * @param projects 실제 조회된 프로젝트 목록
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

    /**
     * 인증된 현재 사용자 ID를 조회한다.
     *
     * @return 현재 사용자 ID
     * @throws CustomException 인증 정보가 없는 경우
     */
    private UUID resolveCurrentUserIdOrThrow() {
        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        if (currentUserId == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "로그인이 필요합니다.");
        }
        return currentUserId;
    }
}
