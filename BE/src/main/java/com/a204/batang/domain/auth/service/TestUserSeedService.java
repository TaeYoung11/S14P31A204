package com.a204.batang.domain.auth.service;

import com.a204.batang.domain.auth.dto.response.SeedTestUsersResponse;
import com.a204.batang.domain.auth.entity.UserStatus;
import com.a204.batang.domain.auth.entity.UserType;
import com.a204.batang.domain.auth.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * 핀/댓글 테스트를 위한 계정 시드 데이터를 생성하는 서비스다.
 * 이메일 인증 절차를 건너뛰기 위해 users 테이블에 native SQL로 직접 삽입한다.
 */
@Service
@RequiredArgsConstructor
public class TestUserSeedService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * 테스트 계정 6명을 일괄 생성한다.
     * 이미 동일 이메일이 있으면 해당 계정은 건너뛴다.
     *
     * @return 시드 생성 결과
     */
    @Transactional
    public SeedTestUsersResponse seedUsers() {
        List<SeedTestUsersResponse.SeededUser> users = List.of(
                new SeedTestUsersResponse.SeededUser("test1@test.com", "password1", "건축가1", UserType.DESIGNER),
                new SeedTestUsersResponse.SeededUser("test2@test.com", "password2", "건축가2", UserType.DESIGNER),
                new SeedTestUsersResponse.SeededUser("test3@test.com", "password3", "건축가3", UserType.DESIGNER),
                new SeedTestUsersResponse.SeededUser("test4@test.com", "password4", "일반 사용자1", UserType.CUSTOMER),
                new SeedTestUsersResponse.SeededUser("test5@test.com", "password5", "일반 사용자2", UserType.CUSTOMER),
                new SeedTestUsersResponse.SeededUser("test6@test.com", "password6", "일반 사용자3", UserType.CUSTOMER)
        );

        int createdCount = 0;
        for (SeedTestUsersResponse.SeededUser user : users) {
            int inserted = memberRepository.insertTestUser(
                    UUID.randomUUID(),
                    user.email(),
                    passwordEncoder.encode(user.password()),
                    user.name(),
                    user.userType().name(),
                    UserStatus.ACTIVE.name()
            );
            createdCount += inserted;
        }

        return new SeedTestUsersResponse(
                users.size(),
                createdCount,
                users.size() - createdCount,
                users
        );
    }
}
