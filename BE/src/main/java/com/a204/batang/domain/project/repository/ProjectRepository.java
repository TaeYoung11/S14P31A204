package com.a204.batang.domain.project.repository;

import com.a204.batang.domain.project.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * 프로젝트 영속성을 담당하는 Repository다.
 */
public interface ProjectRepository extends JpaRepository<Project, UUID> {
}

