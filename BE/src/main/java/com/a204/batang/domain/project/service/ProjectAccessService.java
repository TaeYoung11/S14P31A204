package com.a204.batang.domain.project.service;

import com.a204.batang.domain.auth.entity.UserType;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * 프로젝트 접근 권한/조회 범위와 관련된 공통 로직을 제공한다.
 */
@Service
@RequiredArgsConstructor
public class ProjectAccessService {

    private static final String ROLE_DESIGNER = "ROLE_" + UserType.DESIGNER;

    private final ProjectRepository projectRepository;

    /**
     * 현재 로그인 사용자 ID를 조회한다.
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
     * 프로젝트 소유자 권한을 검증한다.
     *
     * @param project 프로젝트
     * @param currentUserId 현재 사용자 ID
     */
    public void validateProjectOwnerOrThrow(Project project, UUID currentUserId) {
        if (project.getOwnerUserId() == null) {
            throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "소유자가 없는 프로젝트에는 접근할 수 없습니다.");
        }

        if (!Objects.equals(currentUserId, project.getOwnerUserId())) {
            throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "해당 프로젝트에 접근할 권한이 없습니다.");
        }
    }

    /**
     * 핀/댓글 작성 가능 권한을 검증한다.
     * 현재는 기존 구조를 유지하기 위해 no-op이며, 추후 멤버십/역할 모델 도입 시 구현한다.
     *
     * @param project 프로젝트
     * @param currentUserId 현재 사용자 ID
     */
    public void validateProjectPinWriterOrThrow(Project project, UUID currentUserId) {
        // TODO: 프로젝트 참여자 및 역할 기반 권한 검증을 추가한다.
    }

    /**
     * 프로젝트 멤버 사용자 ID 집합을 조회한다.
     * 현재는 owner 기반으로 반환하고, 추후 참여자 모델 도입 시 확장한다.
     *
     * @param project 프로젝트
     * @return 프로젝트 멤버 사용자 ID 집합
     */
    public Set<UUID> resolveProjectMemberUserIds(Project project) {
        if (project.getOwnerUserId() == null) {
            return Set.of();
        }

        return Set.of(project.getOwnerUserId());
    }

    /**
     * 현재 사용자 기준 프로젝트 목록을 조회한다.
     *
     * @param pageable 페이지 정보
     * @return 프로젝트 페이지
     */
    public Page<Project> fetchProjectsByCurrentUser(Pageable pageable) {
        UUID currentUserId = resolveCurrentUserId();
        if (currentUserId == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "로그인이 필요합니다.");
        }
        return projectRepository.findByDeletedAtIsNullAndOwnerUserId(currentUserId, pageable);
    }

    /**
     * 현재 사용자 기준 프로젝트 이름 검색을 수행한다.
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

        return projectRepository.searchByNameForOwner(currentUserId, keyword, threshold, pageable);
    }
}
