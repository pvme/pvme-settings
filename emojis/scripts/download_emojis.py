"""Download catalogue Discord emojis at maximum CDN size, grouped by server."""

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", type=Path, default=root / "scripts" / "downloads")
    args = parser.parse_args()
    data = json.loads((root / "emojis_v2.json").read_text(encoding="utf-8"))
    seen = set()
    downloaded = skipped = failed = 0
    for category in data["categories"]:
        for emoji in category["emojis"]:
            emoji_id = emoji.get("emoji_id")
            if not emoji_id:
                continue
            server = str(emoji["emoji_server"])
            key = (server, str(emoji_id))
            if key in seen:
                continue
            seen.add(key)
            # Keep filenames readable and valid on Windows; IDs avoid collisions.
            name = re.sub(r"[^A-Za-z0-9_-]", "_", emoji["id"])
            folder = re.sub(r"[^A-Za-z0-9_-]", "_", server)
            target = args.output / folder / f"{name}_{emoji_id}.webp"
            if target.is_file() and target.stat().st_size:
                skipped += 1
                continue
            # WebP supports every upload format, including animated WebP/AVIF.
            url = (f"https://cdn.discordapp.com/emojis/{emoji_id}.webp"
                   "?size=4096&quality=lossless&animated=true")
            request = Request(url, headers={"User-Agent": "pvme-emoji-downloader/1.0"})
            try:
                with urlopen(request, timeout=30) as response:
                    content = response.read()
                if content[:4] != b"RIFF" or content[8:12] != b"WEBP":
                    raise ValueError("CDN did not return a WebP image")
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_suffix(".part")
                temporary.write_bytes(content)
                temporary.replace(target)
                downloaded += 1
                print(target)
            except (URLError, OSError, ValueError) as error:
                failed += 1
                print(f"Failed {server}/{emoji_id}: {error}", file=sys.stderr)
    print(f"Downloaded: {downloaded}; existing: {skipped}; failed: {failed}")
    return bool(failed)


if __name__ == "__main__":
    sys.exit(main())
