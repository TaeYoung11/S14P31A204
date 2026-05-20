from pathlib import Path
import json
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch

from jsonschema import Draft202012Validator  # type: ignore[import-untyped]

from ai_common.adapters.rabbitmq.kombu_client import get_command_queue
from ai_common.worker_sdk.event_factory import ClarificationResult, CompletedResult
from ai_domain.worker_messages.command import CommandMessage
from ai_planning_3d.command import (
    LLM3DCommand,
    LLM3DCommandType,
    LLM3DCreateInfo,
    LLM3DElementType,
)
from ai_planning_3d.engine import LLM3DEngine
from ai_planning_3d.pipeline import LLM3DPipeline
from ai_planning_3d.worker import (
    PlanningWorker,
    _apply_planner_options,
    _map_clarification,
    _resolve_effective_instruction,
)
from ai_planning_3d.worker_app import WORKER_TYPE


def test_three_d_worker_queue_is_registered() -> None:
    queue = get_command_queue(WORKER_TYPE)

    assert queue.name == "batang.three-d-llm.command.queue"
    assert queue.routing_key == "command.three-d-llm.*"
    assert queue.queue_arguments == {
        "x-dead-letter-exchange": "batang.dlx.exchange",
        "x-dead-letter-routing-key": "dead.three-d-llm",
    }


def _load_sample_command() -> CommandMessage:
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_3d_llm.json"
    with open(message_path, encoding="utf-8") as f:
        return CommandMessage.model_validate(json.load(f))


def _sample_ifc_bytes() -> bytes:
    root_dir = Path(__file__).resolve().parents[3]
    return (root_dir / "tests" / "sample_batang.ifc").read_bytes()


