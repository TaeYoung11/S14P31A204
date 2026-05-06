package com.a204.batang.domain.auth.repository;

import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /**
     * 테스트 계정을 users 테이블에 native SQL로 직접 생성한다.
     * 동일 이메일이 이미 존재하면 생성을 건너뛴다.
     *
     * @param userId 회원 ID
     * @param email 이메일
     * @param passwordHash 암호화 비밀번호
     * @param name 회원 이름
     * @param userType 회원 유형
     * @param status 회원 상태
     * @return 생성 성공 시 1, 중복으로 건너뛴 경우 0
     */
    @Modifying
    @Query(value = """
            INSERT INTO users (
                user_id,
                email,
                password_hash,
                name,
                user_type,
                status,
                created_at,
                updated_at
            ) VALUES (
                :userId,
                :email,
                :passwordHash,
                :name,
                :userType,
                :status,
                now(),
                now()
            )
            ON CONFLICT (email) DO NOTHING
            """, nativeQuery = true)
    int insertTestUser(
            @Param("userId") UUID userId,
            @Param("email") String email,
            @Param("passwordHash") String passwordHash,
            @Param("name") String name,
            @Param("userType") String userType,
            @Param("status") String status
    );
}
