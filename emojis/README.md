# Emojis

This folder contains the emoji definitions used across PvME tools, presets, and guides.

---

## Files

| File           | Status | Purpose                                      |
| -------------- | ------ | -------------------------------------------- |
| emojis_v2.json | Active | Current emoji schema used by all modern apps |
| emojis.json    | Legacy | Frozen for backwards compatibility           |

---

## How to add a new emoji

There are two supported ways to add an emoji. Choose **one** depending on where it needs to be used.

### Option A: Discord emoji (guides **and** presets)

Use this if the emoji should work in both **guide-editor** and **preset-maker**.

1. Upload the emoji to a PvME Discord Emoji Server
2. Copy the emoji ID and the PvME Emoji Server number
3. Add a new entry to `emojis_v2.json` using `emoji_id` and `emoji_server`
4. Optionally add `id_aliases`

### Option B: Image upload (presets only)

Use this if the emoji is **only** needed in preset-maker.

1. Upload the image via the PvME Image Store Discord bot: [https://discord.com/channels/534508796639182860/771436827214086154](https://discord.com/channels/534508796639182860/771436827214086154)
2. Copy the generated image filename
3. Add a new entry to `emojis_v2.json` using the `image` field
4. Optionally add `id_aliases`

---

## emojis_v2.json structure

Each emoji is defined as a structured object with a stable, unique identifier.

```json
{
  "name": "Abyssal wand",
  "id": "abyssalwand",
  "emoji_id": "841409588590805043",
  "emoji_server": "13",
  "image": "kSzcNN5.png",
  "preset_slot": 4,
  "preset_type": "item",
  "id_aliases": [
    "abbywand"
  ]
}
```

---

## Field reference

| Field        | Required              | Description                           |
| ------------ | --------------------- | ------------------------------------- |
| name         | Yes                   | Display name shown to users           |
| id           | Yes                   | Canonical identifier (must be unique) |
| emoji_id     | emoji_id and/or image | Discord emoji ID                      |
| emoji_server | Yes                   | Discord server ID                     |
| image        | emoji_id and/or image | Image filename hosted at img.pvme.io  |
| preset_slot  | No                    | Equipment / inventory slot index      |
| preset_type  | No                    | item, relic, or familiar              |
| id_aliases   | No                    | Alternative IDs for matching          |
