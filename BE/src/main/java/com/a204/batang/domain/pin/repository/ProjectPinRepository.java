package com.a204.batang.domain.pin.repository;

import com.a204.batang.domain.pin.entity.ProjectPin;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * 프로젝트 핀 영속성 처리를 담당한다.
 */
public interface ProjectPinRepository extends JpaRepository<ProjectPin, UUID> {
}
