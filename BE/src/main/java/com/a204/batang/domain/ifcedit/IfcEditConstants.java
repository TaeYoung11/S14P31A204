package com.a204.batang.domain.ifcedit;

public final class IfcEditConstants {

    public static final String JOB_TYPE_IFC_EDIT = "IFC_EDIT";
    public static final String JOB_TYPE_TWO_D_TO_IFC_EDIT = "TWO_D_TO_IFC_EDIT";
    public static final String JOB_TYPE_THREE_D_TO_IFC_EDIT = "THREE_D_TO_IFC_EDIT";

    public static final String WORKER_TYPE_IFC_EDIT_APPLY = "IFC_EDIT_APPLY";
    public static final String WORKER_TYPE_TWO_D_LLM = "TWO_D_LLM";
    public static final String WORKER_TYPE_THREE_D_LLM = "THREE_D_LLM";

    public static final String COMMAND_TYPE_IFC_EDIT_APPLY = "IFC_EDIT_APPLY";
    public static final String COMMAND_TYPE_TWO_D_LLM_GENERATE = "TWO_D_LLM_GENERATE";
    public static final String COMMAND_TYPE_THREE_D_LLM_GENERATE = "THREE_D_LLM_GENERATE";

    public static final String EVENT_PREFIX_IFC_EDIT_APPLY = "IFC_EDIT_APPLY_";
    public static final String EVENT_PREFIX_TWO_D_LLM = "TWO_D_LLM_";
    public static final String EVENT_PREFIX_THREE_D_LLM = "THREE_D_LLM_";

    public static final String EVENT_IFC_EDIT_APPLY_STARTED = "IFC_EDIT_APPLY_STARTED";
    public static final String EVENT_IFC_EDIT_APPLY_PROGRESS = "IFC_EDIT_APPLY_PROGRESS";
    public static final String EVENT_IFC_EDIT_APPLY_COMPLETED = "IFC_EDIT_APPLY_COMPLETED";
    public static final String EVENT_IFC_EDIT_APPLY_FAILED = "IFC_EDIT_APPLY_FAILED";
    public static final String EVENT_TWO_D_LLM_STARTED = "TWO_D_LLM_STARTED";
    public static final String EVENT_TWO_D_LLM_PROGRESS = "TWO_D_LLM_PROGRESS";
    public static final String EVENT_TWO_D_LLM_COMPLETED = "TWO_D_LLM_COMPLETED";
    public static final String EVENT_TWO_D_LLM_FAILED = "TWO_D_LLM_FAILED";
    public static final String EVENT_TWO_D_LLM_CLARIFICATION_REQUIRED = "TWO_D_LLM_CLARIFICATION_REQUIRED";
    public static final String EVENT_THREE_D_LLM_STARTED = "THREE_D_LLM_STARTED";
    public static final String EVENT_THREE_D_LLM_PROGRESS = "THREE_D_LLM_PROGRESS";
    public static final String EVENT_THREE_D_LLM_COMPLETED = "THREE_D_LLM_COMPLETED";
    public static final String EVENT_THREE_D_LLM_FAILED = "THREE_D_LLM_FAILED";

    public static final String ARTIFACT_TYPE_IFC_MODEL = "IFC_MODEL";
    public static final String ARTIFACT_TYPE_VALIDATION_REPORT = "VALIDATION_REPORT";
    public static final String ARTIFACT_TYPE_EDIT_PLAN = "EDIT_PLAN";

    // Scene types
    public static final String SCENE_TYPE_IFC_MODEL = "IFC_MODEL";

    public static final String SSE_IFC_EDIT_QUEUED = "IFC_EDIT_QUEUED";
    public static final String SSE_IFC_EDIT_STARTED = "IFC_EDIT_STARTED";
    public static final String SSE_IFC_EDIT_PROGRESS = "IFC_EDIT_PROGRESS";
    public static final String SSE_IFC_EDIT_COMPLETED = "IFC_EDIT_COMPLETED";
    public static final String SSE_IFC_EDIT_FAILED = "IFC_EDIT_FAILED";

    public static final int TOTAL_STEPS_DIRECT = 1;
    public static final int TOTAL_STEPS_LLM = 2;

    public static final int ATTEMPT_NO = 1;
    public static final int MAX_ATTEMPTS = 3;
    public static final String MESSAGE_SCHEMA_VERSION = "v1";
    public static final String MESSAGE_TYPE_COMMAND = "COMMAND";

    private IfcEditConstants() {}
}
