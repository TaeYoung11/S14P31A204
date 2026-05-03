package com.a204.batang.domain.project.entity;

import com.a204.batang.global.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * 프로젝트 도메인 엔티티.
 */
@Entity
@Getter
@Table(name = "projects")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Project extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    /**
     * 회원/인증 기능 미구현으로 현재 null 허용.
     */
    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    @Column(name = "latest_revision_id")
    private UUID latestRevisionId;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "cadastral_pnu", length = 32)
    private String cadastralPnu;

    @Column(name = "cadastral_address", length = 255)
    private String cadastralAddress;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cadastral_geometry", columnDefinition = "jsonb")
    private List<List<List<List<Double>>>> cadastralGeometry;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private Project(String name, String description, UUID ownerUserId) {
        this.name = name;
        this.description = description;
        this.ownerUserId = ownerUserId;
    }

    /**
     * 프로젝트를 생성한다.
     *
     * @param name 프로젝트 이름
     * @param description 프로젝트 설명
     * @return 생성된 프로젝트 엔티티
     */
    public static Project create(String name, String description) {
        return new Project(name, description, null);
    }

    /**
     * 소유자와 함께 프로젝트를 생성한다.
     *
     * @param name 프로젝트 이름
     * @param description 프로젝트 설명
     * @param ownerUserId 프로젝트 소유자 사용자 ID
     * @return 생성된 프로젝트 엔티티
     */
    public static Project create(String name, String description, UUID ownerUserId) {
        Objects.requireNonNull(ownerUserId, "ownerUserId must not be null");
        return new Project(name, description, ownerUserId);
    }

    /**
     * 프로젝트 기본 정보(이름, 설명)를 수정한다.
     *
     * @param name 프로젝트 이름
     * @param description 프로젝트 설명
     */
    public void updateBasicInfo(String name, String description) {
        this.name = name;
        this.description = description;
    }

    /**
     * VWorld에서 조회한 지적도 정보를 프로젝트에 반영한다.
     *
     * @param pnu 필지 고유번호
     * @param address 지번 주소
     * @param geometry 지적도 좌표(MultiPolygon)
     */
    public void applyCadastralInfo(String pnu, String address, List<List<List<List<Double>>>> geometry) {
        this.cadastralPnu = pnu;
        this.cadastralAddress = address;
        this.cadastralGeometry = geometry;
    }

    /**
     * 프로젝트를 삭제 상태(소프트 삭제)로 변경한다.
     *
     * @param deletedAt 삭제 시각
     */
    public void softDelete(LocalDateTime deletedAt) {
        this.deletedAt = deletedAt;
    }

    /**
     * 프로젝트의 최신 revision ID를 갱신한다.
     *
     * @param revisionId 최신 revision ID
     */
    public void updateLatestRevisionId(UUID revisionId) {
        this.latestRevisionId = Objects.requireNonNull(revisionId, "revisionId must not be null");
    }
}
