from __future__ import annotations

import pytest

import main as worker_main


def test_main_dispatches_to_ifc_generate_entrypoint(monkeypatch) -> None:
    calls: list[tuple[str, list[str]]] = []

    def fake_load_entrypoint(target: str):
        def fake_entrypoint(argv):
            calls.append((target, list(argv or [])))
            return 11

        return fake_entrypoint

    monkeypatch.setenv("WORKER_TYPE", "IFC_GENERATE_FROM_BUBBLE")
    monkeypatch.setattr(worker_main, "_load_entrypoint", fake_load_entrypoint)

    assert worker_main.main(["--once"]) == 11
    assert calls == [("ai_layout_import.worker_app:main", ["--once"])]


def test_main_dispatches_to_planning_3d_entrypoint(monkeypatch) -> None:
    calls: list[tuple[str, list[str]]] = []

    def fake_load_entrypoint(target: str):
        def fake_entrypoint(argv):
            calls.append((target, list(argv or [])))
            return 12

        return fake_entrypoint

    monkeypatch.setenv("WORKER_TYPE", "THREE_D_LLM")
    monkeypatch.setattr(worker_main, "_load_entrypoint", fake_load_entrypoint)

    assert worker_main.main(["--once"]) == 12
    assert calls == [("ai_planning_3d.worker_app:main", ["--once"])]


def test_main_dispatches_to_authoring_entrypoint(monkeypatch) -> None:
    calls: list[tuple[str, list[str]]] = []

    def fake_load_entrypoint(target: str):
        def fake_entrypoint(argv):
            calls.append((target, list(argv or [])))
            return 14

        return fake_entrypoint

    monkeypatch.setenv("WORKER_TYPE", "IFC_EDIT_APPLY")
    monkeypatch.setattr(worker_main, "_load_entrypoint", fake_load_entrypoint)

    assert worker_main.main(["--once"]) == 14
    assert calls == [("ai_authoring.worker_app:main", ["--once"])]


def test_main_dispatches_to_rendering_entrypoint(monkeypatch) -> None:
    calls: list[tuple[str, list[str]]] = []

    def fake_load_entrypoint(target: str):
        def fake_entrypoint(argv):
            calls.append((target, list(argv or [])))
            return 13

        return fake_entrypoint

    monkeypatch.setenv("WORKER_TYPE", "SD_RENDER_GENERATE")
    monkeypatch.setattr(worker_main, "_load_entrypoint", fake_load_entrypoint)

    assert worker_main.main(["--once", "--work-root", "outputs/render-worker"]) == 13
    assert calls == [
        (
            "ai_rendering.worker_app:main",
            ["--once", "--work-root", "outputs/render-worker"],
        )
    ]


def test_main_requires_supported_worker_type(monkeypatch) -> None:
    monkeypatch.setenv("WORKER_TYPE", "UNKNOWN_WORKER")

    with pytest.raises(RuntimeError, match="지원하지 않는 WORKER_TYPE"):
        worker_main.main([])
