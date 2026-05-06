package com.a204.batang.domain.ifcedit.service;

import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class IfcEditStoragePathBuilder {
    private static final String PROJECTS_PREFIX = "projects/";
    private static final String REVISIONS_SEGMENT = "/revisions/";
    private static final String JOBS_SEGMENT = "/jobs/";
    private static final String STEPS_SEGMENT = "/steps/";

    public String buildSourceIfcStorageUrl(UUID projectId, UUID revisionId) {
        return PROJECTS_PREFIX + projectId + REVISIONS_SEGMENT + revisionId + "/ifc/model.v1.ifc";
    }

    public String buildOutputIfcStorageUrl(UUID projectId, UUID revisionId) {
        return PROJECTS_PREFIX + projectId + REVISIONS_SEGMENT + revisionId + "/ifc/model.v1.ifc";
    }

    public String buildSceneSnapshotStorageUrl(UUID projectId, UUID revisionId, String sceneType) {
        return PROJECTS_PREFIX + projectId + REVISIONS_SEGMENT + revisionId + "/" + sceneType + "/snapshot.v1.json";
    }

    public String buildValidationReportStorageUrl(UUID projectId, UUID jobId, int stepNo) {
        return PROJECTS_PREFIX + projectId + JOBS_SEGMENT + jobId + STEPS_SEGMENT + formatStepNo(stepNo)
                + "/engine/validation-report.v1.json";
    }

    public String buildTwoDPlannerOutputStorageUrl(UUID projectId, UUID jobId, int stepNo) {
        return PROJECTS_PREFIX + projectId + JOBS_SEGMENT + jobId + STEPS_SEGMENT + formatStepNo(stepNo)
                + "/planner/2d-command.v1.json";
    }

    public String buildThreeDPlannerOutputStorageUrl(UUID projectId, UUID jobId, int stepNo) {
        return PROJECTS_PREFIX + projectId + JOBS_SEGMENT + jobId + STEPS_SEGMENT + formatStepNo(stepNo)
                + "/planner/3d-command.v1.json";
    }

    private String formatStepNo(int stepNo) {
        return String.format("%03d", stepNo);
    }
}
