"""Compatibility wrapper for the worker runtime app."""

from __future__ import annotations

from .worker_runtime.app import WORKER_TYPE, build_settings, main, run_two_d_llm_worker

__all__ = ["WORKER_TYPE", "build_settings", "main", "run_two_d_llm_worker"]
