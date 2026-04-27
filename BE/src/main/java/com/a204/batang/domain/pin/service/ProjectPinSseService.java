package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.PinCreatedSseResponse;
import com.a204.batang.domain.pin.event.PinCreatedEvent;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 프로젝트 핀 SSE 구독/전송을 담당한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectPinSseService {

    private static final long SSE_TIMEOUT_MILLIS = 60L * 60L * 1000L;
    private static final String EVENT_NAME_CONNECTED = "connected";
    private static final String EVENT_NAME_PIN_CREATED = "pin-created";

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;

    private final ConcurrentHashMap<UUID, CopyOnWriteArrayList<SseEmitter>> emittersByProject =
            new ConcurrentHashMap<>();

    /**
     * 프로젝트 핀 이벤트를 SSE로 구독한다.
     *
     * @param projectId 프로젝트 ID
     * @return SSE emitter
     */
    @Transactional(readOnly = true)
    public SseEmitter subscribe(UUID projectId) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectPinWriterOrThrow(project, currentUserId);

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MILLIS);
        emittersByProject.computeIfAbsent(projectId, ignored -> new CopyOnWriteArrayList<>())
                .add(emitter);

        emitter.onCompletion(() -> removeEmitter(projectId, emitter));
        emitter.onTimeout(() -> removeEmitter(projectId, emitter));
        emitter.onError(ex -> removeEmitter(projectId, emitter));

        try {
            emitter.send(SseEmitter.event()
                    .name(EVENT_NAME_CONNECTED)
                    .data(LocalDateTime.now().toString()));
        } catch (IOException e) {
            removeEmitter(projectId, emitter);
            throw new CustomException(ErrorCode.INTERNAL_SERVER_ERROR, "SSE 연결 초기 이벤트 전송에 실패했습니다.");
        }

        log.info("핀 SSE 구독 연결 완료. projectId={}, subscriberUserId={}", projectId, currentUserId);
        return emitter;
    }

    /**
     * 새 핀 생성 이벤트를 프로젝트 구독자들에게 전송한다.
     *
     * @param event 새 핀 생성 이벤트
     */
    public void publishPinCreated(PinCreatedEvent event) {
        List<SseEmitter> emitters = emittersByProject.get(event.projectId());
        if (emitters == null || emitters.isEmpty()) {
            return;
        }

        PinCreatedSseResponse payload = PinCreatedSseResponse.from(event);
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .id(event.pinId().toString())
                        .name(EVENT_NAME_PIN_CREATED)
                        .data(payload, MediaType.APPLICATION_JSON));
            } catch (IOException e) {
                removeEmitter(event.projectId(), emitter);
            }
        }
    }

    private void removeEmitter(UUID projectId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> emitters = emittersByProject.get(projectId);
        if (emitters == null) {
            return;
        }

        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            emittersByProject.remove(projectId);
        }
    }
}
