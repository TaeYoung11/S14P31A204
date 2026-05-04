package com.a204.batang.domain.auth.repository;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * 회원 영속성 처리를 담당하는 Repository다.
 */
public interface MemberRepository extends JpaRepository<Member, UUID> {

    /**
     * 이메일로 회원을 조회한다.
     *
     * @param email 이메일
     * @return 회원 Optional
     */
    Optional<Member> findByEmail(String email);

    /**
     * 특정 상태의 이메일 존재 여부를 확인한다.
     *
     * @param email 이메일
     * @param status 회원 상태
     * @return 존재 여부
     */
    boolean existsByEmailAndStatus(String email, UserStatus status);

    /**
     * 회원 ID와 상태로 회원을 조회한다.
     *
     * @param userId 회원 ID
     * @param status 회원 상태
     * @return 회원 Optional
     */
    Optional<Member> findByUserIdAndStatus(UUID userId, UserStatus status);
}
