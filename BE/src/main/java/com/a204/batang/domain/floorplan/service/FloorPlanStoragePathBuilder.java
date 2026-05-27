package com.a204.batang.domain.floorplan.service;

import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class FloorPlanStoragePathBuilder {

    /**
     * 생성될 IFC 결과물의 storage 경로를 조립한다.
     *
     * @param projectId 프로젝트 식별자
     * @param revisionId revision 식별자
     * @return IFC storage 경로
     */
    public String buildIfcStorageUrl(UUID projectId, UUID revisionId) {
        return "projects/" + projectId + "/revisions/" + revisionId + "/ifc/model.v1.ifc";
    }

    /**
     * validation report storage 경로를 조립한다.
     *
     * @param jobId job 식별자
     * @param stepNo step 번호
     * @return validation report storage 경로
     */
    public String buildValidationReportStorageUrl(UUID projectId, UUID jobId, int stepNo) {
        return "projects/" + projectId
                + "/jobs/" + jobId
                + "/steps/" + formatStepNo(stepNo)
                + "/engine/validation-report.v1.json";
    }

    String formatStepNo(int stepNo) {
        return "%03d".formatted(stepNo);
    }
}
