# local-art-sync — Changelog

All notable changes to this module. Newest version first.
Older packaged zips are kept in `backups/` and are never deleted.

## 1.1.0 — 2026-09-14
- Category subfolders: a file saved in <folder>\npcs\, \items\, \feats\, \spells\ (and the other standard categories) is uploaded to art/<category>/; root files go to art/inbox. The watcher creates the standard category folders on start (--no-folders skips it) and watches subfolders recursively. manifest.json keys are now <category>/<file> and carry category.
- Art Inbox browses the art root and every category folder: category dropdown with counts, category badge on each card, filter and drag/copy/token actions unchanged. The Art root folder setting defaults to art; a legacy art/inbox value is treated as art.
- Script API: list(category?), find(text, category?), urlFor("category/name"), categories(), CATEGORIES.
- README: category table, verified Forge setup, the art workflow.

## 1.0.0 — 2026-09-14
- Initial release: Node watcher uploads new files from a local folder to The Forge assets library (API key) or a local Foundry Data folder and writes manifest.json with the URLs; GM Art Inbox window lists the uploaded files with copy URL, open, set-as-token-image and drag support; script API list/find/urlFor for Claude Bridge, Codex and macros.
