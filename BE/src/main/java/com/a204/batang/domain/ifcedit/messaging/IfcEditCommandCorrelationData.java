package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import lombok.Getter;
import org.springframework.amqp.rabbit.connection.CorrelationData;

/**
 * IFC Edit command publish confirm/returned 처리에 사용할 correlation data.
 */
@Getter
public class IfcEditCommandCorrelationData extends CorrelationData {

    private final IfcEditCommandMessage message;

    public IfcEditCommandCorrelationData(String id, IfcEditCommandMessage message) {
        super(id);
        this.message = message;
    }
}
