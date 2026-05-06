package com.a204.batang.global.config;

import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.jwt.JwtUtil;
import com.a204.batang.global.redis.RedisService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.Nullable;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * STOMP 인바운드 프레임의 인증/인가를 처리한다.
 * CONNECT 시 JWT를 검증하고, SEND/SUBSCRIBE 시 프로젝트 접근 권한을 확인한다.
 */
@Component
@RequiredArgsConstructor
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String AUTHORIZATION_HEADER_LOWER_CASE = "authorization";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final Pattern PROJECT_DESTINATION_PATTERN =
            Pattern.compile("^/(app|topic)/project/([0-9a-fA-F\\-]{36})(?:/.*)?$");

    private final JwtUtil jwtUtil;
    private final RedisService redisService;
    private final ProjectAccessService projectAccessService;

    /**
     * STOMP 프레임별 사전 인증/인가 검증을 수행한다.
     *
     * @param message 인바운드 메시지
     * @param channel 메시지 채널
     * @return 검증 통과한 메시지
     */
    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }

        StompCommand command = accessor.getCommand();
        if (StompCommand.CONNECT.equals(command)) {
            authenticateConnectOrThrow(accessor);
            return message;
        }

        if (StompCommand.SEND.equals(command)
                || StompCommand.SUBSCRIBE.equals(command)
                || StompCommand.UNSUBSCRIBE.equals(command)) {
            UUID currentUserId = extractCurrentUserIdOrThrow(accessor.getUser());
            validateProjectDestinationAccessOrThrow(accessor.getDestination(), currentUserId);
        }

        return message;
    }

    private void authenticateConnectOrThrow(StompHeaderAccessor accessor) {
        String authorizationHeader = resolveAuthorizationHeader(accessor);
        String token = extractBearerTokenOrThrow(authorizationHeader);

        if (redisService.isBlacklisted(token)) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "로그아웃 처리된 토큰입니다.");
        }

        try {
            Claims claims = jwtUtil.validateAndGetClaims(token);
            String subject = claims.getSubject();
            UUID userId = UUID.fromString(subject);
            accessor.setUser(new StompUserPrincipal(userId.toString()));
        } catch (ExpiredJwtException exception) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "만료된 토큰입니다.");
        } catch (JwtException | IllegalArgumentException exception) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "유효하지 않은 토큰입니다.");
        }
    }

    private void validateProjectDestinationAccessOrThrow(@Nullable String destination, UUID currentUserId) {
        if (destination == null || destination.isBlank()) {
            return;
        }

        Matcher matcher = PROJECT_DESTINATION_PATTERN.matcher(destination);
        if (!matcher.matches()) {
            return;
        }

        UUID projectId = UUID.fromString(matcher.group(2));
        projectAccessService.validateProjectPinWriterOrThrow(projectId, currentUserId);
    }

    private String resolveAuthorizationHeader(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader(AUTHORIZATION_HEADER);
        if (header != null && !header.isBlank()) {
            return header.trim();
        }

        String lowerCaseHeader = accessor.getFirstNativeHeader(AUTHORIZATION_HEADER_LOWER_CASE);
        if (lowerCaseHeader != null && !lowerCaseHeader.isBlank()) {
            return lowerCaseHeader.trim();
        }

        throw new CustomException(ErrorCode.UNAUTHORIZED, "웹소켓 인증 토큰이 필요합니다.");
    }

    private String extractBearerTokenOrThrow(String authorizationHeader) {
        if (!authorizationHeader.startsWith(BEARER_PREFIX)) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "Bearer 토큰 형식이 아닙니다.");
        }
        return authorizationHeader.substring(BEARER_PREFIX.length()).trim();
    }

    private UUID extractCurrentUserIdOrThrow(@Nullable Principal principal) {
        if (principal == null || principal.getName() == null || principal.getName().isBlank()) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "웹소켓 인증 정보가 없습니다.");
        }

        try {
            return UUID.fromString(principal.getName());
        } catch (IllegalArgumentException exception) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "웹소켓 인증 정보가 올바르지 않습니다.");
        }
    }

    /**
     * STOMP 세션에 사용자 식별자를 보관하기 위한 Principal 구현체다.
     */
    private record StompUserPrincipal(String userId) implements Principal {
        @Override
        public String getName() {
            return userId;
        }
    }
}
