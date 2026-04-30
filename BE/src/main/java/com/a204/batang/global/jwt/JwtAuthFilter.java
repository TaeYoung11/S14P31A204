package com.a204.batang.global.jwt;

import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.exception.ErrorResponse;
import com.a204.batang.global.redis.RedisService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final RedisService redisService;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String token = extractToken(request);

        if (token != null) {
            try {
                if (redisService.isBlacklisted(token)) {
                    writeUnauthorizedResponse(response, "로그아웃된 토큰입니다.");
                    return;
                }

                Claims claims = jwtUtil.validateAndGetClaims(token);

                String userId = claims.getSubject();
                String userType = claims.get("userType", String.class);

                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(
                                UUID.fromString(userId),
                                null,
                                List.of(new SimpleGrantedAuthority("ROLE_" + userType))
                        );
                SecurityContextHolder.getContext().setAuthentication(auth);

            } catch (ExpiredJwtException e) {
                writeUnauthorizedResponse(response, "만료된 토큰입니다.");
                return;
            } catch (JwtException | IllegalArgumentException e) {
                writeUnauthorizedResponse(response, "유효하지 않은 토큰입니다.");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }

    private void writeUnauthorizedResponse(HttpServletResponse response, String message) throws IOException {
        ErrorResponse errorResponse = ErrorResponse.builder()
                .status(ErrorCode.UNAUTHORIZED.getStatus().value())
                .code(ErrorCode.UNAUTHORIZED.getCode())
                .message(message)
                .build();

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), errorResponse);
    }
}
