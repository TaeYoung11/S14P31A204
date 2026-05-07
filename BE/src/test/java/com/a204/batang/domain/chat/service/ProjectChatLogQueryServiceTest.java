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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Constructor;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ProjectChatLogQueryServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @Mock
    private ProjectChatLogRepository projectChatLogRepository;

    @Mock
    private MemberRepository memberRepository;

    @InjectMocks
    private ProjectChatLogQueryService projectChatLogQueryService;

    private UUID projectId;
    private UUID currentUserId;
    private UUID chatRequesterId;
    private Project project;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        currentUserId = UUID.randomUUID();
        chatRequesterId = UUID.randomUUID();
        project = Project.create("chat-project", "desc", currentUserId);
        ReflectionTestUtils.setField(project, "projectId", projectId);
    }

    @Test
    void getProjectChatLogs_throwsWhenProjectDoesNotExist() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> projectChatLogQueryService.getProjectChatLogs(projectId, 0, 50))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.PROJECT_NOT_FOUND);
    }

    @Test
    void getProjectChatLogs_propagatesForbiddenAccess() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
        doThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS))
                .when(projectAccessService)
                .validateProjectPinWriterOrThrow(project, currentUserId);

        assertThatThrownBy(() -> projectChatLogQueryService.getProjectChatLogs(projectId, 0, 50))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);
    }

    @Test
    void getProjectChatLogs_returnsMessagesInAscendingOrderWithinPageAndMapsSenderName() throws Exception {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);

        UUID jobId = UUID.randomUUID();
        Object[] errorRow = new Object[] {
                jobId, "AI", "ERROR", "편집 작업이 실패했습니다.", null,
                jobId, "TWO_D_TO_IFC_EDIT", "FAILED",
                Timestamp.valueOf(LocalDateTime.of(2026, 5, 7, 11, 3, 0))
        };
        Object[] commandRow = new Object[] {
                jobId, "USER", "COMMAND", "거실 벽을 추가해줘", chatRequesterId,
                jobId, "TWO_D_TO_IFC_EDIT", "FAILED",
                Timestamp.valueOf(LocalDateTime.of(2026, 5, 7, 11, 0, 0))
        };

        given(projectChatLogRepository.findVirtualChatLogsByProjectId(eq(projectId), eq(PageRequest.of(0, 50))))
                .willReturn(new PageImpl<>(List.<Object[]>of(errorRow, commandRow), PageRequest.of(0, 50), 2));
        given(memberRepository.findAllById(argThat((Iterable<UUID> ids) -> {
            List<UUID> collected = new ArrayList<>();
            ids.forEach(collected::add);
            return collected.size() == 1 && collected.contains(chatRequesterId);
        }))).willReturn(List.of(createMember(chatRequesterId, "홍길동")));

        GetProjectChatLogsResponse response = projectChatLogQueryService.getProjectChatLogs(projectId, 0, 50);

        assertThat(response.projectId()).isEqualTo(projectId);
        assertThat(response.page()).isZero();
        assertThat(response.size()).isEqualTo(50);
        assertThat(response.totalElements()).isEqualTo(2);
        assertThat(response.totalPages()).isEqualTo(1);
        assertThat(response.hasNext()).isFalse();
        assertThat(response.messages()).hasSize(2);

        ProjectChatLogItemResponse first = response.messages().get(0);
        assertThat(first.type()).isEqualTo("USER");
        assertThat(first.subType()).isEqualTo("COMMAND");
        assertThat(first.content()).isEqualTo("거실 벽을 추가해줘");
        assertThat(first.senderUserId()).isEqualTo(chatRequesterId);
        assertThat(first.senderName()).isEqualTo("홍길동");
        assertThat(first.timestamp()).isEqualTo("2026-05-07T02:00:00Z");

        ProjectChatLogItemResponse second = response.messages().get(1);
        assertThat(second.type()).isEqualTo("AI");
        assertThat(second.subType()).isEqualTo("ERROR");
        assertThat(second.content()).isEqualTo("편집 작업이 실패했습니다.");
        assertThat(second.senderUserId()).isNull();
        assertThat(second.senderName()).isNull();
        assertThat(second.timestamp()).isEqualTo("2026-05-07T02:03:00Z");
    }

    @Test
    void getProjectChatLogs_skipsUserLookupWhenSenderIsAbsent() {
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);

        UUID jobId = UUID.randomUUID();
        Object[] resultRow = new Object[] {
                jobId, "AI", "RESULT", "IFC 편집 작업이 완료되었습니다.", null,
                jobId, "THREE_D_TO_IFC_EDIT", "SUCCEEDED",
                Timestamp.valueOf(LocalDateTime.of(2026, 5, 7, 11, 10, 0))
        };
        given(projectChatLogRepository.findVirtualChatLogsByProjectId(eq(projectId), eq(PageRequest.of(0, 50))))
                .willReturn(new PageImpl<>(List.<Object[]>of(resultRow), PageRequest.of(0, 50), 1));

        GetProjectChatLogsResponse response = projectChatLogQueryService.getProjectChatLogs(projectId, 0, 50);

        assertThat(response.messages()).hasSize(1);
        assertThat(response.messages().get(0).type()).isEqualTo("AI");
        verify(memberRepository, never()).findAllById(any());
    }

    private Member createMember(UUID userId, String name) throws Exception {
        Constructor<Member> constructor = Member.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        Member member = constructor.newInstance();
        ReflectionTestUtils.setField(member, "userId", userId);
        ReflectionTestUtils.setField(member, "name", name);
        return member;
    }
}
