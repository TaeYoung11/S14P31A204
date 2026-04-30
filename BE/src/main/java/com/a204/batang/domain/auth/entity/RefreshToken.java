package com.a204.batang.domain.auth.entity;

import com.a204.batang.global.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Refresh Token 도메인 엔티티다.
 */
@Entity
@Getter
@Table(name = "refresh_tokens")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "refresh_token_id", nullable = false, updatable = false)
    private UUID refreshTokenId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private Member member;

    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "device_name")
    private String deviceName;

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    private RefreshToken(
            Member member,
            String tokenHash,
            String deviceName,
            String ipAddress,
            LocalDateTime expiresAt
    ) {
        this.member = member;
        this.tokenHash = tokenHash;
        this.deviceName = deviceName;
        this.ipAddress = ipAddress;
        this.expiresAt = expiresAt;
    }

    /**
     * 새 Refresh Token 엔티티를 생성한다.
     *
     * @param member 토큰 소유 회원
     * @param tokenHash 해시된 토큰 값
     * @param deviceName 기기 이름
     * @param ipAddress IP 주소
     * @param expiresAt 만료 시각
     * @return 생성된 RefreshToken 엔티티
     */
    public static RefreshToken create(
            Member member,
            String tokenHash,
            String deviceName,
            String ipAddress,
            LocalDateTime expiresAt
    ) {
        return new RefreshToken(member, tokenHash, deviceName, ipAddress, expiresAt);
    }

    /**
     * 토큰을 폐기 상태로 변경한다.
     */
    public void revoke() {
        this.revokedAt = LocalDateTime.now();
    }

    public boolean isRevoked() {
        return this.revokedAt != null;
    }

    public boolean isExpired() {
        return LocalDateTime.now().isAfter(this.expiresAt);
    }
}
