package com.a204.batang.global.jwt;

import com.a204.batang.global.redis.RedisService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

@ExtendWith(MockitoExtension.class)
class JwtAuthFilterTest {

    @Mock
    private JwtUtil jwtUtil;

    @Mock
    private RedisService redisService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("블랙리스트 토큰이면 401 JSON 응답을 반환한다")
    void returnsJsonUnauthorizedWhenTokenIsBlacklisted() throws Exception {
        JwtAuthFilter filter = new JwtAuthFilter(jwtUtil, redisService, objectMapper);
        MockHttpServletRequest request = bearerRequest("accessToken");
        MockHttpServletResponse response = new MockHttpServletResponse();

        given(redisService.isBlacklisted("accessToken")).willReturn(true);

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString()).contains("\"code\":\"COMMON_UNAUTHORIZED\"");
        assertThat(response.getContentAsString()).contains("\"message\"");
    }

    @Test
    @DisplayName("만료된 토큰이면 401 JSON 응답을 반환한다")
    void returnsJsonUnauthorizedWhenTokenIsExpired() throws Exception {
        JwtAuthFilter filter = new JwtAuthFilter(jwtUtil, redisService, objectMapper);
        MockHttpServletRequest request = bearerRequest("expiredToken");
        MockHttpServletResponse response = new MockHttpServletResponse();

        given(redisService.isBlacklisted("expiredToken")).willReturn(false);
        given(jwtUtil.validateAndGetClaims("expiredToken")).willThrow(expiredJwtException());

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString()).contains("\"code\":\"COMMON_UNAUTHORIZED\"");
        assertThat(response.getContentAsString()).contains("\"message\"");
    }

    @Test
    @DisplayName("유효한 토큰이면 SecurityContext를 설정하고 다음 필터로 진행한다")
    void authenticatesAndContinuesWhenTokenIsValid() throws Exception {
        JwtAuthFilter filter = new JwtAuthFilter(jwtUtil, redisService, objectMapper);
        MockHttpServletRequest request = bearerRequest("validToken");
        MockHttpServletResponse response = new MockHttpServletResponse();
        String userId = UUID.randomUUID().toString();

        Claims claims = Jwts.claims().subject(userId).add("userType", "DESIGNER").build();
        given(redisService.isBlacklisted("validToken")).willReturn(false);
        given(jwtUtil.validateAndGetClaims("validToken")).willReturn(claims);

        filter.doFilter(request, response, new MockFilterChain());

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(authentication).isNotNull();
        assertThat(authentication.getPrincipal()).isEqualTo(UUID.fromString(userId));
        assertThat(authentication.getAuthorities())
                .extracting("authority")
                .containsExactly("ROLE_DESIGNER");
    }

    private MockHttpServletRequest bearerRequest(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }

    private ExpiredJwtException expiredJwtException() {
        Claims claims = Jwts.claims().subject(UUID.randomUUID().toString()).build();
        return new ExpiredJwtException(null, claims, "expired");
    }
}
