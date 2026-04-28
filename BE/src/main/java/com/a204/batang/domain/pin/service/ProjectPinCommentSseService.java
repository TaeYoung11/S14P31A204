package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.PinCommentCreatedSseResponse;
import com.a204.batang.domain.pin.entity.ProjectPin;
import com.a204.batang.domain.pin.event.PinCommentCreatedEvent;
import com.a204.batang.domain.pin.repository.ProjectPinRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 프로젝트 핀 댓글 SSE 구독/전송을 담당한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectPinCommentSseService {

    private static final long SSE_TIMEOUT_MILLIS = 60L * 60L * 1000L;
    private static final String EVENT_NAME_CONNECTED = "connected";
    private static final String EVENT_NAME_COMMENT_CREATED = "comment-created";

    private final ProjectPinRepository projectPinRepository;
    private final ProjectAccessService projectAccessService;

    private final ConcurrentHashMap<UUID, CopyOnWriteArrayList<SseEmitter>> emittersByPin =
            new ConcurrentHashMap<>();

    /**
     * 핀 댓글 이벤트를 SSE로 구독한다.
     *
     * @param projectId 프로젝트 ID
     * @param pinId 핀 ID
     * @return SSE emitter
     */
    public SseEmitter subscribe(UUID projectId, UUID pinId) {
        ProjectPin projectPin = projectPinRepository.findActivePinByProjectId(pinId, projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PIN_NOT_FOUND));

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(projectPin.getProject(), currentUserId);

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MILLIS);
        emittersByPin.computeIfAbsent(pinId, ignored -> new CopyOnWriteArrayList<>())
                .add(emitter);

        emitter.onCompletion(() -> removeEmitter(pinId, emitter));
        emitter.onTimeout(() -> removeEmitter(pinId, emitter));
        emitter.onError(ex -> removeEmitter(pinId, emitter));

        try {
            emitter.send(SseEmitter.event()
                    .name(EVENT_NAME_CONNECTED)
                    .data(LocalDateTime.now().toString()));
        } catch (IOException e) {
            removeEmitter(pinId, emitter);
            throw new CustomException(ErrorCode.INTERNAL_SERVER_ERROR, "SSE 연결 초기 이벤트 전송에 실패했습니다.");
        }

        log.info("댓글 SSE 구독 연결 완료. projectId={}, pinId={}, subscriberUserId={}", projectId, pinId, currentUserId);
        return emitter;
    }

    /**
     * 새 댓글 생성 이벤트를 핀 구독자들에게 전송한다.
     *
     * @param event 새 댓글 생성 이벤트
     */
    public void publishCommentCreated(PinCommentCreatedEvent event) {
        List<SseEmitter> emitters = emittersByPin.get(event.pinId());
        if (emitters == null || emitters.isEmpty()) {
            return;
        }

        PinCommentCreatedSseResponse payload = PinCommentCreatedSseResponse.from(event);
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .id(event.commentId().toString())
                        .name(EVENT_NAME_COMMENT_CREATED)
                        .data(payload, MediaType.APPLICATION_JSON));
            } catch (IOException e) {
                removeEmitter(event.pinId(), emitter);
            }
        }
    }

    private void removeEmitter(UUID pinId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> emitters = emittersByPin.get(pinId);
        if (emitters == null) {
            return;
        }

        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            emittersByPin.remove(pinId);
        }
    }
}
