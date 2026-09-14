# Local Art Sync

Drop art into a folder on your PC (for example where ChatGPT saves generated images) and it appears in your Foundry world: on The Forge in your assets library, on a local Foundry in the Data folder. Save a file into a **category subfolder** (`npcs`, `items`, `feats`, `spells`, …) and it lands in the matching `art/<category>/` folder in the assets library. A GM window in the game lists the uploaded files by category with copy-URL and drag support, and the URLs are written to `manifest.json` next to the files so Claude Code, Codex/ChatGPT and macros can use them for NPCs, items, features, spells, scenes and tokens.

Two parts:

| Part | What it does |
|---|---|
| `watcher/watch.mjs` | Node script that runs on your PC, watches the folder and its category subfolders and uploads every new or changed image/audio file. Zero dependencies. |
| The Foundry module | GM-only **Art Inbox** window (Settings sidebar button or Configure Settings > Art Inbox) that browses `art/` and every category folder: thumbnails, category dropdown, filter, copy URL, open, set as token image, drag a card into any image-path field. Also an API for scripts. |

Why not a browser-only module? The GM plays in Firefox, which has no folder-access API, and The Forge only accepts uploads through its API. A small local script is the reliable way.

## Category folders

The watcher creates these subfolders in your local art folder on start, and mirrors them under the art root in the assets library:

| Local subfolder | Assets library folder | Use it for |
|---|---|---|
| *(root of the folder)* | `art/inbox` | anything unsorted |
| `npcs` | `art/npcs` | NPC and monster portraits (actor image) |
| `tokens` | `art/tokens` | token cutouts (prototype token image) |
| `portraits` | `art/portraits` | player character portraits |
| `items` | `art/items` | weapons, armour, gear, loot |
| `feats` | `art/feats` | feats, class features, boons |
| `spells` | `art/spells` | spells |
| `classes` | `art/classes` | class and subclass art |
| `backgrounds` | `art/backgrounds` | character backgrounds |
| `scenes` | `art/scenes` | battle maps and scene backgrounds |
| `journals` | `art/journals` | handouts and journal illustrations |
| `locations` | `art/locations` | place illustrations |
| `factions` | `art/factions` | faction symbols and banners |
| `misc` | `art/misc` | everything else |

Name files after the thing they belong to, in kebab-case: `goblin-chief.png`, `sunblade.webp`, `fireball.png`. Any extra subfolder you create is uploaded too, as its own category.

## Setup (The Forge)

1. On forge-vtt.com: **My Account > API Manager**, create an API key with assets library access (read + write assets). Keep it secret; store it once with `setx FORGE_API_KEY "<key>"` in your own terminal.
2. Install this module in the world (manifest URL below) and enable it. The **Art root folder** setting defaults to `art`; a legacy value of `art/inbox` still works.
3. Start the watcher, replacing the folder with the one ChatGPT or you save images into:

```powershell
node "C:\Users\alexg\Documents\Foundry\Pillars of palor\local-art-sync\watcher\watch.mjs" --folder "C:\Users\alexg\Pictures\Foundry Art"
```

Leave that window open while you work. Every new file is uploaded within a few seconds and its URL printed. Options: `--dest art` (art root), `--once` for a single pass, `--list` to print the manifest, `--no-folders` to skip creating the category folders, `--api-key <key>` instead of the environment variable.

## Setup (local Foundry)

No API key. Point the watcher at the Foundry Data folder instead of Forge:

```powershell
node ".\watcher\watch.mjs" --folder "C:\Users\alexg\Pictures\Foundry Art" --local-data "C:\Users\alexg\AppData\Local\FoundryVTT\Data"
```

## Using the art

- **In the game:** open Art Inbox, press Refresh, pick a category, then copy a URL, drag a card into an item's or feature's image field, or select tokens and press the token button (Shift also sets the actor portrait).
- **Claude Code / Codex:** read `manifest.json` in the watched folder (`"npcs/goblin-chief.png" -> {url, category}`), or through Claude Bridge run `game.modules.get("local-art-sync").api.list("npcs")` (also `find(text, category?)`, `urlFor("npcs/goblin-chief.png")`, `categories()`, `CATEGORIES`).
- **Macros:** `const art = await game.modules.get("local-art-sync").api.find("fireball", "spells");`

## Install

Manifest URL: `https://github.com/teshaman/local-art-sync/releases/latest/download/module.json`

## Notes

- Files still being written are skipped until they stop changing; a changed file is re-uploaded and overwrites the old one.
- The Forge API endpoints used are `assets/upload` and `assets/browse` with the `Access-Key` header, the same ones the Forge client module uses.
- The watcher never deletes anything, locally or remotely. Only one level of subfolders is scanned.
- Art generated inside Foundry by Familiar (generate-actor-art, generate-item-art, generate-image) is already Forge-hosted under `familiar/generated/` and applied by that tool; it does not need Art Sync.
