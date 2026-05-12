package com.a204.batang.domain.project.repository;

import com.a204.batang.domain.project.entity.ProjectMember;
import com.a204.batang.domain.project.entity.ProjectMemberRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트 멤버 영속 처리를 담당하는 Repository다.
 */
public interface ProjectMemberRepository extends JpaRepository<ProjectMember, UUID> {

    /**
     * 프로젝트에 특정 사용자가 멤버로 등록되어 있는지 확인한다.
     *
     * @param projectId 프로젝트 ID
     * @param userId 사용자 ID
     * @return 등록 여부
     */
    boolean existsByProjectProjectIdAndUserId(UUID projectId, UUID userId);

    /**
     * 프로젝트에 특정 사용자가 특정 역할로 등록되어 있는지 확인한다.
     *
     * @param projectId 프로젝트 ID
     * @param userId 사용자 ID
     * @param memberRole 멤버 역할
     * @return 등록 여부
     */
    boolean existsByProjectProjectIdAndUserIdAndMemberRole(
            UUID projectId,
            UUID userId,
            ProjectMemberRole memberRole
    );

    /**
     * 프로젝트 멤버 사용자 ID 목록을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return 멤버 사용자 ID 목록
     */
    @Query("""
            SELECT pm.userId
            FROM ProjectMember pm
            WHERE pm.project.projectId = :projectId
            """)
    List<UUID> findUserIdsByProjectId(@Param("projectId") UUID projectId);
}
