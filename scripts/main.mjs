import { InboxApp, browseInbox } from "./inbox-app.mjs";

export const MOD = "local-art-sync";

Hooks.once("init", () => {
  game.settings.register(MOD, "assetsPath", {
    name: "LAS.Settings.Path.Name",
    hint: "LAS.Settings.Path.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "art/inbox"
  });

  game.settings.registerMenu(MOD, "inbox", {
    name: "LAS.Settings.Menu.Name",
    label: "LAS.Settings.Menu.Label",
    hint: "LAS.Settings.Menu.Hint",
    icon: "fa-solid fa-images",
    type: InboxApp,
    restricted: true
  });

  game.modules.get(MOD).api = {
    /** Open the Art Inbox window. */
    open: () => InboxApp.open(),
    /** List the files in the inbox folder: [{name, url, ext}]. Usable through Claude Bridge / Codex via run_script. */
    list: () => browseInbox(),
    /** Find files whose name contains the text (case-insensitive). */
    find: async text => (await browseInbox()).filter(f => f.name.toLowerCase().includes(String(text).toLowerCase())),
    /** URL of one file by exact name, or null. */
    urlFor: async name => (await browseInbox()).find(f => f.name === name)?.url ?? null
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
