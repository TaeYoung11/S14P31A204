"""Compatibility wrapper for the worker runtime app."""

from __future__ import annotations

from .worker_runtime.app import WORKER_TYPE, main

__all__ = ["WORKER_TYPE", "main"]
