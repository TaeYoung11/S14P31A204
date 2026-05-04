package com.a204.batang.global.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secretKey;

    private static final long ACCESS_EXPIRY  = 15 * 60 * 1000L;
    private static final long REFRESH_EXPIRY = 14 * 24 * 60 * 60 * 1000L;

    public String generateAccessToken(String userId, String email, String userType) {
        return Jwts.builder()
                .subject(userId)
                .claim("email", email)
                .claim("userType", userType)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + ACCESS_EXPIRY))
                .signWith(getSigningKey())
                .compact();
    }

    public String generateRefreshToken(String userId) {
        return Jwts.builder()
                .subject(userId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + REFRESH_EXPIRY))
                .signWith(getSigningKey())
                .compact();
    }

    /**
     * 토큰 서명과 만료를 검증하고 Claims를 반환한다.
     *
     * @param token JWT 토큰
     * @return Claims
     */
    public Claims validateAndGetClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * 블랙리스트 TTL 계산을 위해 토큰의 남은 만료 시간(ms)을 반환한다.
     *
     * @param token JWT 토큰
     * @return 남은 만료 시간(ms)
     */
    public long getRemainingExpiry(String token) {
        Date expiration = validateAndGetClaims(token).getExpiration();
        return expiration.getTime() - System.currentTimeMillis();
    }

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secretKey.getBytes(StandardCharsets.UTF_8));
    }
}
