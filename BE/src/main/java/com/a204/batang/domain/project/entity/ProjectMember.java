package com.a204.batang.domain.project.entity;

import com.a204.batang.global.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;
import java.util.UUID;

/**
 * 프로젝트에 초대된 멤버를 관리하는 엔티티다.
 */
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(
        name = "project_members",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_project_members_project_user", columnNames = {"project_id", "user_id"})
        }
)
public class ProjectMember extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "project_member_id", nullable = false, updatable = false)
    private UUID projectMemberId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "member_role", nullable = false, length = 20)
    private ProjectMemberRole memberRole;

    private ProjectMember(Project project, UUID userId, ProjectMemberRole memberRole) {
        this.project = Objects.requireNonNull(project, "project must not be null");
        this.userId = Objects.requireNonNull(userId, "userId must not be null");
        this.memberRole = Objects.requireNonNull(memberRole, "memberRole must not be null");
    }

    /**
     * 프로젝트 멤버를 생성한다.
     *
     * @param project 프로젝트
     * @param userId 사용자 ID
     * @param memberRole 멤버 역할
     * @return 생성된 프로젝트 멤버
     */
    public static ProjectMember create(Project project, UUID userId, ProjectMemberRole memberRole) {
        return new ProjectMember(project, userId, memberRole);
    }
}
