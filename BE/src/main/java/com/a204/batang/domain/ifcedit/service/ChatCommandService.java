package com.a204.batang.domain.ifcedit.service;

import com.a204.batang.domain.ifcedit.dto.ChatCommandRequest;
import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.dto.LlmIfcEditRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ChatCommandService {

    private final TwoDLlmIfcEditCommandService twoDLlmIfcEditCommandService;
    private final ThreeDLlmIfcEditCommandService threeDLlmIfcEditCommandService;
    private final PictureWindowDemoService pictureWindowDemoService;

    public IfcEditJobResponse createChatCommand(UUID projectId, UUID userId, ChatCommandRequest request) {
        // 시연 전용 우회: "통창" 키워드 매칭 시 LLM 경로 대신 사전 준비된 핸들러로 위임한다.
        Optional<IfcEditJobResponse> demoResult =
                pictureWindowDemoService.tryHandle(projectId, userId, request);
        if (demoResult.isPresent()) {
            return demoResult.get();
        }

        // The public chat contract stays generic so it can grow beyond edit-only requests.
        // In the current MVP, that message is translated into the edit worker's userInstruction.
        LlmIfcEditRequest llmRequest = new LlmIfcEditRequest(
                request.baseRevisionId(),
                request.sourceSceneStateId(),
                request.sourceSceneType(),
                request.message(),
                request.sourceSceneStorageUrl(),
                request.sourceScene(),
                request.conversationHistory(),
                request.plannerOptions()
        );

        return switch (request.sceneType()) {
            case TWO_D -> twoDLlmIfcEditCommandService.createTwoDLlmIfcEdit(projectId, userId, llmRequest);
            case THREE_D -> threeDLlmIfcEditCommandService.createThreeDLlmIfcEdit(projectId, userId, llmRequest);
        };
    }
}
