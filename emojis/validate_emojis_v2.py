"""
Emoji validation script for emojis_v2.json
"""

from pydantic import BaseModel, field_validator, ValidationError
from pydantic import ValidationInfo
import json
import sys


# ------------------------------------------------------------
# MODELS (STRUCTURE ONLY)
# ------------------------------------------------------------
class EmojiServer(BaseModel):
    server: str
    url: str


class Emoji(BaseModel):
    name: str
    id: str

    emoji_id: int | None = None
    emoji_server: int | None = None
    image: str | None = None
    preset_type: str | None = None
    preset_slot: int | None = None

    @field_validator("emoji_server")
    def validate_emoji_pair(cls, server, info: ValidationInfo):
        eid = info.data.get("emoji_id")
        if (eid is None and server is not None) or (eid is not None and server is None):
            raise ValueError("emoji_id and emoji_server must both be set or both unset")
        return server

    @field_validator("preset_slot")
    def validate_preset_pair(cls, slot, info: ValidationInfo):
        ptype = info.data.get("preset_type")
        if (ptype is None and slot is not None) or (ptype is not None and slot is None):
            raise ValueError("preset_type and preset_slot must both be set or both unset")
        return slot


class Category(BaseModel):
    name: str
    emojis: list[Emoji]


class EmojiSettingsV2(BaseModel):
    servers: list[EmojiServer]
    categories: list[Category]


# ------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------
def find_line(lines, text):
    for i, line in enumerate(lines, start=1):
        if text in line:
            return i
    return "unknown"


def format_lines(lines_list):
    unique = sorted(set(lines_list))
    if len(unique) == 2:
        return f"{unique[0]} & {unique[1]}"
    return ", ".join(str(l) for l in unique)


def get_emoji_name(data, cat_idx, emoji_idx):
    try:
        return data["categories"][cat_idx]["emojis"][emoji_idx].get("name", "Unknown emoji")
    except Exception:
        return "Unknown emoji"


def get_emoji_line(data, lines, cat_idx, emoji_idx, emoji_name=None):
    try:
        emoji = data["categories"][cat_idx]["emojis"][emoji_idx]

        if emoji_name is None:
            emoji_name = emoji.get("name", "Unknown emoji")

        # Prefer id for line lookup when present, because it is usually unique
        emoji_id = emoji.get("id")
        if emoji_id is not None:
            line = find_line(lines, f'"id": "{emoji_id}"')
            if line != "unknown":
                return line

        # Fall back to name
        if emoji_name != "Unknown emoji":
            line = find_line(lines, f'"name": "{emoji_name}"')
            if line != "unknown":
                return line
    except Exception:
        pass

    return "unknown"


def get_server_line(lines, server_name=None, url=None):
    if server_name is not None:
        line = find_line(lines, f'"server": "{server_name}"')
        if line != "unknown":
            return line

    if url is not None:
        line = find_line(lines, f'"url": "{url}"')
        if line != "unknown":
            return line

    return "unknown"


def get_category_line(lines, category_name):
    return find_line(lines, f'"name": "{category_name}"')


# ------------------------------------------------------------
# BUILD EMOJI LINE MAP (STRUCTURE-BASED)
# ------------------------------------------------------------
def build_emoji_line_map(data, lines):
    mapping = {}

    # Collect all "name" line numbers in file order
    name_line_queue = []
    for i, line in enumerate(lines, start=1):
        if '"name":' in line:
            try:
                name = line.split('"name":', 1)[1].split('"', 2)[1]
                name_line_queue.append((name, i))
            except Exception:
                pass

    # Assign only emoji names, in JSON order, skipping category names
    idx = 0
    for cat in data.get("categories", []):
        for emoji in cat.get("emojis", []):
            name = emoji["name"]

            while idx < len(name_line_queue):
                candidate_name, line_no = name_line_queue[idx]
                idx += 1

                if candidate_name == name:
                    mapping.setdefault(name, []).append(line_no)
                    break

    return mapping


# ------------------------------------------------------------
# GLOBAL CHECKS
# ------------------------------------------------------------
def run_global_checks(data, lines, emoji_line_map):
    errors = []

    id_lines = {}
    emoji_id_lines = {}
    server_lines = {}
    url_lines = {}
    category_lines = {}

    # ---------- SERVERS ----------
    for s in data.get("servers", []):
        name = s["server"]
        url = s["url"]

        server_lines.setdefault(name, []).append(
            get_server_line(lines, server_name=name)
        )
        url_lines.setdefault(url, []).append(
            get_server_line(lines, url=url)
        )

    # ---------- CATEGORIES ----------
    for cat in data.get("categories", []):
        cname = cat["name"]

        category_lines.setdefault(cname, []).append(
            get_category_line(lines, cname)
        )

        for emoji in cat.get("emojis", []):
            eid = emoji["id"]
            emoji_id = emoji.get("emoji_id")

            line = find_line(lines, f'"id": "{eid}"')

            id_lines.setdefault(eid, []).append(line)

            if emoji_id is not None:
                emoji_id_lines.setdefault(emoji_id, []).append(line)

    # ---------- REPORT ----------

    # Emoji name duplicates only
    for name, lines_list in emoji_line_map.items():
        if len(lines_list) > 1:
            errors.append(
                f"* {name} (lines {format_lines(lines_list)}) are duplicates on `name`"
            )

    # ID duplicates
    for value, lines_list in id_lines.items():
        if len(lines_list) > 1:
            errors.append(
                f"* {value} (lines {format_lines(lines_list)}) are duplicates on `id`"
            )

    # EMOJI_ID duplicates
    for value, lines_list in emoji_id_lines.items():
        if len(lines_list) > 1:
            errors.append(
                f"* {value} (lines {format_lines(lines_list)}) are duplicates on `emoji_id`"
            )

    # SERVER duplicates
    for value, lines_list in server_lines.items():
        if len(lines_list) > 1:
            errors.append(
                f"* Server `{value}` (lines {format_lines(lines_list)}) appears more than once in `servers.server`"
            )

    # URL duplicates
    for value, lines_list in url_lines.items():
        if len(lines_list) > 1:
            errors.append(
                f"* Server URL `{value}` (lines {format_lines(lines_list)}) appears more than once in `servers.url`"
            )

    # CATEGORY duplicates
    for value, lines_list in category_lines.items():
        if len(lines_list) > 1:
            errors.append(
                f"* Category `{value}` (lines {format_lines(lines_list)}) appears more than once as a category `name`"
            )

    return errors


