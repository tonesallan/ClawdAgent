from __future__ import annotations

import re
from typing import Any


_MOJIBAKE_MARKERS = (
    "Ã",
    "Â",
    "ðŸ",
    "â",
    "ï¿½",
    "�",
)


def mojibake_score(value: str) -> int:
    return sum(value.count(marker) for marker in _MOJIBAKE_MARKERS)


def repair_mojibake_text(value: str) -> str:
    if mojibake_score(value) == 0:
        return value

    best = value
    best_score = mojibake_score(best)

    for _ in range(3):
        improved = False

        for encoding in ("cp1252", "latin1"):
            try:
                candidate = best.encode(encoding).decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                continue

            score = mojibake_score(candidate)

            if score < best_score:
                best = candidate
                best_score = score
                improved = True

        if not improved:
            break

    return best


def repair_mojibake_value(value: Any) -> Any:
    if isinstance(value, str):
        return repair_mojibake_text(value)

    if isinstance(value, list):
        return [repair_mojibake_value(item) for item in value]

    if isinstance(value, dict):
        return {
            key: repair_mojibake_value(item)
            for key, item in value.items()
        }

    return value


def clean_special_comment_template(value: str) -> str:
    return re.sub(
        r"^\s*coment[aá]rios\s+especiais\s*:\s*",
        "",
        value,
        flags=re.IGNORECASE,
    ).strip()


def repair_loaded_config(
    data: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    repaired = repair_mojibake_value(data)

    if not isinstance(repaired, dict):
        return data, False

    content = repaired.get("content")

    if isinstance(content, dict):
        policy = content.get("commentPolicy")

        if isinstance(policy, dict):
            exchange = policy.get("followExchange")

            if isinstance(exchange, dict):
                templates = exchange.get("commentTemplates")

                if isinstance(templates, list):
                    exchange["commentTemplates"] = [
                        clean_special_comment_template(str(item))
                        for item in templates
                        if str(item).strip()
                    ]

    return repaired, repaired != data
