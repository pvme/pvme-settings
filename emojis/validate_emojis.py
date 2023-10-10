from pydantic import BaseModel, field_validator, ValidationError
from typing import ClassVar, Any


class DuplicateValueError(ValueError):
    def __init__(self, value):
        super().__init__(f"duplicate: {value}")


class UpperCaseError(ValueError):
    def __init__(self, value):
        super().__init__(f"upper case: {value}")


def check_duplicate(new_item: Any, unique_items: set[Any]):
    if new_item in unique_items:
        raise DuplicateValueError(new_item)
    unique_items.add(new_item)
    return new_item


class EmojiServer(BaseModel):
    UNIQUE_SERVERS: ClassVar[set[int]] = set()
    UNIQUE_URLS: ClassVar[set[str]] = set()

    server: int
    url: str

    @field_validator('server', mode='before')
    def duplicate_server(cls, v):
        return check_duplicate(v, cls.UNIQUE_SERVERS)

    @field_validator('url', mode='before')
    def duplicate_url(cls, v):
        return check_duplicate(v, cls.UNIQUE_URLS)


class Emoji(BaseModel):
    UNIQUE_NAMES: ClassVar[set[str]] = set()
    UNIQUE_EMOJI_NAMES: ClassVar[set[str]] = set()
    UNIQUE_EMOJI_IDS: ClassVar[set[int]] = set()
    UNIQUE_ALIASES: ClassVar[set[str]] = set()

    name: str
    emoji_name: str
    emoji_id: int
    aliases: list[str]

    @field_validator('emoji_name', mode='before')
    def capitalized_emoji_name(cls, v):
        for character in v:
            if character.isupper():
                raise UpperCaseError(v)
        return v

    @field_validator('aliases', mode='before')
    def capitalized_alias(cls, v):
        upper_cased_aliases = set()
        for alias in v:
            for character in alias:
                if character.isupper():
                    upper_cased_aliases.add(alias)

        if len(upper_cased_aliases) > 0:
            raise UpperCaseError(upper_cased_aliases)
        return v

    @field_validator('name', mode='before')
    def duplicate_name(cls, v):
        return check_duplicate(v, cls.UNIQUE_NAMES)

    @field_validator('emoji_name', mode='before')
    def duplicate_emoji_name(cls, v):
        return check_duplicate(v, cls.UNIQUE_EMOJI_NAMES)

    @field_validator('emoji_id', mode='before')
    def duplicate_emoji_id(cls, v):
        return check_duplicate(v, cls.UNIQUE_EMOJI_IDS)

    @field_validator('aliases', mode='before')
    def duplicate_alias(cls, v):
        duplicates = set()
        for alias in v:
            if alias in cls.UNIQUE_ALIASES:
                duplicates.add(alias)
            else:
                cls.UNIQUE_ALIASES.add(alias)

        if len(duplicates) > 0:
            raise DuplicateValueError(duplicates)
        return v


class Category(BaseModel):
    UNIQUE_NAME: ClassVar[set[str]] = set()

    name: str
    emojis: list[Emoji]

    @field_validator('name', mode='before')
    def duplicate_name(cls, v):
        check_duplicate(v, cls.UNIQUE_NAME)
        return v


class EmojiSettings(BaseModel):
    servers: list[EmojiServer]
    categories: list[Category]
    uncategorized: list[Emoji]


if __name__ == '__main__':
    try:
        with open('emojis.json', 'r', encoding='utf-8') as f:
            text = f.read()
        emojis = EmojiSettings.model_validate_json(text)

    except ValidationError as exc:
        print(f"{'Location':<40}{'Error':<30}\n{'-'*80}")
        for error in exc.errors():
            print(f"{'.'.join([str(loc) for loc in error['loc']]):<40}{error['msg']:<30}")
        print(f"{'='*80}\n")
        exit(-1)
