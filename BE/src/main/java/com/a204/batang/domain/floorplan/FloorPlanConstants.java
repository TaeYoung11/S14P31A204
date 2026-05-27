package com.a204.batang.domain.floorplan;

/**
 * Floor-plan generate 도메인에서 공통으로 사용하는 상수 모음이다.
 */
public final class FloorPlanConstants {

    public static final String JOB_TYPE_IFC_GENERATE_FROM_BUBBLE = "IFC_GENERATE_FROM_BUBBLE";
    public static final String WORKER_TYPE_IFC_GENERATE_FROM_BUBBLE = "IFC_GENERATE_FROM_BUBBLE";
    public static final String SOURCE_SCENE_TYPE_LAYOUT_IMPORT = "LAYOUT_IMPORT";

    public static final String COMMAND_TYPE_IFC_GENERATE_FROM_BUBBLE = "IFC_GENERATE_FROM_BUBBLE";
    public static final String COMMAND_ROUTING_KEY_IFC_GENERATE_FROM_BUBBLE = "command.ifc-generate.from-bubble";
    public static final String COMMAND_BINDING_PATTERN_IFC_GENERATE = "command.ifc-generate.*";

    public static final String EVENT_PREFIX_IFC_GENERATE_FROM_BUBBLE = "IFC_GENERATE_FROM_BUBBLE_";
    public static final String EVENT_TYPE_IFC_GENERATE_STARTED = "IFC_GENERATE_FROM_BUBBLE_STARTED";
    public static final String EVENT_TYPE_IFC_GENERATE_PROGRESS = "IFC_GENERATE_FROM_BUBBLE_PROGRESS";
    public static final String EVENT_TYPE_IFC_GENERATE_COMPLETED = "IFC_GENERATE_FROM_BUBBLE_COMPLETED";
    public static final String EVENT_TYPE_IFC_GENERATE_FAILED = "IFC_GENERATE_FROM_BUBBLE_FAILED";

    public static final String SSE_FLOOR_PLAN_QUEUED = "FLOOR_PLAN_GENERATE_QUEUED";
    public static final String SSE_FLOOR_PLAN_STARTED = "FLOOR_PLAN_GENERATE_STARTED";
    public static final String SSE_FLOOR_PLAN_PROGRESS = "FLOOR_PLAN_GENERATE_PROGRESS";
    public static final String SSE_FLOOR_PLAN_COMPLETED = "FLOOR_PLAN_GENERATE_COMPLETED";
    public static final String SSE_FLOOR_PLAN_FAILED = "FLOOR_PLAN_GENERATE_FAILED";

    public static final String ARTIFACT_TYPE_IFC_MODEL = "IFC_MODEL";
    public static final String ARTIFACT_TYPE_VALIDATION_REPORT = "VALIDATION_REPORT";

    public static final String INPUT_SOURCE_RAW_REQUEST = "RAW_REQUEST";
    public static final String INPUT_SOURCE_WORKSPACE_SNAPSHOT = "WORKSPACE_SNAPSHOT";

    private FloorPlanConstants() {
    }
}
