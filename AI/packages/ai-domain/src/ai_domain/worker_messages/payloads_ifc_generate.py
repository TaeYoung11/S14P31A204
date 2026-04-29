from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from ai_domain.layout_import import LayoutImportRequest


class IfcGenerateCommandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    layoutImport: LayoutImportRequest