# ------------------------------------------------------------
# FORMAT PYDANTIC ERRORS
# ------------------------------------------------------------
def format_pydantic_error(err, data, lines):
    loc = list(err["loc"])
    msg = err["msg"]
    err_type = err.get("type", "")

    # ---------- server errors ----------
    if len(loc) >= 2 and loc[0] == "servers":
        server_idx = loc[1]
        field = loc[-1] if isinstance(loc[-1], str) else "field"

        try:
            server = data["servers"][server_idx]
            server_name = server.get("server")
            url = server.get("url")
        except Exception:
            server_name = None
            url = None

        line = get_server_line(lines, server_name=server_name, url=url)

        if err_type == "missing":
            return f"* Server entry (line {line}) is missing required field `{field}`"

        return f"* Server entry (line {line}) has an invalid `{field}` value — {msg}"

    # ---------- category / emoji errors ----------
    if len(loc) >= 2 and loc[0] == "categories":
        cat_idx = loc[1]
        category_name = None
        try:
            category_name = data["categories"][cat_idx].get("name")
        except Exception:
            pass

        # Category-level error
        if len(loc) == 3 and isinstance(loc[2], str):
            field = loc[2]
            line = get_category_line(lines, category_name) if category_name else "unknown"

            if err_type == "missing":
                return f"* Category `{category_name or 'Unknown category'}` (line {line}) is missing required field `{field}`"

            return f"* Category `{category_name or 'Unknown category'}` (line {line}) has an invalid `{field}` value — {msg}"

        # Emoji-level error
        if len(loc) >= 4 and loc[2] == "emojis":
            emoji_idx = loc[3]
            emoji_name = get_emoji_name(data, cat_idx, emoji_idx)
            line = get_emoji_line(data, lines, cat_idx, emoji_idx, emoji_name=emoji_name)

            field = loc[-1] if isinstance(loc[-1], str) else "field"

            # Missing required field
            if err_type == "missing":
                return f"* {emoji_name} (line {line}) is missing required field `{field}`"

            # Paired field rules — convert to actionable messages
            if "emoji_id and emoji_server must both be set or both unset" in msg:
                try:
                    emoji = data["categories"][cat_idx]["emojis"][emoji_idx]
                    has_emoji_id = emoji.get("emoji_id") is not None
                    has_emoji_server = emoji.get("emoji_server") is not None
                except Exception:
                    has_emoji_id = False
                    has_emoji_server = False

                if has_emoji_id and not has_emoji_server:
                    return f"* {emoji_name} (line {line}) has `emoji_id` but is missing `emoji_server`"
                if has_emoji_server and not has_emoji_id:
                    return f"* {emoji_name} (line {line}) has `emoji_server` but is missing `emoji_id`"

                return f"* {emoji_name} (line {line}) must either set both `emoji_id` and `emoji_server`, or leave both unset"

            if "preset_type and preset_slot must both be set or both unset" in msg:
                try:
                    emoji = data["categories"][cat_idx]["emojis"][emoji_idx]
                    has_preset_type = emoji.get("preset_type") is not None
                    has_preset_slot = emoji.get("preset_slot") is not None
                except Exception:
                    has_preset_type = False
                    has_preset_slot = False

                if has_preset_type and not has_preset_slot:
                    return f"* {emoji_name} (line {line}) has `preset_type` but is missing `preset_slot`"
                if has_preset_slot and not has_preset_type:
                    return f"* {emoji_name} (line {line}) has `preset_slot` but is missing `preset_type`"

                return f"* {emoji_name} (line {line}) must either set both `preset_type` and `preset_slot`, or leave both unset"

            # Generic type/validation error
            return f"* {emoji_name} (line {line}) has an invalid `{field}` value — {msg}"

    # ---------- fallback ----------
    return f"* Validation error at `{' > '.join(str(p) for p in loc)}` — {msg}"


# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------
if __name__ == "__main__":
    with open("emojis_v2.json", "r", encoding="utf-8") as f:
        text = f.read()
        lines = text.splitlines()

    # ---------- JSON SYNTAX ----------
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        msg = f"* JSON error at line {e.lineno}, column {e.colno} — {e.msg}"
        print(msg)

        sys.exit(1)

    errors = []

    # ---------- STRUCTURE ----------
    try:
        EmojiSettingsV2.model_validate(data)
    except ValidationError as exc:
        for err in exc.errors():
            errors.append(format_pydantic_error(err, data, lines))

    # ---------- BUILD EMOJI LINE MAP ----------
    emoji_line_map = build_emoji_line_map(data, lines)

    # ---------- GLOBAL ----------
    errors.extend(run_global_checks(data, lines, emoji_line_map))

    # ---------- RESULT ----------
    if errors:
        print("❌ Emoji validation failed\n")
        for e in errors:
            print(e)

        sys.exit(1)

    print("✅ Validation passed")
    sys.exit(0)