def _planner_3d_schema() -> dict[str, Any]:
    root_dir = Path(__file__).resolve().parents[4]
    schema_path = root_dir / "shared" / "schemas" / "planner_3d_result.v1.schema.json"
    with open(schema_path, encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


def _authoring_engine_request_schema() -> dict[str, Any]:
    root_dir = Path(__file__).resolve().parents[4]
    schema_path = root_dir / "shared" / "schemas" / "engine_request.v2.schema.json"
    with open(schema_path, encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


def _validate_authoring_operations_contract(
    command: CommandMessage,
    operations: list[dict[str, Any]],
) -> None:
    # The stored planner result remains planner_3d_result.v1. This wrapper only validates
    # that its nested operations match the authoring worker's EngineRequest operation contract.
    Draft202012Validator(_authoring_engine_request_schema()).validate(
        {
            "schema_version": "v2",
            "request_id": command.jobStepId,
            "mode": "apply",
            "project_id": command.projectId,
            "base_revision_id": command.sourceRevisionId,
            "operations": operations,
        }
    )


def _with_user_instruction(command: CommandMessage, user_instruction: str) -> CommandMessage:
    return command.model_copy(
        deep=True,
        update={
            "payload": command.payload.model_copy(
                update={"userInstruction": user_instruction}
            )
        },
    )


def _preview_ready_create(raw_instruction: str, element_type: str) -> dict[str, Any]:
    return {
        "status": "preview_ready",
        "session_id": f"session-{element_type}",
        "summary": "preview ready",
        "command": {
            "command_type": "CREATE",
            "target": {"element_type": element_type},
            "changes": None,
            "confidence": 0.91,
            "raw_instruction": raw_instruction,
            "ambiguity_question": None,
            "create_info": {
                "element_type": element_type,
                "storey": "1F",
                "direction": "North",
                "start_point": {"x": 0.0, "y": 6000.0, "z": 0.0},
                "length_mm": 900.0,
                "width_mm": 200.0,
                "height_mm": 2100.0,
                "host_wall_global_id": "2gZV8wAqn1z8b8s4l1mNQF",
                "sill_height_mm": 900.0,
                "opening_offset_mm": 120.0,
                "material": {"name": "Concrete"},
                "color": "#CCCCCC",
            },
        },
    }


def test_planning_worker_returns_completed_event_for_preview_ready_chat() -> None:
    command = _load_sample_command()
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = _sample_ifc_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=MagicMock(),
        s3=mock_s3,
    )

    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.return_value = {
            "status": "preview_ready",
            "session_id": "session-create-wall-001",
            "summary": "1F wall ready",
            "command": {
                "command_type": "CREATE",
                "target": {"element_type": "IfcWall"},
                "changes": None,
                "confidence": 0.91,
                "raw_instruction": "1층 북쪽에 벽 만들어줘",
                "ambiguity_question": None,
                "create_info": {
                    "element_type": "IfcWall",
                    "storey": "1F",
                    "direction": "North",
                    "start_point": {"x": 0.0, "y": 6000.0, "z": 0.0},
                    "length_mm": 3000.0,
                    "width_mm": 200.0,
                    "height_mm": 2800.0,
                    "material": {"name": "Concrete"},
                    "color": "#CCCCCC",
                },
            },
        }

        result = worker.process(command)

    mock_execute.assert_awaited_once_with(command.payload.userInstruction)
    assert isinstance(result, CompletedResult)
    assert result.output.storageUrl == "s3://mock-bucket/output.json"
    mock_s3.write_text.assert_called_once()
    stored_payload = json.loads(mock_s3.write_text.call_args.kwargs["text"])
    [operation] = stored_payload["operations"]
    assert operation["parameters"]["element_type"] == "IfcWall"
    assert operation["parameters"]["length_mm"] == 3000.0
    assert operation["parameters"]["dimensions_mm"] == {
        "length": 3000.0,
        "width": 200.0,
        "height": 2800.0,
    }


def test_planning_worker_stores_split_chat_as_multiple_schema_commands() -> None:
    command = _with_user_instruction(
        _load_sample_command(),
        "1층 거실에 문 만들어주고 2층 화장실에 창문 만들어줘",
    )
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = _sample_ifc_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=MagicMock(),
        s3=mock_s3,
    )

    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.side_effect = [
            _preview_ready_create("1층 거실에 문 만들어줘", "IfcDoor"),
            _preview_ready_create("2층 화장실에 창문 만들어줘", "IfcWindow"),
        ]

        result = worker.process(command)

    assert isinstance(result, CompletedResult)
    assert [call.args for call in mock_execute.await_args_list] == [
        ("1층 거실에 문 만들어줘",),
        ("2층 화장실에 창문 만들어줘",),
    ]

    stored_payload = json.loads(mock_s3.write_text.call_args.kwargs["text"])
    Draft202012Validator(_planner_3d_schema()).validate(stored_payload)
    assert stored_payload["status"] == "ready"
    assert [cmd["raw_instruction"] for cmd in stored_payload["commands"]] == [
        "1층 거실에 문 만들어줘",
        "2층 화장실에 창문 만들어줘",
    ]
    assert [cmd["create_info"]["element_type"] for cmd in stored_payload["commands"]] == [
        "IfcDoor",
        "IfcWindow",
    ]
    _validate_authoring_operations_contract(command, stored_payload["operations"])
    assert [op["type"] for op in stored_payload["operations"]] == [
        "create_element",
        "create_element",
    ]
    assert [op["parameters"]["element_type"] for op in stored_payload["operations"]] == [
        "IfcDoor",
        "IfcWindow",
    ]
    assert all("length_mm" not in op["parameters"] for op in stored_payload["operations"])


def test_split_chat_commands_keeps_dimension_comma_inside_single_command() -> None:
    command = "1층 거실 북쪽 벽 중앙에 폭 900mm, 높이 2100mm의 나무 문을 설치해줘."

    commands = LLM3DPipeline.split_chat_commands(command)

    assert commands == ["1층 거실 북쪽 벽 중앙에 폭 900mm, 높이 2100mm의 나무 문을 설치해줘"]


