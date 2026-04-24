package com.a204.batang.domain.project.repository;

import com.a204.batang.domain.project.entity.Project;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
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

    /**
     * 삭제되지 않은 프로젝트를 단건 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return 프로젝트 Optional
     */
    Optional<Project> findByProjectIdAndDeletedAtIsNull(UUID projectId);

    /**
     * 삭제되지 않은 프로젝트 중 전달한 ID 목록에 해당하는 프로젝트를 조회한다.
     *
     * @param projectIds 프로젝트 ID 목록
     * @return 프로젝트 목록
     */
    List<Project> findByProjectIdInAndDeletedAtIsNull(List<UUID> projectIds);

    /**
     * ownerUserId가 null인(인증 미구현 fallback) 프로젝트에서 이름 유사 검색을 수행한다.
     *
     * @param keyword 검색어
     * @param threshold 유사도 임계치
     * @param pageable 페이지 정보
     * @return 프로젝트 페이지
     */
    @Query(
            value = """
                    SELECT p.*
                    FROM projects p
                    WHERE p.deleted_at IS NULL
                      AND p.owner_user_id IS NULL
                      AND (
                          LOWER(p.name) LIKE CONCAT('%', LOWER(:keyword), '%')
                          OR similarity(LOWER(p.name), LOWER(:keyword)) >= :threshold
                          OR LOWER(p.name) % LOWER(:keyword)
                      )
                    ORDER BY similarity(LOWER(p.name), LOWER(:keyword)) DESC, p.updated_at DESC
                    """,
            countQuery = """
                    SELECT COUNT(*)
                    FROM projects p
                    WHERE p.deleted_at IS NULL
                      AND p.owner_user_id IS NULL
                      AND (
                          LOWER(p.name) LIKE CONCAT('%', LOWER(:keyword), '%')
                          OR similarity(LOWER(p.name), LOWER(:keyword)) >= :threshold
                          OR LOWER(p.name) % LOWER(:keyword)
                      )
                    """,
            nativeQuery = true
    )
    Page<Project> searchByNameForAnonymous(
            @Param("keyword") String keyword,
            @Param("threshold") double threshold,
            Pageable pageable
    );

    /**
     * 특정 ownerUserId의 프로젝트에서 이름 유사 검색을 수행한다.
     *
     * @param ownerUserId 사용자 ID
     * @param keyword 검색어
     * @param threshold 유사도 임계치
     * @param pageable 페이지 정보
     * @return 프로젝트 페이지
     */
    @Query(
            value = """
                    SELECT p.*
                    FROM projects p
                    WHERE p.deleted_at IS NULL
                      AND p.owner_user_id = :ownerUserId
                      AND (
                          LOWER(p.name) LIKE CONCAT('%', LOWER(:keyword), '%')
                          OR similarity(LOWER(p.name), LOWER(:keyword)) >= :threshold
                          OR LOWER(p.name) % LOWER(:keyword)
                      )
                    ORDER BY similarity(LOWER(p.name), LOWER(:keyword)) DESC, p.updated_at DESC
                    """,
            countQuery = """
                    SELECT COUNT(*)
                    FROM projects p
                    WHERE p.deleted_at IS NULL
                      AND p.owner_user_id = :ownerUserId
                      AND (
                          LOWER(p.name) LIKE CONCAT('%', LOWER(:keyword), '%')
                          OR similarity(LOWER(p.name), LOWER(:keyword)) >= :threshold
                          OR LOWER(p.name) % LOWER(:keyword)
                      )
                    """,
            nativeQuery = true
    )
    Page<Project> searchByNameForOwner(
            @Param("ownerUserId") UUID ownerUserId,
            @Param("keyword") String keyword,
            @Param("threshold") double threshold,
            Pageable pageable
    );
}
