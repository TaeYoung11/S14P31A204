package com.a204.batang.domain.chat.service;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.repository.MemberRepository;
import com.a204.batang.domain.chat.dto.GetProjectChatLogsResponse;
import com.a204.batang.domain.chat.dto.ProjectChatLogItemResponse;
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
import java.time.LocalDateTime;
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

/**
 * 프로젝트 채팅 로그 조회를 담당하는 서비스다.
 *
 * <p>현재 1단계에서는 별도 chat_messages 테이블 없이 jobs 기반 virtual log를 구성한다.
 * clarification_requests가 실제 저장소에 도입되면 repository CTE에 union을 추가하고,
 * 이 service는 동일한 응답 DTO를 유지한 채 read source만 확장하면 된다.
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
     * <p>DB에서는 최신순으로 가져오지만, FE가 그대로 렌더링하기 쉽도록 같은 페이지 내부에서는
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
        Page<Object[]> chatLogPage = projectChatLogRepository.findVirtualChatLogsByProjectId(projectId, pageable);

        Map<UUID, String> senderNames = resolveSenderNames(chatLogPage.getContent());
        List<ProjectChatLogItemResponse> messages = chatLogPage.getContent()
                .stream()
                .map(row -> toChatLogItem(row, senderNames))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
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
     * sender_user_id가 있는 USER 메시지에 한해서 이름을 일괄 조회한다.
     *
     * <p>현재 1단계에서는 users 테이블의 현재 name 값을 사용한다.
     * 추후 chat_messages 테이블로 전환되면 작성 시점 snapshot 이름을 저장하는 쪽이 더 적합하다.
     */
    private Map<UUID, String> resolveSenderNames(List<Object[]> rows) {
        Set<UUID> senderUserIds = new LinkedHashSet<>();
        for (Object[] row : rows) {
            UUID senderUserId = toUuid(row[4]);
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

    private ProjectChatLogItemResponse toChatLogItem(Object[] row, Map<UUID, String> senderNames) {
        UUID referenceId = toUuid(row[0]);
        String type = toStringValue(row[1]);
        String subType = toStringValue(row[2]);
        String content = toStringValue(row[3]);
        UUID senderUserId = toUuid(row[4]);
        UUID jobId = toUuid(row[5]);
        String jobType = toStringValue(row[6]);
        String jobStatus = toStringValue(row[7]);
        LocalDateTime timestamp = toLocalDateTime(row[8]);

        return new ProjectChatLogItemResponse(
                type,
                subType,
                content,
                senderUserId,
                senderUserId != null ? senderNames.get(senderUserId) : null,
                toUtcIso(timestamp),
                referenceId,
                jobId,
                jobType,
                jobStatus
        );
    }

    private UUID toUuid(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof UUID uuid) {
            return uuid;
        }
        return UUID.fromString(String.valueOf(value));
    }

    private String toStringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private LocalDateTime toLocalDateTime(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDateTime localDateTime) {
            return localDateTime;
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toLocalDateTime();
        }
        return LocalDateTime.parse(String.valueOf(value));
    }

    /**
     * DB에 저장된 로컬 시각(KST)을 UTC ISO-8601 문자열로 변환한다.
     */
    private String toUtcIso(LocalDateTime value) {
        if (value == null) {
            return null;
        }

        return value.atZone(KOREA_ZONE_ID)
                .withZoneSameInstant(ZoneOffset.UTC)
                .format(DateTimeFormatter.ISO_INSTANT);
    }
}