def test_split_chat_commands_keeps_color_commands_split_on_comma() -> None:
    command = "1층 외벽 색상 #E5E7EB, 2층 외벽 색상 #CBD5E1로 바꿔줘"

    commands = LLM3DPipeline.split_chat_commands(command)

    assert commands == ["1층 외벽 색상 #E5E7EB", "2층 외벽 색상 #CBD5E1로 바꿔줘"]


def test_apply_explicit_opening_dimensions_prefers_raw_instruction_labels() -> None:
    create_info: dict[str, Any] = {
        "element_type": "IfcDoor",
        "length_mm": 900.0,
        "height_mm": 2400.0,
    }
    raw_instruction = (
        "1\uce35 \uac70\uc2e4 \ubd81\ucabd \ubcbd \uc911\uc559\uc5d0 "
        "\ud3ed 900mm, \ub192\uc774 2100mm\uc758 \ub098\ubb34 \ubb38\uc744 "
        "\uc124\uce58\ud574\uc918"
    )

    LLM3DPipeline._apply_explicit_opening_dimensions(create_info, raw_instruction)

    assert create_info["length_mm"] == 900.0
    assert create_info["height_mm"] == 2100.0


def test_heuristic_parser_recognizes_bare_hex_color_assignment() -> None:
    engine = LLM3DEngine()

    parsed = engine._heuristic_parse("wall is #2385db")

    assert parsed.changes is not None
    assert parsed.changes.color == "#2385DB"


def test_heuristic_parser_recognizes_hex_color_before_korean_particle() -> None:
    engine = LLM3DEngine()

    parsed = engine._heuristic_parse("wall is #2385db로")

    assert parsed.changes is not None
    assert parsed.changes.color == "#2385DB"


def test_heuristic_parser_does_not_truncate_seven_digit_hex_color() -> None:
    engine = LLM3DEngine()

    parsed = engine._heuristic_parse("wall is #2385dba")

    assert parsed.changes is None or parsed.changes.color is None


def test_planning_worker_stores_engine_operations_for_modify_and_delete() -> None:
    command = _with_user_instruction(_load_sample_command(), "modify and delete")
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = _sample_ifc_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=MagicMock(),
        s3=mock_s3,
    )

    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.return_value = {
            "status": "preview_ready",
            "session_id": "session-modify-delete",
            "summary": "preview ready",
            "commands": [
                {
                    "command_type": "MODIFY",
                    "target": {"element_type": "IfcWall", "storey": "1F", "direction": "North"},
                    "changes": {
                        "height_mm": {"mode": "ABSOLUTE", "value": 3000.0},
                        "color": "#AABBCC",
                        "position_mm": {"mode": "RELATIVE", "x": 100.0, "y": 0.0, "z": 0.0},
                        "rotation_deg": 15.0,
                    },
                    "confidence": 0.95,
                    "raw_instruction": "modify wall",
                },
                {
                    "command_type": "DELETE",
                    "target": {"element_type": "IfcDoor", "select_all": True},
                    "changes": {"deletion": True},
                    "confidence": 0.95,
                    "raw_instruction": "delete doors",
                },
            ],
        }

        result = worker.process(command)

    assert isinstance(result, CompletedResult)
    stored_payload = json.loads(mock_s3.write_text.call_args.kwargs["text"])
    Draft202012Validator(_planner_3d_schema()).validate(stored_payload)
    _validate_authoring_operations_contract(command, stored_payload["operations"])
    assert [op["type"] for op in stored_payload["operations"]] == [
        "update_element_properties",
        "transform_elements",
        "delete_elements",
    ]
    assert stored_payload["operations"][0]["parameters"] == {
        "dimensions_mm": {"height": {"mode": "ABSOLUTE", "value": 3000.0}},
        "color": "#AABBCC",
    }
    assert stored_payload["operations"][1]["parameters"] == {
        "translation_mm": {"x": 100.0, "y": 0.0, "z": 0.0},
        "rotation_deg": {"x": 0.0, "y": 0.0, "z": 15.0},
    }


