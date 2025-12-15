import json
from pathlib import Path

INPUT_FILE = Path("emojis_v2.json")
OUTPUT_FILE = Path("emojis_v2.json")  # overwrite in place

def main():
    with INPUT_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)

    for category in data.get("categories", []):
        emojis = category.get("emojis")
        if not isinstance(emojis, list):
            continue

        category["emojis"] = sorted(
            emojis,
            key=lambda e: e.get("name", "").lower()
        )

    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print("Emojis alphabetised within each category.")

if __name__ == "__main__":
    main()
