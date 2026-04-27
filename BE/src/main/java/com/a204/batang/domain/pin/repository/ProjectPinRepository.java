package com.a204.batang.domain.pin.repository;

import com.a204.batang.domain.pin.entity.ProjectPin;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * 프로젝트 핀 영속성 처리를 담당한다.
 */
public interface ProjectPinRepository extends JpaRepository<ProjectPin, UUID> {

    /**
     * 프로젝트에 속한 활성 핀을 단건 조회한다.
     *
     * @param pinId 핀 ID
     * @param projectId 프로젝트 ID
     * @return 조회 결과
     */
    Optional<ProjectPin> findByPinIdAndProject_ProjectIdAndDeletedAtIsNull(UUID pinId, UUID projectId);
}