def test_planning_worker_split_chat_fails_fast_without_partial_commands() -> None:
    command = _with_user_instruction(
        _load_sample_command(),
        "1층 거실에 문 만들어주고 2층 화장실에 창문 만들어주고 지붕 돌려줘",
    )
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = _sample_ifc_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=MagicMock(),
        s3=mock_s3,
    )

    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.side_effect = [
            _preview_ready_create("1층 거실에 문 만들어줘", "IfcDoor"),
            {
                "status": "needs_clarification",
                "session_id": "session-window-clarification",
                "summary": "창문 위치 확인이 필요합니다.",
                "clarification_questions": [
                    {"id": "q1", "label": "창문 위치", "options": []}
                ],
            },
        ]

        result = worker.process(command)

    assert isinstance(result, ClarificationResult)
    assert [call.args for call in mock_execute.await_args_list] == [
        ("1층 거실에 문 만들어줘",),
        ("2층 화장실에 창문 만들어줘",),
    ]
    assert result.error.clarification_request_id == "session-window-clarification"
    assert result.error.message.startswith("Command 2 failed:")

    # write_text: [0] = full planner result (schema-validated), [1] = ClarificationArtifact
    stored_payload = json.loads(mock_s3.write_text.call_args_list[0].kwargs["text"])
    Draft202012Validator(_planner_3d_schema()).validate(stored_payload)
    assert stored_payload["status"] == "clarification_required"
    assert stored_payload["commands"] == []


def test_planning_worker_split_not_found_returns_clarification_artifact() -> None:
    command = _with_user_instruction(
        _load_sample_command(),
        "roof is #E8808B, delete bathroom door",
    )
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = _sample_ifc_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=MagicMock(),
        s3=mock_s3,
    )

    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.side_effect = [
            _preview_ready_create("roof is #E8808B", "IfcRoof"),
            {
                "status": "not_found",
                "summary": "Target door was not found.",
            },
        ]

        result = worker.process(command)

    assert isinstance(result, ClarificationResult)
    assert result.error.message.startswith("Command 2 failed:")
    assert [call.args for call in mock_execute.await_args_list] == [
        ("roof is #E8808B",),
        ("delete bathroom door",),
    ]

    stored_payload = json.loads(mock_s3.write_text.call_args_list[0].kwargs["text"])
    Draft202012Validator(_planner_3d_schema()).validate(stored_payload)
    assert stored_payload["status"] == "clarification_required"
    assert stored_payload["commands"] == []
    assert stored_payload["clarification"]["context"]["failed_instruction"] == (
        "delete bathroom door"
    )

    artifact = json.loads(mock_s3.write_text.call_args_list[1].kwargs["text"])
    assert artifact["kind"] == "open_ended"
    assert "delete bathroom door" in artifact["question"]


def test_planning_worker_returns_clarification_without_downstream_publish() -> None:
    command = _load_sample_command()
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = _sample_ifc_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=MagicMock(),
        s3=mock_s3,
    )

    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.return_value = {
            "status": "needs_clarification",
            "session_id": "mock-session-123",
            "summary": "Conflict detected",
            "clarification_questions": [
                {
                    "trigger": "custom",
                    "question_ko": "Select host wall",
                    "context": {
                        "apply_field": "host_wall_global_id",
                        "reason": "host_wall_not_found",
                    },
                    "options": [
                        {
                            "id": "2znubWhPDD4wn7Fg4E24GR",
                            "label": "South wall",
                            "value": "2znubWhPDD4wn7Fg4E24GR",
                        }
                    ],
                }
            ],
        }

        result = worker.process(command)

    assert isinstance(result, ClarificationResult)
    # _store_result (planner_3d_result format) is the first write;
    # _store_clarification_artifact is second.
    stored_payload = json.loads(mock_s3.write_text.call_args_list[0].kwargs["text"])
    Draft202012Validator(_planner_3d_schema()).validate(stored_payload)
    clarification = stored_payload["clarification"]
    assert clarification["context"]["apply_field"] == "host_wall_global_id"
    assert clarification["options"][0] == {
        "id": "2znubWhPDD4wn7Fg4E24GR",
        "label": "South wall",
        "value": "2znubWhPDD4wn7Fg4E24GR",
    }


