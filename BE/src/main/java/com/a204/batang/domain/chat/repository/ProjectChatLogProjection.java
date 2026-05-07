package com.a204.batang.domain.chat.repository;

import java.util.UUID;

/**
 * Projection for the virtual chat log query.
 *
 * <p>The native query aliases must match these getter names exactly.
 */
public interface ProjectChatLogProjection {

    UUID getReferenceId();

    String getType();

    String getSubType();

    String getContent();

    UUID getSenderUserId();

    UUID getJobId();

    String getJobType();

    String getJobStatus();

    Object getTimestamp();
}
