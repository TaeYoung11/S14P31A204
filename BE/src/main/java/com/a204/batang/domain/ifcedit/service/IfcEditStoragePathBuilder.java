package com.a204.batang.domain.ifcedit.service;

import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class IfcEditStoragePathBuilder {

    public String buildSourceIfcStorageUrl(UUID projectId, UUID revisionId) {
        return "projects/" + projectId + "/revisions/" + revisionId + "/model.ifc";
    }

    public String buildOutputIfcStorageUrl(UUID projectId, UUID revisionId) {
        return "projects/" + projectId + "/revisions/" + revisionId + "/model.ifc";
    }

    public String buildSceneSnapshotStorageUrl(UUID projectId, UUID revisionId) {
        return "projects/" + projectId + "/revisions/" + revisionId + "/scene-ifc.json";
    }

    public String buildValidationReportStorageUrl(UUID jobId, int stepNo) {
        return "jobs/" + jobId + "/steps/" + stepNo + "/validation-report.json";
    }

    public String buildEditPlanStorageUrl(UUID jobId) {
        return "jobs/" + jobId + "/steps/1/edit-plan.json";
    }
}
