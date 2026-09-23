Original RuneScape screenshots supplied by the user on 23 September 2026 for icon extraction regression testing. These are unannotated source captures, not the app's detection overlays.

| Fixture | Original capture time | Purpose |
| --- | --- | --- |
| toolbelt.png | 09:20:18 | 10 frames, 40×40, 45-pixel horizontal pitch |
| bank.png | 09:20:29 | 7 unframed items with quantity labels |
| preset.png | 09:20:37 | Preserve existing inventory-template output |
| inventory.png | 09:20:52 | Preserve existing GE-template output |
| skill-guide.png | 09:21:07 | 8 frames, 33×32, 41-pixel vertical pitch; layered background |
| prayer-book.png | 09:25:31 | Preserve existing book output and circular artwork |
| spell-book.png | 09:26:27 | 9 independent 32×32 frames, 43px columns and 34px rows |
| ability-book.png | 09:27:06 | 10 independent 32×32 frames, including a new row after the section heading |

Run `npm test` from the repository root. Pixel baselines exclude PNG encoding, and geometry tests include source images translated within larger canvases.
