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
import java.util.UUID;

/**
 * 프로젝트 접근 제어(소유자 검증, 사용자 기준 조회 분기)를 담당한다.
 * 현재 인증 미구현 단계에서는 ownerUserId가 null인 프로젝트를 기본 접근 대상으로 본다.
 */
@Service
@RequiredArgsConstructor
public class ProjectAccessService {

    private final ProjectRepository projectRepository;

    /**
     * 현재 로그인 사용자 ID를 조회한다.
     * 현재 인증 미구현 단계에서는 null을 반환한다.
     *
     * @return 현재 사용자 ID(미인증 단계에서는 null)
     */
    public UUID resolveCurrentUserId() {
        // TODO: 인증/회원 기능 도입 시 SecurityContext 또는 @AuthenticationPrincipal 기반으로 사용자 ID를 조회한다.
        return null;
    }

    /**
     * 프로젝트 소유자 여부를 검증한다.
     * 현재 미인증 단계에서는 ownerUserId가 null인 프로젝트만 접근을 허용한다.
     *
     * @param project 검증 대상 프로젝트
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
     * 핀 작성 권한을 검증한다.
     * 요구사항상 건축가와 클라이언트 모두 작성 가능해야 하므로 owner 전용 제한을 적용하지 않는다.
     * 현재 인증/참여자 도메인 미구현 단계에서는 프로젝트 존재 검증만 통과하면 작성을 허용한다.
     *
     * @param project 프로젝트
     * @param currentUserId 현재 사용자 ID
     */
    public void validateProjectPinWriterOrThrow(Project project, UUID currentUserId) {
        // TODO: 참여자(건축가/클라이언트) 모델 도입 시
        // validateProjectParticipantOrThrow(project, currentUserId, allowedRoles)로 교체한다.
    }

    /**
     * 현재 사용자 기준으로 프로젝트 목록을 조회한다.
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
     * 현재 사용자 기준으로 프로젝트 이름 검색을 수행한다.
     *
     * @param keyword 검색어
     * @param threshold trigram 유사도 임계치
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
