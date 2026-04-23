# 백엔드 공통(Global) + Swagger 작업 정리

작성일: 2026-04-22  
프로젝트: `C:\ssafy\final\S14P31A204\BE`

## 1. 작업 목적
- `global` 공통 계층(응답/예외/엔티티 감사) 안정화
- 에러 응답 형식 통일
- Swagger(OpenAPI) 문서화 환경 추가
- Spring Security 환경에서 Swagger 접근 가능하도록 보안 경로 정리

## 2. 핵심 변경 사항

### 2.1 ErrorCode 개선
파일: `src/main/java/com/a204/batang/global/exception/ErrorCode.java`

- 기존: `status`, `message`
- 변경: `status`, `code`, `message`
- 예시 코드:
  - `COMMON_INTERNAL_SERVER_ERROR`
  - `COMMON_INVALID_REQUEST`
  - `COMMON_FORBIDDEN_ACCESS`
  - `USER_EXISTING_EMAIL`

변경 이유:
- 프론트/클라이언트가 안정적으로 분기할 수 있도록 고유 문자열 코드 필요

---

### 2.2 ErrorResponse 구조 통일
파일: `src/main/java/com/a204/batang/global/exception/ErrorResponse.java`

- 기존: `code(ErrorCode 객체)`, `message`
- 변경: `status(int)`, `code(String)`, `message(String)`

변경 이유:
- 에러 응답을 직렬화 친화적으로 단순화
- 프론트에서 `code` 문자열 기준 분기 용이

---

### 2.3 CustomException 개선
파일: `src/main/java/com/a204/batang/global/exception/CustomException.java`

- `super(errorCode.getMessage())` 호출 추가
- `(ErrorCode, String message)` 오버로드 생성자 추가

변경 이유:
- 로그/디버깅 시 예외 메시지 추적성 개선

---

### 2.4 GlobalExceptionHandler 보강
파일: `src/main/java/com/a204/batang/global/exception/controller/GlobalExceptionHandler.java`

추가/정리된 처리:
- `MethodArgumentNotValidException` -> 400
- `ConstraintViolationException` -> 400
- `HttpMessageNotReadableException` -> 400
- `MethodArgumentTypeMismatchException` -> 400
- `CustomException` -> ErrorCode 기반 상태/코드/메시지 반환
- 그 외 `Exception` -> 500

변경 이유:
- 검증/파싱 오류가 500으로 뭉개지지 않게 명확히 분리

---

### 2.5 BaseEntity Auditing 방식 통일
파일:
- `src/main/java/com/a204/batang/global/common/entity/BaseEntity.java`
- `src/main/java/com/a204/batang/BackApplication.java`

변경:
- `@CreationTimestamp`, `@UpdateTimestamp` -> `@CreatedDate`, `@LastModifiedDate`
- `@EnableJpaAuditing` 활성화

변경 이유:
- Spring Data JPA Auditing 기준으로 일관화

---

### 2.6 Swagger 추가
파일:
- `build.gradle`
- `src/main/java/com/a204/batang/global/config/SwaggerConfig.java`
- `src/main/java/com/a204/batang/global/config/SecurityConfig.java`

변경:
- 의존성 추가: `org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.8`
- OpenAPI 문서 기본 정보 설정
- Swagger 경로 인증 예외 허용:
  - `/swagger-ui.html`
  - `/swagger-ui/**`
  - `/v3/api-docs/**`

접속 URL:
- `http://localhost:8080/swagger-ui/index.html`
- `http://localhost:8080/v3/api-docs`

## 3. 응답 구조 최종 정리

### 3.1 성공 응답 (`ApiResponse`)
```json
{
  "status": 200,
  "message": "성공",
  "data": {}
}
```

### 3.2 실패 응답 (`ErrorResponse`)
```json
{
  "status": 400,
  "code": "COMMON_INVALID_REQUEST",
  "message": "요청 본문 형식이 올바르지 않습니다."
}
```

정책:
- 성공: `ApiResponse`
- 실패: `ErrorResponse`

## 4. 확인된 이슈/주의사항

### 4.1 테스트 실패 원인 (현재 미해결)
- `BackApplicationTests.contextLoads()` 실패
- 원인: DataSource 설정 부재
- 에러 핵심:
  - `Failed to configure a DataSource: 'url' attribute is not specified`
  - `Failed to determine a suitable driver class`

정리:
- 코드 컴파일 문제는 아님
- 테스트 환경 DB 설정 문제

---

### 4.2 Swagger 보안 스키마 관련 메모
- 현재 `SwaggerConfig`에서 `components(jwtAuth)`는 유지 가능
- `addSecurityItem(...)`는 전역 JWT 요구 표시라, 실제 인증 방식과 맞지 않으면 제거 권장

## 5. 체크리스트
- [x] ErrorCode 고유 문자열 코드 추가
- [x] ErrorResponse 형식 통일(status/code/message)
- [x] CustomException 메시지 추적 개선
- [x] 검증/파싱 예외 400 처리 추가
- [x] BaseEntity Auditing 통일
- [x] `@EnableJpaAuditing` 적용
- [x] Swagger 의존성/설정 추가
- [x] Swagger 경로 보안 허용
- [x] `compileJava` 성공
- [ ] `test` 성공 (DB 테스트 설정 필요)

## 6. 다음 권장 작업
1. 테스트 전용 DB 프로필 구성 (`application-test.properties` + H2 또는 테스트 DB)
2. 인증 전략 확정 후 Swagger 보안 스키마(Bearer 전역 적용 여부) 최종 정리
3. 도메인 API 추가 시 `@Operation`, `@Tag` 등 문서 어노테이션 점진적 적용
