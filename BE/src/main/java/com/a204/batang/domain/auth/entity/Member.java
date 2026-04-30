package com.a204.batang.domain.auth.entity;

import com.a204.batang.global.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 회원 도메인 엔티티다.
 */
@Entity
@Getter
@Table(name = "users")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "email", nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "name", nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "user_type", nullable = false, length = 20)
    private UserType userType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private UserStatus status;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    private Member(
            String email,
            String passwordHash,
            String name,
            UserType userType
    ) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.name = name;
        this.userType = userType;
        this.status = UserStatus.ACTIVE;
    }

    /**
     * 새 회원을 생성한다.
     *
     * @param email 이메일
     * @param passwordHash 해시된 비밀번호
     * @param name 이름
     * @param userType 회원 유형
     * @return 생성된 회원 엔티티
     */
    public static Member create(
            String email,
            String passwordHash,
            String name,
            UserType userType
    ) {
        return new Member(email, passwordHash, name, userType);
    }

    /**
     * 마지막 로그인 시각을 현재 시각으로 갱신한다.
     */
    public void updateLastLoginAt() {
        this.lastLoginAt = LocalDateTime.now();
    }

    /**
     * 회원을 탈퇴 상태(소프트 삭제)로 변경한다.
     * 이메일 재사용을 막기 위해 이메일을 익명화한다.
     */
    public void deactivate() {
        this.status = UserStatus.WITHDRAWN;
        this.email = "deleted_" + this.userId + "_" + this.email;
    }
}
