package com.a204.batang.domain.notification.service;

import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 사용자 단위로 통합 SSE 연결을 관리하고 알림을 발송한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationSseService {

    private static final long SSE_TIMEOUT_MILLIS = 60L * 60L * 1000L;
    private static final String EVENT_NAME_CONNECTED = "connected";

    private final ProjectAccessService projectAccessService;

    private final Map<UUID, CopyOnWriteArrayList<SseEmitter>> emittersByUser = new ConcurrentHashMap<>();

    /**
     * 현재 사용자 기준으로 SSE를 구독한다.
     * 트랜잭션을 열지 않고 연결만 등록해 DB 커넥션 점유를 방지한다.
     *
     * @return SSE emitter
     */
    public SseEmitter subscribe() {
        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        if (currentUserId == null) {
            throw new CustomException(ErrorCode.FORBIDDEN_ACCESS, "알림 SSE 구독은 로그인 사용자만 가능합니다.");
        }

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MILLIS);
        emittersByUser.computeIfAbsent(currentUserId, ignored -> new CopyOnWriteArrayList<>())
                .add(emitter);

        emitter.onCompletion(() -> removeEmitter(currentUserId, emitter));
        emitter.onTimeout(() -> removeEmitter(currentUserId, emitter));
        emitter.onError(ex -> removeEmitter(currentUserId, emitter));

        try {
            emitter.send(SseEmitter.event().name(EVENT_NAME_CONNECTED).data("connected"));
        } catch (IOException e) {
            removeEmitter(currentUserId, emitter);
            throw new CustomException(ErrorCode.INTERNAL_SERVER_ERROR, "SSE 초기 연결 응답 전송에 실패했습니다.");
        }

        log.info("알림 SSE 구독 완료. userId={}", currentUserId);
        return emitter;
    }

    /**
     * 지정한 사용자 집합에 같은 알림 이벤트를 발송한다.
     *
     * @param targetUserIds 발송 대상 사용자 ID 집합
     * @param eventName SSE 이벤트 이름
     * @param payload 발송 데이터
     */
    public void sendToUsers(Set<UUID> targetUserIds, String eventName, Object payload) {
        if (targetUserIds == null || targetUserIds.isEmpty()) {
            return;
        }

        for (UUID targetUserId : targetUserIds) {
            if (targetUserId == null) {
                continue;
            }

            List<SseEmitter> emitters = emittersByUser.get(targetUserId);
            if (emitters == null || emitters.isEmpty()) {
                continue;
            }

            for (SseEmitter emitter : emitters) {
                try {
                    emitter.send(SseEmitter.event()
                            .name(eventName)
                            .data(payload, MediaType.APPLICATION_JSON));
                } catch (IOException e) {
                    removeEmitter(targetUserId, emitter);
                }
            }
        }
    }

    private void removeEmitter(UUID userId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> emitters = emittersByUser.get(userId);
        if (emitters == null) {
            return;
        }

        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            emittersByUser.remove(userId);
        }
    }
}
