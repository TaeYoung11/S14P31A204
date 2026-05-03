package com.a204.batang.domain.revision.repository;

import com.a204.batang.domain.revision.entity.Revision;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RevisionRepository extends JpaRepository<Revision, UUID> {

    Optional<Revision> findByRevisionId(UUID revisionId);

    Optional<Revision> findTopByProjectIdOrderByRevisionNoDesc(UUID projectId);

    boolean existsByProjectIdAndRevisionNo(UUID projectId, Integer revisionNo);
}
