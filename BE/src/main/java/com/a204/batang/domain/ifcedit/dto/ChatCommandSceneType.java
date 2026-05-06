package com.a204.batang.domain.ifcedit.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "chat-commands 라우팅용 scene 타입")
public enum ChatCommandSceneType {
    TWO_D,
    THREE_D
}
