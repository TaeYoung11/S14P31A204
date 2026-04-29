package com.a204.batang.domain.project.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    private final ProjectRepository projectRepository;

    /**
     * 현재 로그인 사용자 ID를 조회한다.
     *
     * @return 현재 사용자 ID, 인증 미구현 상태에서는 null
     */
    public UUID resolveCurrentUserId() {
        // TODO: 인증 연동 후 SecurityContext 또는 @AuthenticationPrincipal 기반으로 사용자 ID를 반환한다.
        return null;
    }

    /**
     * 프로젝트 소유자 권한을 검증한다.
     *
     * @param project 프로젝트
     * @param currentUserId 현재 사용자 ID
     */
    public void validateProjectOwnerOrThrow(Project project, UUID currentUserId) {
        if (currentUserId == null) {
            if (project.getOwnerUserId() != null) {
                throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "해당 프로젝트에 접근할 권한이 없습니다.");
            }
            return;
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
     * 현재는 owner 기반으로 반환하며, 추후 참여자 모델 도입 시 확장한다.
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
            return projectRepository.findByDeletedAtIsNullAndOwnerUserIdIsNull(pageable);
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
            return projectRepository.searchByNameForAnonymous(keyword, threshold, pageable);
        }

        return projectRepository.searchByNameForOwner(currentUserId, keyword, threshold, pageable);
    }
}
