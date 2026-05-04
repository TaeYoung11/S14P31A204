package com.a204.batang.global.config;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectMemberRepository;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.jwt.JwtUtil;
import com.a204.batang.global.redis.RedisService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * STOMP CONNECT 시 JWT를 검증하고 세션 사용자 정보를 주입한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String AUTHORIZATION_HEADER_LOWER = "authorization";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String SESSION_AUTH_KEY = "WS_AUTH";
    private static final Pattern PROJECT_SYNC_SUBSCRIBE_DESTINATION_PATTERN =
            Pattern.compile("^/topic/project/([0-9a-fA-F\\-]{36})/sync$");

    private final JwtUtil jwtUtil;
    private final RedisService redisService;
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;

    /**
     * STOMP inbound 메시지 처리 전에 인증/인가 컨텍스트를 보강한다.
     *
     * @param message inbound 메시지
     * @param channel 메시지 채널
     * @return 처리할 메시지
     */
    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }

        StompCommand command = accessor.getCommand();
        if (command == null) {
            return message;
        }

        if (StompCommand.CONNECT.equals(command)) {
            UsernamePasswordAuthenticationToken authentication = authenticateOnConnectOrThrow(accessor);
            accessor.setUser(authentication);
            if (accessor.getSessionAttributes() != null) {
                accessor.getSessionAttributes().put(SESSION_AUTH_KEY, authentication);
            }
            log.info("STOMP CONNECT 인증 완료. userId={}", authentication.getPrincipal());
            return message;
        }

        UsernamePasswordAuthenticationToken sessionAuthentication = resolveSessionAuthentication(accessor);
        if (sessionAuthentication != null) {
            accessor.setUser(sessionAuthentication);
        }

        if (requiresAuthentication(command) && accessor.getUser() == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "웹소켓 인증이 필요합니다.");
        }

        if (StompCommand.SUBSCRIBE.equals(command)) {
            validateSubscribePermissionOrThrow(accessor);
        }

        return message;
    }

    private boolean requiresAuthentication(StompCommand command) {
        return StompCommand.SEND.equals(command)
                || StompCommand.SUBSCRIBE.equals(command)
                || StompCommand.UNSUBSCRIBE.equals(command);
    }

    private UsernamePasswordAuthenticationToken authenticateOnConnectOrThrow(StompHeaderAccessor accessor) {
        String authorization = resolveAuthorizationHeader(accessor);
        String accessToken = extractBearerTokenOrThrow(authorization);

        if (redisService.isBlacklisted(accessToken)) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "로그아웃된 토큰입니다.");
        }

        try {
            Claims claims = jwtUtil.validateAndGetClaims(accessToken);
            UUID userId = UUID.fromString(claims.getSubject());
            String userType = claims.get("userType", String.class);

            if (userType == null || userType.isBlank()) {
                throw new CustomException(ErrorCode.UNAUTHORIZED, "유효하지 않은 사용자 권한 정보입니다.");
            }

            return new UsernamePasswordAuthenticationToken(
                    userId,
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + userType))
            );
        } catch (JwtException | IllegalArgumentException exception) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "유효하지 않은 웹소켓 토큰입니다.");
        }
    }

    private void validateSubscribePermissionOrThrow(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null || destination.isBlank()) {
            return;
        }

        Matcher matcher = PROJECT_SYNC_SUBSCRIBE_DESTINATION_PATTERN.matcher(destination);
        if (!matcher.matches()) {
            return;
        }

        UUID currentUserId = resolveCurrentUserIdOrThrow(accessor);
        UUID projectId = UUID.fromString(matcher.group(1));
        validateProjectMemberOrThrow(projectId, currentUserId);
    }

    private UUID resolveCurrentUserIdOrThrow(StompHeaderAccessor accessor) {
        if (accessor.getUser() == null) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "웹소켓 인증이 필요합니다.");
        }

        try {
            return UUID.fromString(accessor.getUser().getName());
        } catch (IllegalArgumentException exception) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "유효하지 않은 웹소켓 사용자 정보입니다.");
        }
    }

    private void validateProjectMemberOrThrow(UUID projectId, UUID currentUserId) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        if (Objects.equals(project.getOwnerUserId(), currentUserId)) {
            return;
        }

        boolean isInvitedMember = projectMemberRepository.existsByProjectProjectIdAndUserId(projectId, currentUserId);
        if (!isInvitedMember) {
            throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "해당 프로젝트 구독 권한이 없습니다.");
        }
    }

    private String resolveAuthorizationHeader(StompHeaderAccessor accessor) {
        String authorization = accessor.getFirstNativeHeader(AUTHORIZATION_HEADER);
        if (authorization != null) {
            return authorization;
        }
        return accessor.getFirstNativeHeader(AUTHORIZATION_HEADER_LOWER);
    }

    private String extractBearerTokenOrThrow(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith(BEARER_PREFIX)) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "Authorization Bearer 토큰이 필요합니다.");
        }

        String token = authorizationHeader.substring(BEARER_PREFIX.length()).trim();
        if (token.isEmpty()) {
            throw new CustomException(ErrorCode.UNAUTHORIZED, "Authorization Bearer 토큰이 비어 있습니다.");
        }

        return token;
    }

    @SuppressWarnings("unchecked")
    private UsernamePasswordAuthenticationToken resolveSessionAuthentication(StompHeaderAccessor accessor) {
        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
        if (sessionAttributes == null) {
            return null;
        }

        Object sessionAuth = sessionAttributes.get(SESSION_AUTH_KEY);
        if (sessionAuth instanceof UsernamePasswordAuthenticationToken authentication) {
            return authentication;
        }
        return null;
    }
}
