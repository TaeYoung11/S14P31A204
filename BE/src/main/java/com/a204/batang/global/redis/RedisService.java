package com.a204.batang.global.redis;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class RedisService {

    private static final long EMAIL_CODE_TTL_MINUTES = 5L;

    private final RedisTemplate<String, String> redisTemplate;

    public void saveRefreshToken(String userId, String token, long ttlMs) {
        redisTemplate.opsForValue()
                .set("refresh:" + userId, token, ttlMs, TimeUnit.MILLISECONDS);
    }

    public String getRefreshToken(String userId) {
        return getStringValue("refresh:" + userId);
    }

    public void deleteRefreshToken(String userId) {
        redisTemplate.delete("refresh:" + userId);
    }

    public void addToBlacklist(String accessToken, long remainingMs) {
        redisTemplate.opsForValue()
                .set("blacklist:" + accessToken, "logout", remainingMs, TimeUnit.MILLISECONDS);
    }

    public boolean isBlacklisted(String accessToken) {
        return Boolean.TRUE.equals(redisTemplate.hasKey("blacklist:" + accessToken));
    }

    public void saveEmailCode(String email, String code) {
        redisTemplate.opsForValue()
                .set("email:code:" + email, code, EMAIL_CODE_TTL_MINUTES, TimeUnit.MINUTES);
        deleteEmailCodeAttempts(email);
    }

    public String getEmailCode(String email) {
        return getStringValue("email:code:" + email);
    }

    public void deleteEmailCode(String email) {
        redisTemplate.delete("email:code:" + email);
    }

    public long incrementEmailCodeAttempts(String email) {
        Long attempts = redisTemplate.opsForValue().increment("email:attempts:" + email);
        if (attempts != null && attempts == 1L) {
            redisTemplate.expire("email:attempts:" + email, EMAIL_CODE_TTL_MINUTES, TimeUnit.MINUTES);
        }
        return attempts == null ? 0L : attempts;
    }

    public void deleteEmailCodeAttempts(String email) {
        redisTemplate.delete("email:attempts:" + email);
    }

    public void saveVerifiedToken(String token, String email) {
        redisTemplate.opsForValue()
                .set("email:verified:" + token, email, 10, TimeUnit.MINUTES);
    }

    public String getVerifiedEmail(String token) {
        return getStringValue("email:verified:" + token);
    }

    public void deleteVerifiedToken(String token) {
        redisTemplate.delete("email:verified:" + token);
    }

    private String getStringValue(String key) {
        String value = redisTemplate.opsForValue().get(key);
        return value == null ? null : value.toString();
    }
}
