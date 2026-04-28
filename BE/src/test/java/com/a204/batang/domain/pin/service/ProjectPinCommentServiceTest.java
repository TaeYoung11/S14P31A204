package com.a204.batang.domain.pin.service;

import com.a204.batang.domain.pin.dto.UpdatePinCommentRequest;
import com.a204.batang.domain.pin.dto.UpdatePinCommentResponse;
import com.a204.batang.domain.pin.entity.PinPosition;
import com.a204.batang.domain.pin.entity.ProjectPin;
import com.a204.batang.domain.pin.entity.ProjectPinComment;
import com.a204.batang.domain.pin.repository.PinCommentReadStateRepository;
import com.a204.batang.domain.pin.repository.ProjectPinCommentRepository;
import com.a204.batang.domain.pin.repository.ProjectPinRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import static org.mockito.Mockito.never;
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

    @InjectMocks
    private ProjectPinCommentService projectPinCommentService;

    private UUID projectId;
    private UUID pinId;
    private UUID commentId;
    private UUID authorUserId;

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

        comment = ProjectPinComment.create(pin, authorUserId, "기존 댓글");
        ReflectionTestUtils.setField(comment, "commentId", commentId);
        ReflectionTestUtils.setField(comment, "createdAt", LocalDateTime.of(2026, 4, 28, 9, 0, 0));
        ReflectionTestUtils.setField(comment, "updatedAt", LocalDateTime.of(2026, 4, 28, 9, 0, 0));
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
}
