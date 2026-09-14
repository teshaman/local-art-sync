import { InboxApp, browseInbox, listCategories, CATEGORIES } from "./inbox-app.mjs";

export const MOD = "local-art-sync";

Hooks.once("init", () => {
  game.settings.register(MOD, "assetsPath", {
    name: "LAS.Settings.Path.Name",
    hint: "LAS.Settings.Path.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "art"
  });

  game.settings.registerMenu(MOD, "inbox", {
    name: "LAS.Settings.Menu.Name",
    label: "LAS.Settings.Menu.Label",
    hint: "LAS.Settings.Menu.Hint",
    icon: "fa-solid fa-images",
    type: InboxApp,
    restricted: true
  });

  const byCategory = async category => {
    const files = await browseInbox();
    return category ? files.filter(f => f.category === String(category).toLowerCase()) : files;
  };

  game.modules.get(MOD).api = {
    /** Standard category folder names (inbox, npcs, tokens, portraits, items, feats, spells, ...). */
    CATEGORIES,
    /** Open the Art Inbox window. */
    open: () => InboxApp.open(),
    /** Category folders that exist in the assets library right now. */
    categories: () => listCategories(),
    /** List files: [{name, url, ext, kind, category, path}]. Pass a category to restrict. Usable through Claude Bridge / Codex via run_script. */
    list: category => byCategory(category),
    /** Find files whose name contains the text (case-insensitive), optionally in one category. */
    find: async (text, category) => (await byCategory(category)).filter(f => f.name.toLowerCase().includes(String(text).toLowerCase())),
    /** URL of one file by exact name, or "category/name", or null. */
    urlFor: async (name, category) => {
      const [cat, file] = String(name).includes("/") ? String(name).split("/") : [category, name];
      return (await byCategory(cat)).find(f => f.name === file)?.url ?? null;
    }
  };
});

/** Settings sidebar button (GM only). */
Hooks.on("renderSettings", (app, html) => {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".las-launch")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "las-launch";
  button.innerHTML = `<i class="fa-solid fa-images"></i> ${game.i18n.localize("LAS.Title")}`;
  button.addEventListener("click", () => InboxApp.open());
  (root.querySelector("section") ?? root).appendChild(button);
});
