package com.a204.batang.domain.workspace.dto;

import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.BubbleData;
import com.a204.batang.domain.workspace.dto.BubbleUpdateRequest.ConnectionData;

import java.util.List;

/**
 * 버블 스냅샷 payload의 공통 형태를 정의한다.
 */
public interface BubbleSnapshotPayload {

    /**
     * 버블 목록을 반환한다.
     *
     * @return 버블 목록
     */
    List<BubbleData> bubbles();

    /**
     * 연결 목록을 반환한다.
     *
     * @return 연결 목록
     */
    List<ConnectionData> connections();
}
