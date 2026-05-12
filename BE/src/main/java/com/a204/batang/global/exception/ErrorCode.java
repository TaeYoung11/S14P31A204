package com.a204.batang.global.exception;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum ErrorCode {

    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_INTERNAL_SERVER_ERROR", "서버 내부 오류가 발생했습니다."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "COMMON_INVALID_REQUEST", "잘못된 요청입니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "COMMON_UNAUTHORIZED", "인증이 필요합니다."),
    FORBIDDEN_ACCESS(HttpStatus.FORBIDDEN, "COMMON_FORBIDDEN_ACCESS", "접근 권한이 없습니다."),
    TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "COMMON_TOO_MANY_REQUESTS", "요청 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요."),
    CONCURRENT_MODIFICATION(HttpStatus.CONFLICT, "COMMON_CONCURRENT_MODIFICATION", "동시 수정 충돌이 발생했습니다. 화면을 새로고침 후 다시 시도해 주세요."),

    EXISTING_EMAIL(HttpStatus.CONFLICT, "USER_EXISTING_EMAIL", "이미 사용 중인 이메일입니다."),

    PROJECT_NOT_FOUND(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다."),
    JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "JOB_NOT_FOUND", "작업을 찾을 수 없습니다."),
    JOB_RESULT_PRESIGN_FAILED(HttpStatus.BAD_GATEWAY, "JOB_RESULT_PRESIGN_FAILED", "작업 결과 URL 생성에 실패했습니다."),
    WORKSPACE_INVALID_PHASE(HttpStatus.CONFLICT, "WORKSPACE_INVALID_PHASE", "현재 워크스페이스 상태에서는 요청을 수행할 수 없습니다."),
    WORKSPACE_BUBBLE_SNAPSHOT_INVALID(HttpStatus.BAD_REQUEST, "WORKSPACE_BUBBLE_SNAPSHOT_INVALID", "버블 스냅샷 데이터 구조가 올바르지 않습니다."),
    WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID(HttpStatus.CONFLICT, "WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID", "Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다."),
    WORKSPACE_BUBBLE_CACHE_SAVE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "WORKSPACE_BUBBLE_CACHE_SAVE_FAILED", "버블 스냅샷 Redis 저장에 실패했습니다."),
    WORKSPACE_BUBBLE_CACHE_READ_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "WORKSPACE_BUBBLE_CACHE_READ_FAILED", "버블 스냅샷 Redis 조회에 실패했습니다."),
    WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID(HttpStatus.CONFLICT, "WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID", "Floor-plan Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다."),
    WORKSPACE_FLOOR_PLAN_CACHE_SAVE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "WORKSPACE_FLOOR_PLAN_CACHE_SAVE_FAILED", "Floor-plan 스냅샷 Redis 저장에 실패했습니다."),
    WORKSPACE_FLOOR_PLAN_CACHE_READ_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "WORKSPACE_FLOOR_PLAN_CACHE_READ_FAILED", "Floor-plan 스냅샷 Redis 조회에 실패했습니다."),
    WORKSPACE_IFC_EXPORT_SOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "WORKSPACE_IFC_EXPORT_SOURCE_NOT_FOUND", "내보낼 IFC 파일을 찾을 수 없습니다."),
    WORKSPACE_IFC_EXPORT_URL_INVALID(HttpStatus.BAD_REQUEST, "WORKSPACE_IFC_EXPORT_URL_INVALID", "IFC 저장 경로 형식이 올바르지 않습니다."),
    WORKSPACE_IFC_EXPORT_PRESIGN_FAILED(HttpStatus.BAD_GATEWAY, "WORKSPACE_IFC_EXPORT_PRESIGN_FAILED", "IFC 다운로드 URL 생성에 실패했습니다."),
    PIN_NOT_FOUND(HttpStatus.NOT_FOUND, "PIN_NOT_FOUND", "핀을 찾을 수 없습니다."),
    COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "COMMENT_NOT_FOUND", "댓글을 찾을 수 없습니다."),
    PROJECT_DELETE_TARGET_NOT_FOUND(HttpStatus.NOT_FOUND, "PROJECT_DELETE_TARGET_NOT_FOUND", "삭제 대상 프로젝트를 찾을 수 없습니다."),
    PROJECT_SITE_INFO_FETCH_FAILED(HttpStatus.BAD_GATEWAY, "PROJECT_SITE_INFO_FETCH_FAILED", "대지 정보를 가져오지 못했습니다."),
    INVITEE_NOT_FOUND(HttpStatus.NOT_FOUND, "INVITEE_NOT_FOUND", "초대할 사용자를 찾을 수 없습니다."),
    USER_NOT_ACTIVE(HttpStatus.CONFLICT, "USER_NOT_ACTIVE", "비활성 사용자에게는 초대할 수 없습니다."),
    SELF_INVITATION_NOT_ALLOWED(HttpStatus.CONFLICT, "SELF_INVITATION_NOT_ALLOWED", "자기 자신은 초대할 수 없습니다."),
    PROJECT_MEMBER_ALREADY_EXISTS(HttpStatus.CONFLICT, "PROJECT_MEMBER_ALREADY_EXISTS", "이미 프로젝트 멤버입니다."),
    OWNER_REMOVAL_NOT_ALLOWED(HttpStatus.CONFLICT, "OWNER_REMOVAL_NOT_ALLOWED", "프로젝트 소유자는 멤버에서 제거할 수 없습니다."),
    PROJECT_MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "PROJECT_MEMBER_NOT_FOUND", "해당 프로젝트 멤버를 찾을 수 없습니다."),

    RENDER_SOURCE_NOT_FOUND(HttpStatus.CONFLICT, "RENDER_SOURCE_NOT_FOUND", "렌더링할 IFC 모델이 없습니다."),
    RENDER_JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "RENDER_JOB_NOT_FOUND", "렌더링 작업을 찾을 수 없습니다."),
    RENDER_STEP_NOT_FOUND(HttpStatus.NOT_FOUND, "RENDER_STEP_NOT_FOUND", "렌더링 작업 단계를 찾을 수 없습니다."),
    RENDER_EVENT_INVALID(HttpStatus.BAD_REQUEST, "RENDER_EVENT_INVALID", "렌더링 이벤트 메시지가 올바르지 않습니다."),
    RENDER_COMMAND_PUBLISH_FAILED(HttpStatus.BAD_GATEWAY, "RENDER_COMMAND_PUBLISH_FAILED", "렌더링 작업 요청 발행에 실패했습니다."),
    RENDER_IMAGE_PRESIGN_FAILED(HttpStatus.BAD_GATEWAY, "RENDER_IMAGE_PRESIGN_FAILED", "렌더링 이미지 URL 생성에 실패했습니다."),

    FLOOR_PLAN_LAYOUT_INVALID(HttpStatus.BAD_REQUEST, "FLOOR_PLAN_LAYOUT_INVALID", "Floor-plan layout payload가 올바르지 않습니다."),
    FLOOR_PLAN_SNAPSHOT_NOT_FOUND(HttpStatus.CONFLICT, "FLOOR_PLAN_SNAPSHOT_NOT_FOUND", "Floor-plan 생성에 필요한 workspace snapshot이 없습니다."),
    FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED(HttpStatus.BAD_REQUEST, "FLOOR_PLAN_SNAPSHOT_CONVERSION_FAILED", "Workspace snapshot을 layout import로 변환하지 못했습니다."),
    FLOOR_PLAN_OUTPUT_MISSING(HttpStatus.BAD_REQUEST, "FLOOR_PLAN_OUTPUT_MISSING", "Floor-plan worker output의 필수 값이 누락되었습니다."),
    FLOOR_PLAN_OUTPUT_VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "FLOOR_PLAN_OUTPUT_VALIDATION_FAILED", "Floor-plan worker output 검증에 실패했습니다."),
    FLOOR_PLAN_JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "FLOOR_PLAN_JOB_NOT_FOUND", "Floor-plan 작업을 찾을 수 없습니다."),
    FLOOR_PLAN_STEP_NOT_FOUND(HttpStatus.NOT_FOUND, "FLOOR_PLAN_STEP_NOT_FOUND", "Floor-plan 작업 단계를 찾을 수 없습니다."),
    FLOOR_PLAN_REVISION_NOT_FOUND(HttpStatus.NOT_FOUND, "FLOOR_PLAN_REVISION_NOT_FOUND", "Floor-plan revision을 찾을 수 없습니다."),
    FLOOR_PLAN_COMMAND_PUBLISH_FAILED(HttpStatus.BAD_GATEWAY, "FLOOR_PLAN_COMMAND_PUBLISH_FAILED", "Floor-plan 작업 요청 발행에 실패했습니다."),
    FLOOR_PLAN_COMMAND_CONFIRM_NACK(HttpStatus.BAD_GATEWAY, "FLOOR_PLAN_COMMAND_CONFIRM_NACK", "Floor-plan command가 RabbitMQ exchange로 전달되지 못했습니다."),
    FLOOR_PLAN_COMMAND_RETURNED(HttpStatus.BAD_GATEWAY, "FLOOR_PLAN_COMMAND_RETURNED", "Floor-plan command가 queue로 라우팅되지 못하고 반환되었습니다."),
    FLOOR_PLAN_EVENT_INVALID(HttpStatus.BAD_REQUEST, "FLOOR_PLAN_EVENT_INVALID", "Floor-plan worker event가 올바르지 않습니다."),
    FLOOR_PLAN_EVENT_SCHEMA_MISMATCH(HttpStatus.BAD_REQUEST, "FLOOR_PLAN_EVENT_SCHEMA_MISMATCH", "Floor-plan worker event schema가 기대 값과 일치하지 않습니다."),

    IFC_EDIT_JOB_CONFLICT(HttpStatus.CONFLICT, "IFC_EDIT_JOB_CONFLICT", "진행 중인 IFC 편집 작업이 이미 존재합니다."),
    IFC_EDIT_JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "IFC_EDIT_JOB_NOT_FOUND", "IFC 편집 작업을 찾을 수 없습니다."),
    IFC_EDIT_STEP_NOT_FOUND(HttpStatus.NOT_FOUND, "IFC_EDIT_STEP_NOT_FOUND", "IFC 편집 작업 단계를 찾을 수 없습니다."),
    IFC_EDIT_REVISION_NOT_FOUND(HttpStatus.NOT_FOUND, "IFC_EDIT_REVISION_NOT_FOUND", "IFC 편집 revision을 찾을 수 없습니다."),
    IFC_EDIT_SOURCE_NOT_FOUND(HttpStatus.CONFLICT, "IFC_EDIT_SOURCE_NOT_FOUND", "IFC 편집에 필요한 소스 revision이 없습니다."),
    IFC_EDIT_COMMAND_PUBLISH_FAILED(HttpStatus.BAD_GATEWAY, "IFC_EDIT_COMMAND_PUBLISH_FAILED", "IFC 편집 작업 요청 발행에 실패했습니다."),
    IFC_EDIT_COMMAND_CONFIRM_NACK(HttpStatus.BAD_GATEWAY, "IFC_EDIT_COMMAND_CONFIRM_NACK", "IFC 편집 command가 RabbitMQ exchange로 전달되지 못했습니다."),
    IFC_EDIT_COMMAND_RETURNED(HttpStatus.BAD_GATEWAY, "IFC_EDIT_COMMAND_RETURNED", "IFC 편집 command가 queue로 라우팅되지 못하고 반환되었습니다."),
    IFC_EDIT_COMMAND_DLQ(HttpStatus.BAD_GATEWAY, "IFC_EDIT_COMMAND_DLQ", "IFC 편집 작업이 실패했습니다. 편집 전 상태로 복구했습니다."),
    IFC_EDIT_EVENT_INVALID(HttpStatus.BAD_REQUEST, "IFC_EDIT_EVENT_INVALID", "IFC 편집 worker event가 올바르지 않습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
