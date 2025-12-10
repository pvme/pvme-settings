from pydantic import BaseModel, field_validator, ValidationError
from pydantic import ValidationInfo
from typing import ClassVar, Any


class DuplicateValueError(ValueError):
    def __init__(self, value):
        super().__init__(f"duplicate: {value}")


class UpperCaseError(ValueError):
    def __init__(self, value):
        super().__init__(f"upper case: {value}")


def check_duplicate(value: Any, store: set[Any]):
    if value in store:
        raise DuplicateValueError(value)
    store.add(value)
    return value


# ------------------------------------------------------------
# SERVERS  (matches your actual JSON)
# ------------------------------------------------------------
class EmojiServer(BaseModel):
    UNIQUE_SERVER_IDS: ClassVar[set[str]] = set()
    UNIQUE_URLS: ClassVar[set[str]] = set()

    server: str
    url: str

    @field_validator("server", mode="before")
    def unique_server(cls, v):
        return check_duplicate(v, cls.UNIQUE_SERVER_IDS)

    @field_validator("url", mode="before")
    def unique_url(cls, v):
        return check_duplicate(v, cls.UNIQUE_URLS)


# ------------------------------------------------------------
# EMOJI
# ------------------------------------------------------------
class Emoji(BaseModel):
    UNIQUE_NAMES: ClassVar[set[str]] = set()
    UNIQUE_IDS: ClassVar[set[str]] = set()
    UNIQUE_EMOJI_IDS: ClassVar[set[int]] = set()

    name: str
    id: str

    emoji_id: int | None = None
    emoji_server: int | None = None

    image: str | None = None

    preset_type: str | None = None
    preset_slot: int | None = None

    # LOWERCASE ID RULE
    @field_validator("id", mode="before")
    def lowercase_id(cls, v):
        if any(ch.isupper() for ch in v):
            raise UpperCaseError(v)
        return v

    # UNIQUENESS RULES
    @field_validator("name", mode="before")
    def unique_name(cls, v):
        return check_duplicate(v, cls.UNIQUE_NAMES)

    @field_validator("id", mode="before")
    def unique_id(cls, v):
        return check_duplicate(v, cls.UNIQUE_IDS)

    @field_validator("emoji_id", mode="before")
    def unique_emoji_id(cls, v):
        if v is None:
            return v
        return check_duplicate(v, cls.UNIQUE_EMOJI_IDS)

    # PAIRED RULES
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


# ------------------------------------------------------------
# CATEGORY
# ------------------------------------------------------------
class Category(BaseModel):
    UNIQUE_CATEGORY_NAMES: ClassVar[set[str]] = set()

    name: str
    emojis: list[Emoji]

    @field_validator("name", mode="before")
    def unique_category_name(cls, v):
        return check_duplicate(v, cls.UNIQUE_CATEGORY_NAMES)


# ------------------------------------------------------------
# ROOT STRUCTURE
# ------------------------------------------------------------
class EmojiSettingsV2(BaseModel):
    servers: list[EmojiServer]
    categories: list[Category]


# ------------------------------------------------------------
# MAIN EXECUTION
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        with open("emojis_v2.json", "r", encoding="utf-8") as f:
            text = f.read()

        parsed = EmojiSettingsV2.model_validate_json(text)

    except ValidationError as exc:
        lines = []
        lines.append(f"{'Location':<40}{'Error':<30}")
        lines.append("-" * 80)

        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"])
            msg = err["msg"]
            lines.append(f"{loc:<40}{msg:<30}")

        lines.append("=" * 80)
        error_text = "\n".join(lines)

        print(error_text)
        with open("emoji_errors.txt", "w") as f:
            f.write(error_text)

        exit(1)
