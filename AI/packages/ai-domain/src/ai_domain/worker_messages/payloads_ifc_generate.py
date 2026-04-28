from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from ai_domain.layout_import import LayoutImportV1


class IfcGenerateCommandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    layoutImport: LayoutImportV1