def test_planning_worker_logic() -> None:
    # 테스트 환경 및 샘플 데이터 로드
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_3d_llm.json"
    ifc_path = root_dir / "tests" / "sample_batang.ifc"

    with open(message_path, encoding="utf-8") as f:
        command = CommandMessage.model_validate(json.load(f))

    # 외부 의존성(S3, Publisher) Mock 설정
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = ifc_path.read_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"
    mock_publisher = MagicMock()

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=mock_publisher,
        s3=mock_s3,
    )

    # 파이프라인 실행 시뮬레이션 (AsyncMock을 사용하여 비동기 경고 해결)
    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.return_value = {
            "status": "needs_clarification",
            "session_id": "mock-session-123",
            "summary": "Conflict detected",
            "clarification_questions": [{"id": "q1", "label": "Confirm", "options": []}],
        }

        result = worker.process(command)

        assert isinstance(result, ClarificationResult)
        assert result.error.code == "NEEDS_CLARIFICATION"
        assert result.error.clarification_request_id == "mock-session-123"
        print("[OK] result mapping (needs_clarification)")


def test_resolve_effective_instruction_prefers_previous_user_message_when_host_wall_selected(
) -> None:
    history = [
        type("Entry", (), {"role": "assistant", "content": "어느 벽에 설치할까요?"})(),
        type("Entry", (), {"role": "user", "content": "남쪽 벽에 문을 만들어줘"})(),
    ]

    resolved = _resolve_effective_instruction(
        "Wall A",
        history,
        {"host_wall_global_id": "2gZV8wAqn1z8b8s4l1mNQF"},
    )

    assert resolved == "남쪽 벽에 문을 만들어줘"


def test_apply_planner_options_sets_host_wall_for_door_create() -> None:
    command = LLM3DCommand(
        command_type=LLM3DCommandType.CREATE,
        create_info=LLM3DCreateInfo(element_type=LLM3DElementType.DOOR),
        raw_instruction="문 만들어줘",
    )

    updated = _apply_planner_options(
        command,
        {"host_wall_global_id": "2gZV8wAqn1z8b8s4l1mNQF"},
    )

    assert updated.create_info is not None
    assert updated.create_info.host_wall_global_id == "2gZV8wAqn1z8b8s4l1mNQF"


def test_map_clarification_keeps_option_details_for_custom_trigger() -> None:
    mapped = _map_clarification(
        {
            "clarification_questions": [
                {
                    "trigger": "custom",
                    "question_ko": "벽을 선택해 주세요.",
                    "options": [
                        {
                            "id": "wall-1",
                            "label": "South Wall",
                            "value": "2gZV8wAqn1z8b8s4l1mNQF",
                        }
                    ],
                }
            ]
        }
    )

    assert mapped["question"] == "벽을 선택해 주세요."
    assert mapped["options"] == [
        {
            "id": "wall-1",
            "label": "South Wall",
            "value": "2gZV8wAqn1z8b8s4l1mNQF",
        }
    ]
    assert "trigger" not in mapped
    assert "option_details" not in mapped


def test_build_host_wall_clarification_question_uses_axis_projection_lengths() -> None:
    pipeline = object.__new__(LLM3DPipeline)
    wall = type("Wall", (), {"GlobalId": "2gZV8wAqn1z8b8s4l1mNQF", "Name": "South Wall"})()
    storey = type("Storey", (), {"Name": "1F"})()

    pipeline._storey_walls = lambda _: [wall]  # type: ignore[attr-defined]
    pipeline._wall_axis_info_mm = lambda _: {  # type: ignore[attr-defined]
        "axis_x": 0.0,
        "axis_y": 1.0,
        "length": 4200.0,
    }

    question = pipeline._build_host_wall_clarification_question(storey, "south")

    assert question.options[0].label == "South Wall (East/West)"
    assert question.options[0].value == "2gZV8wAqn1z8b8s4l1mNQF"


if __name__ == "__main__":
    test_planning_worker_logic()
