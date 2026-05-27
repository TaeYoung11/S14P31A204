package com.a204.batang.domain.floorplan.messaging;

import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;
import lombok.Getter;
import org.springframework.amqp.rabbit.connection.CorrelationData;

import java.util.UUID;

/**
 * Floor-plan command publish confirm/returned 처리에 사용할 correlation data이다.
 */
@Getter
public class FloorPlanGenerateCorrelationData extends CorrelationData {

    private final FloorPlanGenerateCommandMessage message;
    private final UUID jobId;
    private final UUID jobStepId;
    private final UUID targetRevisionId;

    public FloorPlanGenerateCorrelationData(String id, FloorPlanGenerateCommandMessage message) {
        super(id);
        this.message = message;
        this.jobId = message.jobId();
        this.jobStepId = message.jobStepId();
        this.targetRevisionId = message.targetRevisionId();
    }
}
