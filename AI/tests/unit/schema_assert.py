from __future__ import annotations

from datetime import datetime
from pathlib import Path
import json
import re
from typing import Any
from uuid import UUID


class SchemaValidationError(ValueError):
    pass


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_json_schema(
    instance: Any,
    schema: dict[str, Any],
    *,
    root_schema: dict[str, Any] | None = None,
    store: dict[str, dict[str, Any]] | None = None,
) -> None:
    if root_schema is None:
        root_schema = schema
    if store is None:
        store = {}

    ref = schema.get("$ref")
    if ref is not None:
        resolved_schema, resolved_root = _resolve_ref(ref, root_schema, store)
        validate_json_schema(instance, resolved_schema, root_schema=resolved_root, store=store)
        return

    schema_type = schema.get("type")
    if schema_type is not None:
        _validate_type(instance, schema_type)

    if "const" in schema and instance != schema["const"]:
        raise SchemaValidationError(f"expected const {schema['const']!r}")

    if "enum" in schema and instance not in schema["enum"]:
        raise SchemaValidationError(f"value {instance!r} not in enum")

    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            raise SchemaValidationError("string shorter than minLength")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            raise SchemaValidationError("string longer than maxLength")
        if "pattern" in schema and re.fullmatch(schema["pattern"], instance) is None:
            raise SchemaValidationError("string does not match pattern")
        if schema.get("format") == "date-time":
            datetime.fromisoformat(instance.replace("Z", "+00:00"))
        if schema.get("format") == "uuid":
            UUID(instance)

    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            raise SchemaValidationError("number below minimum")
        if "maximum" in schema and instance > schema["maximum"]:
            raise SchemaValidationError("number above maximum")
        if "exclusiveMinimum" in schema and instance <= schema["exclusiveMinimum"]:
            raise SchemaValidationError("number below exclusiveMinimum")

    if isinstance(instance, dict):
        required = schema.get("required", [])
        for key in required:
            if key not in instance:
                raise SchemaValidationError(f"missing required key: {key}")

        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            extra_keys = set(instance) - set(properties)
            if extra_keys:
                raise SchemaValidationError(f"unexpected keys: {sorted(extra_keys)!r}")

        for key, value in instance.items():
            if key in properties:
                validate_json_schema(value, properties[key], root_schema=root_schema, store=store)

    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            raise SchemaValidationError("array shorter than minItems")
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            raise SchemaValidationError("array longer than maxItems")

        prefix_items = schema.get("prefixItems")
        if prefix_items is not None:
            for index, item_schema in enumerate(prefix_items):
                if index >= len(instance):
                    break
                validate_json_schema(
                    instance[index],
                    item_schema,
                    root_schema=root_schema,
                    store=store,
                )
            if schema.get("items") is False and len(instance) != len(prefix_items):
                raise SchemaValidationError("array length does not match prefixItems")
        elif "items" in schema:
            item_schema = schema["items"]
            for item in instance:
                validate_json_schema(item, item_schema, root_schema=root_schema, store=store)

    if "oneOf" in schema:
        _validate_one_of(instance, schema["oneOf"], root_schema, store)

    if "allOf" in schema:
        for sub_schema in schema["allOf"]:
            if "if" in sub_schema and "then" in sub_schema:
                # NOTE:
                # 이 헬퍼는 현재 worker message schema에서 사용하는 `if`/`then`
                # 패턴만 지원합니다. 이후 schema에서 `else`를 사용하기 시작하면
                # 해당 분기도 평가할 수 있도록 validator를 함께 확장해야 합니다.
                if _is_valid(instance, sub_schema["if"], root_schema, store):
                    validate_json_schema(
                        instance,
                        sub_schema["then"],
                        root_schema=root_schema,
                        store=store,
                    )
            else:
                validate_json_schema(instance, sub_schema, root_schema=root_schema, store=store)


def _resolve_ref(
    ref: str,
    root_schema: dict[str, Any],
    store: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    if ref.startswith("#/"):
        target: Any = root_schema
        for part in ref[2:].split("/"):
            target = target[part]
        if not isinstance(target, dict):
            raise SchemaValidationError(f"ref {ref} did not resolve to an object schema")
        return target, root_schema

    if "#" in ref:
        doc_ref, fragment = ref.split("#", 1)
        document = store[doc_ref]
        if fragment.startswith("/"):
            target: Any = document
            for part in fragment[1:].split("/"):
                target = target[part]
            if not isinstance(target, dict):
                raise SchemaValidationError(f"ref {ref} did not resolve to an object schema")
            return target, document
        return document, document

    return store[ref], store[ref]


def _validate_type(instance: Any, schema_type: str | list[str]) -> None:
    accepted = schema_type if isinstance(schema_type, list) else [schema_type]
    for candidate in accepted:
        if candidate == "null" and instance is None:
            return
        if candidate == "object" and isinstance(instance, dict):
            return
        if candidate == "array" and isinstance(instance, list):
            return
        if candidate == "string" and isinstance(instance, str):
            return
        if candidate == "integer" and isinstance(instance, int) and not isinstance(instance, bool):
            return
        if (
            candidate == "number"
            and isinstance(instance, (int, float))
            and not isinstance(instance, bool)
        ):
            return
        if candidate == "boolean" and isinstance(instance, bool):
            return
    raise SchemaValidationError(f"value {instance!r} does not match type {schema_type!r}")


def _is_valid(
    instance: Any,
    schema: dict[str, Any],
    root_schema: dict[str, Any],
    store: dict[str, dict[str, Any]],
) -> bool:
    try:
        validate_json_schema(instance, schema, root_schema=root_schema, store=store)
    except Exception:
        return False
    return True


def _validate_one_of(
    instance: Any,
    schemas: list[dict[str, Any]],
    root_schema: dict[str, Any],
    store: dict[str, dict[str, Any]],
) -> None:
    matches = 0
    for candidate in schemas:
        if _is_valid(instance, candidate, root_schema, store):
            matches += 1
    if matches != 1:
        raise SchemaValidationError(f"expected exactly one matching schema, got {matches}")
