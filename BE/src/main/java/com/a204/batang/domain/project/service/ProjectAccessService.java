package com.a204.batang.domain.project.service;

import com.a204.batang.domain.auth.entity.UserType;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectMemberRepository;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * 프로젝트 접근 권한/조회 범위를 관리하는 공통 서비스다.
 */
@Service
@RequiredArgsConstructor
public class ProjectAccessService {

    private static final String ROLE_DESIGNER = "ROLE_" + UserType.DESIGNER;

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;

    /**
     * 현재 로그인한 사용자 ID를 조회한다.
     * 인증 정보가 없으면 null을 반환한다.
     *
     * @return 현재 사용자 ID, 인증 정보가 없으면 null
     */
    public UUID resolveCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }

        Object principal = authentication.getPrincipal();
        if (principal instanceof UUID userId) {
            return userId;
        }

        if (principal instanceof String userIdString) {
            if ("anonymousUser".equalsIgnoreCase(userIdString)) {
                return null;
            }

            try {
                return UUID.fromString(userIdString);
            } catch (IllegalArgumentException ignored) {
                return null;
            }
        }

        return null;
    }

    /**
     * 현재 로그인한 사용자 ID를 조회하고, 없으면 인증 예외를 발생시킨다.
     *
     * @return 현재 사용자 ID
     */
    public UUID resolveCurrentUserIdOrThrow() {
        UUID currentUserId = resolveCurrentUserId();
        if (currentUserId == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "로그인이 필요합니다.");
        }
        return currentUserId;
    }

    /**
     * 현재 사용자가 건축가(DESIGNER)인지 검증한다.
     */
    public void validateDesignerOrThrow() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || "anonymousUser".equalsIgnoreCase(String.valueOf(authentication.getPrincipal()))) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "로그인이 필요합니다.");
        }

        boolean isDesigner = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .anyMatch(ROLE_DESIGNER::equals);

        if (!isDesigner) {
            throw new CustomException(
                    ErrorCode.FORBIDDEN_ACCESS,
                    "건축가 사용자만 프로젝트를 생성, 수정, 삭제할 수 있습니다."
            );
        }
    }

    /**
     * 프로젝트 소유자 권한인지 검증한다.
     *
     * @param project 프로젝트
     * @param currentUserId 현재 사용자 ID
     */
    public void validateProjectOwnerOrThrow(Project project, UUID currentUserId) {
        if (project.getOwnerUserId() == null) {
            throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "소유자가 없는 프로젝트에는 접근할 수 없습니다.");
        }

        if (!Objects.equals(currentUserId, project.getOwnerUserId())) {
            throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "해당 프로젝트 접근 권한이 없습니다.");
        }
    }

    /**
     * 핀/댓글 작성 가능한 프로젝트 멤버(소유자 또는 초대 멤버)인지 검증한다.
     *
     * @param project 프로젝트
     * @param currentUserId 현재 사용자 ID
     */
    public void validateProjectPinWriterOrThrow(Project project, UUID currentUserId) {
        if (currentUserId == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "로그인이 필요합니다.");
        }

        if (Objects.equals(project.getOwnerUserId(), currentUserId)) {
            return;
        }

        UUID projectId = project.getProjectId();
        if (projectId == null) {
            throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "해당 프로젝트 접근 권한이 없습니다.");
        }

        boolean isInvitedMember = projectMemberRepository.existsByProjectProjectIdAndUserId(projectId, currentUserId);
        if (!isInvitedMember) {
            throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "해당 프로젝트 접근 권한이 없습니다.");
        }
    }

    /**
     * 프로젝트 ID 기준으로 핀/댓글 작성 가능한 멤버인지 검증한다.
     * STOMP 통신처럼 projectId만 전달되는 진입점에서 사용한다.
     *
     * @param projectId 프로젝트 ID
     * @param currentUserId 현재 사용자 ID
     */
    public void validateProjectPinWriterOrThrow(UUID projectId, UUID currentUserId) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        validateProjectPinWriterOrThrow(project, currentUserId);
    }

    /**
     * 프로젝트 멤버 사용자 ID 집합(소유자 + 초대 멤버)을 조회한다.
     *
     * @param project 프로젝트
     * @return 프로젝트 멤버 사용자 ID 집합
     */
    public Set<UUID> resolveProjectMemberUserIds(Project project) {
        Set<UUID> memberUserIds = new HashSet<>();
        if (project.getOwnerUserId() != null) {
            memberUserIds.add(project.getOwnerUserId());
        }

        UUID projectId = project.getProjectId();
        if (projectId == null) {
            return Set.copyOf(memberUserIds);
        }

        memberUserIds.addAll(projectMemberRepository.findUserIdsByProjectId(projectId));
        return Set.copyOf(memberUserIds);
    }

    /**
     * 현재 사용자 기준 접근 가능한 프로젝트 목록(소유 + 멤버)을 조회한다.
     *
     * @param pageable 페이지 정보
     * @return 프로젝트 페이지
     */
    public Page<Project> fetchProjectsByCurrentUser(Pageable pageable) {
        UUID currentUserId = resolveCurrentUserId();
        if (currentUserId == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "로그인이 필요합니다.");
        }
        return projectRepository.findAccessibleProjectsByUserId(currentUserId, pageable);
    }

    /**
     * 현재 사용자 기준 접근 가능한 프로젝트에서 이름 검색을 수행한다.
     *
     * @param keyword 검색어
     * @param threshold trigram 유사도 임계값
     * @param pageable 페이지 정보
     * @return 검색 결과 페이지
     */
    public Page<Project> searchProjectsByCurrentUser(String keyword, double threshold, Pageable pageable) {
        UUID currentUserId = resolveCurrentUserId();
        if (currentUserId == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "로그인이 필요합니다.");
        }

        return projectRepository.searchAccessibleProjectsByUserId(currentUserId, keyword, threshold, pageable);
    }
}