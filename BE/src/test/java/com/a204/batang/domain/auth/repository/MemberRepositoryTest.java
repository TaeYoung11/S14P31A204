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
        Member currentUser = persistMember("owner@example.com", "Owner", UserType.DESIGNER, UserStatus.ACTIVE);
        Member matchingActiveUser = persistMember("Kim@example.com", "Kim", UserType.CUSTOMER, UserStatus.ACTIVE);
        Member otherActiveUser = persistMember("park@example.com", "Park", UserType.CUSTOMER, UserStatus.ACTIVE);
        Member withdrawnUser = persistMember("kim-withdrawn@example.com", "Withdrawn", UserType.CUSTOMER, UserStatus.WITHDRAWN);

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
        Member currentUser = persistMember("owner@example.com", "Owner", UserType.DESIGNER, UserStatus.ACTIVE);
        Member alpha = persistMember("alpha@example.com", "Alpha", UserType.CUSTOMER, UserStatus.ACTIVE);
        Member beta = persistMember("beta@example.com", "Beta", UserType.CUSTOMER, UserStatus.ACTIVE);
        persistMember("gamma@example.com", "Gamma", UserType.CUSTOMER, UserStatus.ACTIVE);

        List<Member> results = memberRepository.searchActiveMembersByEmailKeywordExcludingCurrentUser(
                "example",
                UserStatus.ACTIVE,
                currentUser.getUserId(),
                PageRequest.of(0, 2)
        );

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
