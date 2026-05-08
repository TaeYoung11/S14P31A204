package com.a204.batang.domain.ifcedit.repository;

import com.a204.batang.domain.ifcedit.entity.RevisionSceneState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RevisionSceneStateRepository extends JpaRepository<RevisionSceneState, UUID> {

    List<RevisionSceneState> findByRevisionId(UUID revisionId);
}
