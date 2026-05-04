package com.a204.batang.domain.ifcedit.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Getter
@Table(name = "revision_scene_states")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RevisionSceneState {

    @Id
    @Column(name = "scene_state_id", nullable = false, updatable = false)
    private UUID sceneStateId;

    @Column(name = "revision_id", nullable = false)
    private UUID revisionId;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "scene_type", nullable = false, length = 50)
    private String sceneType;

    @Column(name = "storage_url", nullable = false, length = 2048)
    private String storageUrl;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public static RevisionSceneState createIfcModel(
            UUID sceneStateId,
            UUID revisionId,
            UUID projectId,
            String storageUrl,
            LocalDateTime now
    ) {
        RevisionSceneState state = new RevisionSceneState();
        state.sceneStateId = sceneStateId;
        state.revisionId = revisionId;
        state.projectId = projectId;
        state.sceneType = "IFC_MODEL";
        state.storageUrl = storageUrl;
        state.createdAt = now;
        return state;
    }
}
