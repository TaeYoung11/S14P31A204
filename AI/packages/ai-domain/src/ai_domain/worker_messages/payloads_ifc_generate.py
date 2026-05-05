from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ai_domain.layout_import import LayoutImportRequest


class IfcGenerateCommandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    layoutImport: LayoutImportRequest = Field(alias="layout_import")
