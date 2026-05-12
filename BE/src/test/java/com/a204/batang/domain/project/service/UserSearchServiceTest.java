package com.a204.batang.domain.project.service;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserStatus;
import com.a204.batang.domain.auth.entity.UserType;
import com.a204.batang.domain.auth.repository.MemberRepository;
import com.a204.batang.domain.project.dto.UserSearchResponse;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;

@ExtendWith(MockitoExtension.class)
class UserSearchServiceTest {

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    private UserSearchService userSearchService;

    @BeforeEach
    void setUp() {
        userSearchService = new UserSearchService(memberRepository, projectAccessService);
    }

    @Test
    void searchUsersByEmail_returnsTrimmedSearchResults() {
        UUID currentUserId = UUID.randomUUID();
        UUID targetUserId = UUID.randomUUID();
        // 검색 결과로 반환될 ACTIVE 사용자
        Member targetMember = createMember(targetUserId, "kim@example.com", "김건우", UserType.CUSTOMER);

        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
        // service가 검색어 양 끝 공백을 제거한 뒤 repository를 호출하는지 확인한다.
        given(memberRepository.searchActiveMembersByEmailKeywordExcludingCurrentUser(
                eq("Kim"),
                eq(UserStatus.ACTIVE),
                eq(currentUserId),
                eq(PageRequest.of(0, 10))
        )).willReturn(List.of(targetMember));

        List<UserSearchResponse> responses = userSearchService.searchUsersByEmail("  Kim  ");

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).userId()).isEqualTo(targetUserId);
        assertThat(responses.get(0).name()).isEqualTo("김건우");
        assertThat(responses.get(0).email()).isEqualTo("kim@example.com");
        assertThat(responses.get(0).userType()).isEqualTo(UserType.CUSTOMER);
    }

    @Test
    void searchUsersByEmail_throwsInvalidRequestWhenEmailIsBlank() {
        // 공백 검색어는 repository 호출 전에 바로 차단한다.
        assertThatThrownBy(() -> userSearchService.searchUsersByEmail("   "))
                .isInstanceOf(CustomException.class)
                .satisfies(exception -> {
                    CustomException customException = (CustomException) exception;
                    assertThat(customException.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST);
                    assertThat(customException.getMessage()).isEqualTo("email: 공백일 수 없습니다.");
                });

        then(projectAccessService).shouldHaveNoInteractions();
        then(memberRepository).shouldHaveNoInteractions();
    }

    private Member createMember(UUID userId, String email, String name, UserType userType) {
        Member member = Member.create(email, "hashed-password", name, userType);
        // 테스트에서는 저장 과정을 생략하므로 Reflection으로 식별자를 주입한다.
        ReflectionTestUtils.setField(member, "userId", userId);
        return member;
    }
}
