# Local Art Sync

Drop art into a folder on your PC (for example where ChatGPT saves generated images) and it appears in your Foundry world: on The Forge in your assets library, on a local Foundry in the Data folder. A GM window in the game lists the uploaded files with copy-URL and drag support, and the URLs are written to `manifest.json` next to the files so Claude Code, Codex/ChatGPT and macros can use them for skills, items, features and tokens.

Two parts:

| Part | What it does |
|---|---|
| `watcher/watch.mjs` | Node script that runs on your PC, watches the folder and uploads every new or changed image/audio file. Zero dependencies. |
| The Foundry module | GM-only **Art Inbox** window (Settings sidebar button or Configure Settings > Art Inbox) that browses the inbox folder in the assets library: thumbnails, filter, copy URL, open, set as token image, drag a card into any image-path field. Also an API for scripts. |

Why not a browser-only module? The GM plays in Firefox, which has no folder-access API, and The Forge only accepts uploads through its API. A small local script is the reliable way.

## Setup (The Forge)

1. On forge-vtt.com: **My Account > API Manager**, create an API key with assets library access. Keep it secret.
2. Install this module in the world (manifest URL below) and enable it. Set the inbox path in its settings if you don't want `art/inbox`.
3. Start the watcher, replacing the folder with the one ChatGPT or you save images into:

```powershell
$env:FORGE_API_KEY = "paste-your-key"
node "C:\Users\alexg\Documents\Foundry\Pillars of palor\local-art-sync\watcher\watch.mjs" --folder "C:\Users\alexg\Pictures\Foundry Art" --dest art/inbox
```

Leave that window open while you work. Every new file is uploaded within a few seconds and its URL printed. Add `--once` for a single pass, `--list` to print the manifest.

## Setup (local Foundry)

No API key. Point the watcher at the Foundry Data folder instead of Forge:

```powershell
node ".\watcher\watch.mjs" --folder "C:\Users\alexg\Pictures\Foundry Art" --local-data "C:\Users\alexg\AppData\Local\FoundryVTT\Data" --dest art/inbox
```

## Using the art

- **In the game:** open Art Inbox, press Refresh, then copy a URL, drag a card into an item's or feature's image field, or select tokens and press the token button (Shift also sets the actor portrait).
- **Claude Code / Codex:** read `manifest.json` in the watched folder for `file name -> URL`, or through Claude Bridge run `game.modules.get("local-art-sync").api.list()` (also `find(text)` and `urlFor(name)`).
- **Macros:** `const art = await game.modules.get("local-art-sync").api.find("fireball");`

## Install

Manifest URL: `https://github.com/teshaman/local-art-sync/releases/latest/download/module.json`

## Notes

- Files still being written are skipped until they stop changing; a changed file is re-uploaded and overwrites the old one.
- The Forge API endpoints used are `assets/upload` and `assets/browse` with the `Access-Key` header, the same ones the Forge client module uses.
- The watcher never deletes anything, locally or remotely.
