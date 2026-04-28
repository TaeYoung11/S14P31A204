package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.CreatePinCommentRequest;
import com.a204.batang.domain.pin.dto.CreatePinCommentResponse;
import com.a204.batang.domain.pin.dto.ResolvePinCommentResponse;
import com.a204.batang.domain.pin.dto.UpdatePinCommentRequest;
import com.a204.batang.domain.pin.dto.UpdatePinCommentResponse;
import com.a204.batang.domain.pin.entity.PinPosition;
import com.a204.batang.domain.pin.entity.PinStatus;
import com.a204.batang.domain.pin.entity.ProjectPin;
import com.a204.batang.domain.pin.entity.ProjectPinComment;
import com.a204.batang.domain.pin.event.PinCommentCreatedEvent;
import com.a204.batang.domain.pin.repository.PinCommentReadStateRepository;
import com.a204.batang.domain.pin.repository.ProjectPinCommentRepository;
import com.a204.batang.domain.pin.repository.ProjectPinRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import jakarta.persistence.EntityManager;
import org.springframework.context.ApplicationEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class ProjectPinCommentServiceTest {

    @Mock
    private ProjectPinRepository projectPinRepository;

    @Mock
    private ProjectPinCommentRepository projectPinCommentRepository;

    @Mock
    private PinCommentReadStateRepository pinCommentReadStateRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @Mock
    private EntityManager entityManager;

    @Mock
    private ApplicationEventPublisher applicationEventPublisher;

    @InjectMocks
    private ProjectPinCommentService projectPinCommentService;

    private UUID projectId;
    private UUID pinId;
    private UUID commentId;
    private UUID authorUserId;
    private LocalDateTime pinCreatedAt;

    private Project project;
    private ProjectPin pin;
    private ProjectPinComment comment;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        pinId = UUID.randomUUID();
        commentId = UUID.randomUUID();
        authorUserId = UUID.randomUUID();

        project = Project.create("test-project", "desc");
        ReflectionTestUtils.setField(project, "projectId", projectId);

        pin = ProjectPin.create(
                project,
                authorUserId,
                PinPosition.of(1.0, 2.0, 3.0),
                PinPosition.of(10.0, 20.0, 30.0),
                "beam-01",
                "pin-content"
        );
        ReflectionTestUtils.setField(pin, "pinId", pinId);
        pinCreatedAt = LocalDateTime.of(2026, 4, 28, 8, 0, 0);
        ReflectionTestUtils.setField(pin, "createdAt", pinCreatedAt);
        ReflectionTestUtils.setField(pin, "lastCommentAt", LocalDateTime.of(2026, 4, 28, 9, 0, 0));
        ReflectionTestUtils.setField(pin, "lastCommentAuthorUserId", authorUserId);
        ReflectionTestUtils.setField(pin, "commentCount", 2);

        comment = ProjectPinComment.create(pin, authorUserId, "기존 댓글");
        ReflectionTestUtils.setField(comment, "commentId", commentId);
        ReflectionTestUtils.setField(comment, "createdAt", LocalDateTime.of(2026, 4, 28, 9, 0, 0));
        ReflectionTestUtils.setField(comment, "updatedAt", LocalDateTime.of(2026, 4, 28, 9, 0, 0));
    }

    @Test
    void createComment_publishesCommentCreatedEvent() {
        CreatePinCommentRequest request = new CreatePinCommentRequest("  새 댓글  ");
        LocalDateTime createdAt = LocalDateTime.of(2026, 4, 28, 9, 10, 0);

        given(projectPinRepository.findActivePinByProjectId(pinId, projectId))
                .willReturn(Optional.of(pin));
        given(projectAccessService.resolveCurrentUserId()).willReturn(authorUserId);
        given(projectPinCommentRepository.save(org.mockito.ArgumentMatchers.any(ProjectPinComment.class)))
                .willAnswer(invocation -> {
                    ProjectPinComment savedComment = invocation.getArgument(0);
                    ReflectionTestUtils.setField(savedComment, "commentId", commentId);
                    ReflectionTestUtils.setField(savedComment, "createdAt", createdAt);
                    return savedComment;
                });

        CreatePinCommentResponse response = projectPinCommentService.createComment(projectId, pinId, request);

        assertThat(response.commentId()).isEqualTo(commentId);
        assertThat(response.pinId()).isEqualTo(pinId);
        assertThat(response.authorUserId()).isEqualTo(authorUserId);
        assertThat(response.content()).isEqualTo("새 댓글");
        assertThat(response.createdAt()).isEqualTo(createdAt);

        verify(applicationEventPublisher).publishEvent(eq(new PinCommentCreatedEvent(
                projectId,
                pinId,
                commentId,
                authorUserId,
                "새 댓글",
                createdAt
        )));
        ArgumentCaptor<ProjectPinComment> savedCaptor = ArgumentCaptor.forClass(ProjectPinComment.class);
        verify(projectPinCommentRepository).save(savedCaptor.capture());
        assertThat(savedCaptor.getValue().getStatus()).isEqualTo(PinStatus.OPEN);
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void createComment_createsResolvedComment_whenPinAlreadyResolved() {
        CreatePinCommentRequest request = new CreatePinCommentRequest("완료된 핀의 댓글");
        LocalDateTime createdAt = LocalDateTime.of(2026, 4, 28, 9, 12, 0);
        ReflectionTestUtils.setField(pin, "status", PinStatus.RESOLVED);

        given(projectPinRepository.findActivePinByProjectId(pinId, projectId))
                .willReturn(Optional.of(pin));
        given(projectAccessService.resolveCurrentUserId()).willReturn(authorUserId);
        given(projectPinCommentRepository.save(any(ProjectPinComment.class)))
                .willAnswer(invocation -> {
                    ProjectPinComment savedComment = invocation.getArgument(0);
                    ReflectionTestUtils.setField(savedComment, "commentId", commentId);
                    ReflectionTestUtils.setField(savedComment, "createdAt", createdAt);
                    return savedComment;
                });

        projectPinCommentService.createComment(projectId, pinId, request);

        ArgumentCaptor<ProjectPinComment> savedCaptor = ArgumentCaptor.forClass(ProjectPinComment.class);
        verify(projectPinCommentRepository).save(savedCaptor.capture());
        assertThat(savedCaptor.getValue().getStatus()).isEqualTo(PinStatus.RESOLVED);
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void updateComment_updatesOnlyContent_andDoesNotTouchReadState() {
        UpdatePinCommentRequest request = new UpdatePinCommentRequest("  수정된 댓글  ");
        LocalDateTime updatedAt = LocalDateTime.of(2026, 4, 28, 9, 30, 0);

        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.of(comment));
        given(projectAccessService.resolveCurrentUserId()).willReturn(authorUserId);
        doAnswer(invocation -> {
            ReflectionTestUtils.setField(comment, "updatedAt", updatedAt);
            return null;
        }).when(entityManager).flush();

        UpdatePinCommentResponse response = projectPinCommentService.updateComment(projectId, pinId, commentId, request);

        assertThat(comment.getContent()).isEqualTo("수정된 댓글");
        assertThat(response.commentId()).isEqualTo(commentId);
        assertThat(response.pinId()).isEqualTo(pinId);
        assertThat(response.content()).isEqualTo("수정된 댓글");
        assertThat(response.updatedAt()).isEqualTo(updatedAt);

        verify(projectAccessService).validateProjectPinWriterOrThrow(project, authorUserId);
        verify(entityManager).flush();
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void updateComment_throwsForbidden_whenCurrentUserIsNotAuthor() {
        UUID otherUserId = UUID.randomUUID();
        UpdatePinCommentRequest request = new UpdatePinCommentRequest("수정 시도");

        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.of(comment));
        given(projectAccessService.resolveCurrentUserId()).willReturn(otherUserId);

        assertThatThrownBy(() -> projectPinCommentService.updateComment(projectId, pinId, commentId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);

        verify(entityManager, never()).flush();
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void updateComment_throwsCommentNotFound_whenCommentDoesNotExist() {
        UpdatePinCommentRequest request = new UpdatePinCommentRequest("수정 시도");

        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.empty());

        assertThatThrownBy(() -> projectPinCommentService.updateComment(projectId, pinId, commentId, request))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.COMMENT_NOT_FOUND);

        verify(entityManager, never()).flush();
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void resolveComment_marksCommentResolved_whenCurrentUserCanAccessProjectEvenIfNotCommentAuthor() {
        UUID otherUserId = UUID.randomUUID();
        LocalDateTime updatedAt = LocalDateTime.of(2026, 4, 28, 9, 40, 0);
        LocalDateTime resolvedAt = LocalDateTime.of(2026, 4, 28, 9, 41, 0);

        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.of(comment));
        given(projectAccessService.resolveCurrentUserId()).willReturn(otherUserId);
        doAnswer(invocation -> {
            ReflectionTestUtils.setField(comment, "updatedAt", updatedAt);
            ReflectionTestUtils.setField(comment, "resolvedAt", resolvedAt);
            return null;
        }).when(entityManager).flush();

        ResolvePinCommentResponse response = projectPinCommentService.resolveComment(projectId, pinId, commentId);

        assertThat(comment.getStatus()).isEqualTo(PinStatus.RESOLVED);
        assertThat(comment.getResolvedByUserId()).isEqualTo(otherUserId);
        assertThat(comment.getResolvedAt()).isEqualTo(resolvedAt);
        assertThat(pin.getStatus()).isEqualTo(PinStatus.OPEN);

        assertThat(response.commentId()).isEqualTo(commentId);
        assertThat(response.pinId()).isEqualTo(pinId);
        assertThat(response.status()).isEqualTo(PinStatus.RESOLVED);
        assertThat(response.resolvedByUserId()).isEqualTo(otherUserId);
        assertThat(response.resolvedAt()).isEqualTo(resolvedAt);
        assertThat(response.updatedAt()).isEqualTo(updatedAt);

        verify(projectAccessService).validateProjectPinWriterOrThrow(project, otherUserId);
        verify(entityManager).flush();
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void resolveComment_isIdempotent_whenCommentAlreadyResolved() {
        UUID resolverUserId = UUID.randomUUID();
        LocalDateTime resolvedAt = LocalDateTime.of(2026, 4, 28, 9, 35, 0);
        ReflectionTestUtils.setField(comment, "status", PinStatus.RESOLVED);
        ReflectionTestUtils.setField(comment, "resolvedByUserId", resolverUserId);
        ReflectionTestUtils.setField(comment, "resolvedAt", resolvedAt);

        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.of(comment));
        given(projectAccessService.resolveCurrentUserId()).willReturn(authorUserId);

        ResolvePinCommentResponse response = projectPinCommentService.resolveComment(projectId, pinId, commentId);

        assertThat(response.status()).isEqualTo(PinStatus.RESOLVED);
        assertThat(response.resolvedByUserId()).isEqualTo(resolverUserId);
        assertThat(response.resolvedAt()).isEqualTo(resolvedAt);

        verify(entityManager, never()).flush();
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void resolveComment_throwsCommentNotFound_whenCommentDoesNotExist() {
        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.empty());

        assertThatThrownBy(() -> projectPinCommentService.resolveComment(projectId, pinId, commentId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.COMMENT_NOT_FOUND);

        verify(entityManager, never()).flush();
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void deleteComment_softDeletesComment_andRecalculatesPinSummary_whenNoActiveCommentRemains() {
        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.of(comment));
        given(projectAccessService.resolveCurrentUserId()).willReturn(authorUserId);
        given(projectPinCommentRepository.countByProjectPinPinIdAndDeletedAtIsNull(pinId)).willReturn(0L);
        given(projectPinCommentRepository.findTopByProjectPinPinIdAndDeletedAtIsNullOrderByCreatedAtDescCommentIdDesc(pinId))
                .willReturn(Optional.empty());

        projectPinCommentService.deleteComment(projectId, pinId, commentId);

        assertThat(comment.getDeletedAt()).isNotNull();
        assertThat(pin.getCommentCount()).isEqualTo(1);
        assertThat(pin.getLastCommentAt()).isEqualTo(pinCreatedAt);
        assertThat(pin.getLastCommentAuthorUserId()).isEqualTo(authorUserId);
        verify(projectAccessService).validateProjectPinWriterOrThrow(project, authorUserId);
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void deleteComment_recalculatesPinSummaryWithLatestActiveComment_whenAnotherCommentExists() {
        UUID otherAuthorId = UUID.randomUUID();
        ProjectPinComment latestComment = ProjectPinComment.create(pin, otherAuthorId, "another-comment");
        LocalDateTime latestCreatedAt = LocalDateTime.of(2026, 4, 28, 10, 0, 0);
        ReflectionTestUtils.setField(latestComment, "createdAt", latestCreatedAt);

        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.of(comment));
        given(projectAccessService.resolveCurrentUserId()).willReturn(authorUserId);
        given(projectPinCommentRepository.countByProjectPinPinIdAndDeletedAtIsNull(pinId)).willReturn(1L);
        given(projectPinCommentRepository.findTopByProjectPinPinIdAndDeletedAtIsNullOrderByCreatedAtDescCommentIdDesc(pinId))
                .willReturn(Optional.of(latestComment));

        projectPinCommentService.deleteComment(projectId, pinId, commentId);

        assertThat(pin.getCommentCount()).isEqualTo(2);
        assertThat(pin.getLastCommentAt()).isEqualTo(latestCreatedAt);
        assertThat(pin.getLastCommentAuthorUserId()).isEqualTo(otherAuthorId);
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void deleteComment_throwsForbidden_whenCurrentUserIsNotAuthor() {
        UUID otherUserId = UUID.randomUUID();

        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.of(comment));
        given(projectAccessService.resolveCurrentUserId()).willReturn(otherUserId);

        assertThatThrownBy(() -> projectPinCommentService.deleteComment(projectId, pinId, commentId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);

        assertThat(comment.getDeletedAt()).isNull();
        verify(projectPinCommentRepository, never()).countByProjectPinPinIdAndDeletedAtIsNull(pinId);
        verify(projectPinCommentRepository, never())
                .findTopByProjectPinPinIdAndDeletedAtIsNullOrderByCreatedAtDescCommentIdDesc(pinId);
        verifyNoInteractions(pinCommentReadStateRepository);
    }

    @Test
    void deleteComment_throwsCommentNotFound_whenCommentDoesNotExist() {
        given(projectPinCommentRepository.findActiveCommentByProjectPin(projectId, pinId, commentId))
                .willReturn(Optional.empty());

        assertThatThrownBy(() -> projectPinCommentService.deleteComment(projectId, pinId, commentId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.COMMENT_NOT_FOUND);

        verify(projectPinCommentRepository, never()).countByProjectPinPinIdAndDeletedAtIsNull(pinId);
        verify(projectPinCommentRepository, never())
                .findTopByProjectPinPinIdAndDeletedAtIsNullOrderByCreatedAtDescCommentIdDesc(pinId);
        verifyNoInteractions(pinCommentReadStateRepository);
    }
}
