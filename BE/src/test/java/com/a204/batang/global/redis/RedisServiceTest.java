package com.a204.batang.global.redis;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RedisServiceTest {

    @Mock
    private RedisTemplate<String, String> redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @Test
    @DisplayName("문자열 토큰은 Object 템플릿에서도 문자열로 복원한다")
    void returnsStringValueFromObjectTemplate() {
        RedisService redisService = new RedisService(redisTemplate);
        given(redisTemplate.opsForValue()).willReturn(valueOperations);
        given(valueOperations.get("refresh:user-1")).willReturn("refreshToken");

        String refreshToken = redisService.getRefreshToken("user-1");

        assertThat(refreshToken).isEqualTo("refreshToken");
    }

    @Test
    @DisplayName("이메일 인증 시도 횟수 첫 증가 시 TTL을 설정한다")
    void incrementsAttemptsAndSetsExpiryOnFirstAttempt() {
        RedisService redisService = new RedisService(redisTemplate);
        given(redisTemplate.opsForValue()).willReturn(valueOperations);
        given(valueOperations.increment("email:attempts:test@test.com")).willReturn(1L);

        long attempts = redisService.incrementEmailCodeAttempts("test@test.com");

        assertThat(attempts).isEqualTo(1L);
        verify(redisTemplate).expire("email:attempts:test@test.com", 5L, TimeUnit.MINUTES);
    }

    @Test
    @DisplayName("이메일 인증번호 저장 시 시도 횟수 키를 초기화한다")
    void resetsAttemptsWhenSavingEmailCode() {
        RedisService redisService = new RedisService(redisTemplate);
        given(redisTemplate.opsForValue()).willReturn(valueOperations);

        redisService.saveEmailCode("test@test.com", "482910");

        verify(valueOperations).set("email:code:test@test.com", "482910", 5L, TimeUnit.MINUTES);
        verify(redisTemplate).delete("email:attempts:test@test.com");
    }
}
