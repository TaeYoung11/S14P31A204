package com.a204.batang.domain.pin.repository;

import com.a204.batang.domain.pin.entity.ProjectPinComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * 핀 댓글 영속성 처리를 담당한다.
 */
public interface ProjectPinCommentRepository extends JpaRepository<ProjectPinComment, UUID> {
}
