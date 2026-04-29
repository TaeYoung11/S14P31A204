package com.a204.batang.domain.workspace.repository;

import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * 프로젝트 워크스페이스 영속성 처리를 담당한다.
 */
public interface ProjectWorkspaceRepository extends JpaRepository<ProjectWorkspace, UUID> {

    /**
     * 삭제되지 않은 프로젝트의 워크스페이스를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return 워크스페이스 조회 결과
     */
    Optional<ProjectWorkspace> findByProjectIdAndProject_DeletedAtIsNull(UUID projectId);
}
