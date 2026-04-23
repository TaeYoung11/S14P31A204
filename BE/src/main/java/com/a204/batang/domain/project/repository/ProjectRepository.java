package com.a204.batang.domain.project.repository;

import com.a204.batang.domain.project.entity.Project;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * 프로젝트 영속성 처리를 담당하는 Repository이다.
 */
public interface ProjectRepository extends JpaRepository<Project, UUID> {

    /**
     * 삭제되지 않은 프로젝트 중 ownerUserId가 null인 프로젝트를 페이지로 조회한다.
     * 회원 기능 미구현 상태에서 임시로 사용한다.
     *
     * @param pageable 페이지/정렬 정보
     * @return 프로젝트 페이지
     */
    Page<Project> findByDeletedAtIsNullAndOwnerUserIdIsNull(Pageable pageable);

    /**
     * 삭제되지 않은 프로젝트 중 특정 사용자의 프로젝트를 페이지로 조회한다.
     *
     * @param ownerUserId 사용자 ID
     * @param pageable 페이지/정렬 정보
     * @return 프로젝트 페이지
     */
    Page<Project> findByDeletedAtIsNullAndOwnerUserId(UUID ownerUserId, Pageable pageable);
}