package com.a204.batang.domain.auth.repository;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserStatus;
import com.a204.batang.domain.auth.entity.UserType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class MemberRepositoryTest {

    @Autowired
    private MemberRepository memberRepository;

    @Test
    void searchActiveMembersByEmailKeywordExcludingCurrentUser_filtersByAllConditions() {
        Member currentUser = persistMember("owner@example.com", "오너", UserType.DESIGNER, UserStatus.ACTIVE);
        Member matchingActiveUser = persistMember("Kim@example.com", "김건우", UserType.CUSTOMER, UserStatus.ACTIVE);
        Member otherActiveUser = persistMember("park@example.com", "박민수", UserType.CUSTOMER, UserStatus.ACTIVE);
        Member withdrawnUser = persistMember("kim-withdrawn@example.com", "탈퇴회원", UserType.CUSTOMER, UserStatus.WITHDRAWN);

        List<Member> results = memberRepository.searchActiveMembersByEmailKeywordExcludingCurrentUser(
                "kim",
                UserStatus.ACTIVE,
                currentUser.getUserId(),
                PageRequest.of(0, 10)
        );

        assertThat(results)
                .extracting(Member::getUserId)
                .containsExactly(matchingActiveUser.getUserId());
        assertThat(results)
                .extracting(Member::getUserId)
                .doesNotContain(currentUser.getUserId(), otherActiveUser.getUserId(), withdrawnUser.getUserId());
    }

    @Test
    void searchActiveMembersByEmailKeywordExcludingCurrentUser_appliesPageLimitAndSortOrder() {
        Member currentUser = persistMember("owner@example.com", "오너", UserType.DESIGNER, UserStatus.ACTIVE);
        Member alpha = persistMember("alpha@example.com", "알파", UserType.CUSTOMER, UserStatus.ACTIVE);
        Member beta = persistMember("beta@example.com", "베타", UserType.CUSTOMER, UserStatus.ACTIVE);
        persistMember("gamma@example.com", "감마", UserType.CUSTOMER, UserStatus.ACTIVE);

        List<Member> results = memberRepository.searchActiveMembersByEmailKeywordExcludingCurrentUser(
                "example",
                UserStatus.ACTIVE,
                currentUser.getUserId(),
                PageRequest.of(0, 2)
        );

        // 이메일 오름차순 정렬 후 최대 2건만 반환되어야 한다.
        assertThat(results)
                .extracting(Member::getUserId)
                .containsExactly(alpha.getUserId(), beta.getUserId());
    }

    private Member persistMember(String email, String name, UserType userType, UserStatus status) {
        Member member = Member.create(email, "hashed-password", name, userType);
        Member savedMember = memberRepository.saveAndFlush(member);
        if (status != UserStatus.ACTIVE) {
            ReflectionTestUtils.setField(savedMember, "status", status);
            savedMember = memberRepository.saveAndFlush(savedMember);
        }
        return savedMember;
    }
}
