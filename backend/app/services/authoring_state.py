from __future__ import annotations

import json
import threading
import uuid
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import redis

from app.core.config import settings


SESSION_TTL_SECONDS = 300
LOCK_TTL_SECONDS = 120


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AuthoringStateService:
    def __init__(self) -> None:
        self._memory: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.RLock()
        self._redis = None

        try:
            client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
            client.ping()
            self._redis = client
        except Exception:
            self._redis = None

    def _key(self, project_id: str) -> str:
        return f"authoring:project:{project_id}"

    def _default_state(self) -> Dict[str, Any]:
        return {
            "model_revision": 0,
            "sessions": {},
            "locks": {},
            "previews": {},
        }

    def _load_state(self, project_id: str) -> Dict[str, Any]:
        if self._redis is not None:
            raw = self._redis.get(self._key(project_id))
            if raw:
                return json.loads(raw)
            return self._default_state()

        return deepcopy(self._memory.get(project_id, self._default_state()))

    def _save_state(self, project_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
        if self._redis is not None:
            self._redis.set(self._key(project_id), json.dumps(state))
        else:
            self._memory[project_id] = deepcopy(state)
        return state

    def _prune_state(self, state: Dict[str, Any]) -> None:
        now = _utc_now()

        stale_sessions = []
        for session_id, session in state["sessions"].items():
            last_seen = datetime.fromisoformat(session["last_seen"])
            if now - last_seen > timedelta(seconds=SESSION_TTL_SECONDS):
                stale_sessions.append(session_id)

        for session_id in stale_sessions:
            self._release_session_resources_unlocked(state, session_id)
            state["sessions"].pop(session_id, None)

        stale_locks = []
        for lock_key, lock in state["locks"].items():
            expires_at = datetime.fromisoformat(lock["expires_at"])
            if now >= expires_at:
                stale_locks.append(lock_key)

        for lock_key in stale_locks:
            state["locks"].pop(lock_key, None)

    def _release_session_resources_unlocked(self, state: Dict[str, Any], session_id: str) -> None:
        state["previews"].pop(session_id, None)

        owned_locks = [
            key
            for key, value in state["locks"].items()
            if value.get("session_id") == session_id
        ]
        for key in owned_locks:
            state["locks"].pop(key, None)

    def get_project_state(self, project_id: str) -> Dict[str, Any]:
        with self._lock:
            state = self._load_state(project_id)
            self._prune_state(state)
            self._save_state(project_id, state)
            return deepcopy(state)

    def get_revision(self, project_id: str) -> int:
        return int(self.get_project_state(project_id)["model_revision"])

    def set_revision(self, project_id: str, revision: int) -> Dict[str, Any]:
        with self._lock:
            state = self._load_state(project_id)
            self._prune_state(state)
            state["model_revision"] = revision
            self._save_state(project_id, state)
            return deepcopy(state)

    def create_session(self, project_id: str, display_name: Optional[str], revision: int) -> Dict[str, Any]:
        with self._lock:
            state = self._load_state(project_id)
            self._prune_state(state)
            session_id = f"sess_{uuid.uuid4().hex[:10]}"
            session = {
                "session_id": session_id,
                "display_name": (display_name or "Guest").strip() or "Guest",
                "last_seen": _utc_now().isoformat(),
                "selection": None,
            }
            state["sessions"][session_id] = session
            state["model_revision"] = max(int(state["model_revision"]), revision)
            self._save_state(project_id, state)
            return deepcopy(session)

    def touch_session(
        self,
        project_id: str,
        session_id: str,
        display_name: Optional[str] = None,
        selection: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            state = self._load_state(project_id)
            self._prune_state(state)
            session = state["sessions"].get(session_id)
            if session is None:
                return None

            session["last_seen"] = _utc_now().isoformat()
            if display_name:
                session["display_name"] = display_name
            if selection is not None:
                session["selection"] = selection

            self._save_state(project_id, state)
            return deepcopy(session)

    def remove_session(self, project_id: str, session_id: str) -> Dict[str, Any]:
        with self._lock:
            state = self._load_state(project_id)
            self._prune_state(state)
            self._release_session_resources_unlocked(state, session_id)
            state["sessions"].pop(session_id, None)
            self._save_state(project_id, state)
            return deepcopy(state)

    def acquire_lock(
        self,
        project_id: str,
        session_id: str,
        scope: str,
        scope_key: str,
        label: str,
        bbox: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            state = self._load_state(project_id)
            self._prune_state(state)
            lock_key = f"{scope}:{scope_key}"
            existing = state["locks"].get(lock_key)

            if existing and existing.get("session_id") != session_id:
                return {"ok": False, "conflict": deepcopy(existing)}

            lock = {
                "lock_id": existing["lock_id"] if existing else f"lock_{uuid.uuid4().hex[:10]}",
                "scope": scope,
                "scope_key": scope_key,
                "label": label,
                "session_id": session_id,
                "bbox": bbox,
                "expires_at": (_utc_now() + timedelta(seconds=LOCK_TTL_SECONDS)).isoformat(),
            }
            state["locks"][lock_key] = lock
            self._save_state(project_id, state)
            return {"ok": True, "lock": deepcopy(lock)}

    def release_lock(
        self,
        project_id: str,
        session_id: str,
        scope: Optional[str] = None,
        scope_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            state = self._load_state(project_id)
            self._prune_state(state)
            if scope and scope_key:
                lock_key = f"{scope}:{scope_key}"
                lock = state["locks"].get(lock_key)
                if lock and lock.get("session_id") == session_id:
                    state["locks"].pop(lock_key, None)
            else:
                self._release_session_resources_unlocked(state, session_id)

            self._save_state(project_id, state)
            return deepcopy(state)

    def upsert_preview(self, project_id: str, session_id: str, preview: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            state = self._load_state(project_id)
            self._prune_state(state)
            state["previews"][session_id] = preview
            self._save_state(project_id, state)
            return deepcopy(state)

    def clear_preview(self, project_id: str, session_id: str) -> Dict[str, Any]:
        with self._lock:
            state = self._load_state(project_id)
            self._prune_state(state)
            state["previews"].pop(session_id, None)
            self._save_state(project_id, state)
            return deepcopy(state)

    def serialize_presence(self, project_id: str) -> Dict[str, Any]:
        state = self.get_project_state(project_id)
        sessions = sorted(
            state["sessions"].values(),
            key=lambda item: item["display_name"].lower(),
        )
        return {
            "type": "presence.state",
            "project_id": project_id,
            "model_revision": state["model_revision"],
            "sessions": sessions,
        }

    def serialize_locks(self, project_id: str) -> Dict[str, Any]:
        state = self.get_project_state(project_id)
        return {
            "type": "lock.state",
            "project_id": project_id,
            "locks": list(state["locks"].values()),
        }

    def serialize_previews(self, project_id: str) -> Dict[str, Any]:
        state = self.get_project_state(project_id)
        return {
            "type": "preview.state",
            "project_id": project_id,
            "previews": list(state["previews"].values()),
        }


authoring_state = AuthoringStateService()

