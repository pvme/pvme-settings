# Emojis

This folder lists the emojis used in PvME tools, presets, and guides.

---

## Files

| File           | Status | Purpose                                      |
| -------------- | ------ | -------------------------------------------- |
| emojis_v2.json | Current | Edit this file to add or update emojis |
| emojis.json    | Old | Kept for older tools; do not edit |

---

## Find duplicate emojis

From this folder, run `npm run dedupe`, then open `http://127.0.0.1:8787/`.

## Download Discord emojis

From the main project folder, run:

```sh
python emojis/scripts/download_emojis.py
```

You need Python installed. No extra packages are needed.

This downloads all Discord emojis listed in `emojis_v2.json` to
`emojis/scripts/downloads`, with a separate folder for each server. Images are saved as
WebP files at the largest size Discord provides, with animations kept.
Emojis that only have an image link are skipped.

Files you already downloaded are skipped. If any downloads fail, run the command
again to retry them.

To save somewhere else, add a folder after the command:

```sh
python emojis/scripts/download_emojis.py my-emojis
```

---

## How to add a new emoji

Choose one of these options based on where you want to use the emoji.

### Option A: Discord emoji (guides **and** presets)

Use this if the emoji should work in both **guide-editor** and **preset-maker**.

1. Upload the emoji to a PvME Discord Emoji Server
2. Copy the emoji ID and the PvME Emoji Server number
3. Add a new entry to `emojis_v2.json` using `emoji_id` and `emoji_server`
4. If the emoji has other names, add them under `id_aliases`

### Option B: Image upload (presets only)

Use this if the emoji is **only** needed in preset-maker.

1. Upload the image using the [PvME Image Store Discord bot](https://discord.com/channels/534508796639182860/771436827214086154)
2. Copy the generated image filename
3. Add a new entry to `emojis_v2.json` using the `image` field
4. If the emoji has other names, add them under `id_aliases`

---

## Example emoji entry

Each emoji has an entry like this in `emojis_v2.json`. Give each emoji its own `id`.

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

## What each field means

| Field        | Required              | Description                           |
| ------------ | --------------------- | ------------------------------------- |
| name         | Yes                   | Display name shown to users           |
| id           | Yes                   | Short name used by tools; must be unique |
| emoji_id     | emoji_id and/or image | Discord emoji ID                      |
| emoji_server | With emoji_id         | PvME Emoji Server number              |
| image        | emoji_id and/or image | Image filename hosted at img.pvme.io  |
| [preset_slot](#preset-slot-reference)  | No | Number for the equipment slot (see below) |
| id_aliases   | No                    | Other names tools can use for this emoji |
| preset_type  | No                    | `item` / `relic` / `familiar` / `prayer` |

## Preset slot reference

| `preset_slot` | Equipment Slot |
|---|---|
| 1 | Helm |
| 2 | Body |
| 3 | Legs |
| 4 | Main-hand weapon |
| 5 | Off-hand weapon |
| 6 | Gloves |
| 7 | Boots |
| 8 | Aura |
| 9 | Ammo |
| 10 | Necklace |
| 11 | Ring |
| 12 | Cape |
| 13 | Pocket |
