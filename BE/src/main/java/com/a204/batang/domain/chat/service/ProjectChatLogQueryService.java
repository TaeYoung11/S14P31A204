package com.a204.batang.domain.chat.service;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.repository.MemberRepository;
import com.a204.batang.domain.chat.dto.GetProjectChatLogsResponse;
import com.a204.batang.domain.chat.dto.ProjectChatLogItemResponse;
import com.a204.batang.domain.chat.repository.ProjectChatLogProjection;
import com.a204.batang.domain.chat.repository.ProjectChatLogRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 프로젝트 채팅 로그 조회를 담당하는 서비스다.
 *
 * <p>현재 1단계 구현에서는 별도 {@code chat_messages} 테이블 없이
 * {@code jobs} 기반의 virtual log를 조회한다.
 * 이후 clarification 요청이나 실제 채팅 메시지 저장소가 도입되더라도,
 * 이 서비스는 같은 응답 DTO를 유지한 채 read source만 교체하는 것을 목표로 한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProjectChatLogQueryService {

    private static final ZoneId KOREA_ZONE_ID = ZoneId.of("Asia/Seoul");

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;
    private final ProjectChatLogRepository projectChatLogRepository;
    private final MemberRepository memberRepository;

    /**
     * 프로젝트 채팅 로그를 최신 페이지 기준으로 조회한다.
     *
     * <p>DB에서는 최신 메시지부터 조회하지만, 같은 페이지 안에서는 FE가 그대로 렌더링하기 쉽도록
     * 시간 오름차순으로 뒤집어서 반환한다.
     *
     * @param projectId 프로젝트 ID
     * @param page 0-base 페이지 번호
     * @param size 페이지 크기
     * @return 채팅 로그 페이지 응답
     */
    public GetProjectChatLogsResponse getProjectChatLogs(UUID projectId, int page, int size) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = projectAccessService.resolveCurrentUserIdOrThrow();
        projectAccessService.validateProjectPinWriterOrThrow(project, currentUserId);

        Pageable pageable = PageRequest.of(page, size);
        Page<ProjectChatLogProjection> chatLogPage =
                projectChatLogRepository.findVirtualChatLogsByProjectId(projectId, pageable);

        Map<UUID, String> senderNames = resolveSenderNames(chatLogPage.getContent());
        List<ProjectChatLogItemResponse> messages = chatLogPage.getContent().stream()
                .map(projection -> toChatLogItem(projection, senderNames))
                .collect(Collectors.toCollection(ArrayList::new));
        Collections.reverse(messages);

        return GetProjectChatLogsResponse.of(
                projectId,
                page,
                size,
                chatLogPage.getTotalElements(),
                chatLogPage.getTotalPages(),
                chatLogPage.hasNext(),
                messages
        );
    }

    /**
     * 사용자 발화 메시지에 대해서만 sender name을 일괄 조회한다.
     *
     * <p>AI 결과/오류 메시지는 발신자 ID가 없으므로 user lookup 대상에서 제외한다.
     * 중복 조회를 피하기 위해 sender_user_id를 set으로 모은 뒤 한 번에 조회한다.
     */
    private Map<UUID, String> resolveSenderNames(List<ProjectChatLogProjection> projections) {
        Set<UUID> senderUserIds = new LinkedHashSet<>();
        for (ProjectChatLogProjection projection : projections) {
            UUID senderUserId = projection.getSenderUserId();
            if (senderUserId != null) {
                senderUserIds.add(senderUserId);
            }
        }

        if (senderUserIds.isEmpty()) {
            return Map.of();
        }

        Map<UUID, String> senderNames = new LinkedHashMap<>();
        Iterable<Member> members = memberRepository.findAllById(senderUserIds);
        for (Member member : members) {
            senderNames.put(member.getUserId(), member.getName());
        }
        return senderNames;
    }

    /**
     * projection 한 건을 API 응답용 채팅 로그 아이템으로 변환한다.
     *
     * <p>native query alias와 projection getter를 1:1로 맞추고, 이 단계에서만 DTO로 조립한다.
     * timestamp는 DB/JPA가 반환하는 실제 타입에 따라 별도 helper에서 UTC ISO-8601 문자열로 변환한다.
     */
    private ProjectChatLogItemResponse toChatLogItem(
            ProjectChatLogProjection projection,
            Map<UUID, String> senderNames
    ) {
        UUID senderUserId = projection.getSenderUserId();
        return new ProjectChatLogItemResponse(
                projection.getType(),
                projection.getSubType(),
                projection.getContent(),
                senderUserId,
                senderUserId != null ? senderNames.get(senderUserId) : null,
                toUtcIso(projection.getTimestamp()),
                projection.getReferenceId(),
                projection.getJobId(),
                projection.getJobType(),
                projection.getJobStatus()
        );
    }

    /**
     * DB/JPA가 반환한 timestamp 값을 UTC ISO-8601 문자열로 변환한다.
     *
     * <p>현재 chat read path는 KST 저장 가정을 유지한다.
     * 따라서 {@link LocalDateTime}과 {@link Timestamp}는 Asia/Seoul 기준 시각으로 해석한 뒤 UTC로 변환한다.
     * 반면 {@link OffsetDateTime}, {@link Instant}는 이미 절대시간을 표현하므로 그대로 ISO_INSTANT로 포맷한다.
     *
     * <p>지원하지 않는 타입은 문자열 파싱으로 억지 처리하지 않고, 명시적으로 실패시켜
     * 잘못된 시간 변환이 조용히 숨어들지 않게 한다.
     */
    private String toUtcIso(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDateTime localDateTime) {
            return localDateTime.atZone(KOREA_ZONE_ID)
                    .withZoneSameInstant(ZoneOffset.UTC)
                    .format(DateTimeFormatter.ISO_INSTANT);
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toLocalDateTime()
                    .atZone(KOREA_ZONE_ID)
                    .withZoneSameInstant(ZoneOffset.UTC)
                    .format(DateTimeFormatter.ISO_INSTANT);
        }
        if (value instanceof OffsetDateTime offsetDateTime) {
            return DateTimeFormatter.ISO_INSTANT.format(offsetDateTime.toInstant());
        }
        if (value instanceof Instant instant) {
            return DateTimeFormatter.ISO_INSTANT.format(instant);
        }
        throw new IllegalStateException("Unsupported chat log timestamp type: " + value.getClass().getName());
    }
}
