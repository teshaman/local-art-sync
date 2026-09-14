const MOD = "local-art-sync";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp"]);
const AUDIO_EXT = new Set(["mp3", "ogg", "wav", "webm", "m4a", "flac"]);
const VIDEO_EXT = new Set(["mp4", "webm", "m4v"]);
/** Standard category folders (mirrored in watcher/watch.mjs). "inbox" is the uncategorised drop. */
export const CATEGORIES = ["inbox", "npcs", "tokens", "portraits", "items", "feats", "spells", "classes", "backgrounds", "scenes", "journals", "locations", "factions", "misc"];

function onForge() {
  return typeof ForgeVTT !== "undefined" && !!ForgeVTT.usingTheForge;
}

function filePicker() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/** Root folder in the assets library. A legacy "art/inbox" setting is treated as root "art". */
export function rootPath() {
  return (game.settings.get(MOD, "assetsPath") || "art").replace(/^\/+|\/+$/g, "").replace(/\/inbox$/, "");
}

async function browse(path) {
  const FP = filePicker();
  try {
    return await FP.browse(onForge() ? "forgevtt" : "data", path);
  } catch (err) {
    if (/does not exist|not found|404/i.test(err.message ?? "")) return { dirs: [], files: [] };
    throw err;
  }
}

function toFile(url, category) {
  const name = decodeURIComponent(url.split("/").pop().split("?")[0]);
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const kind = IMAGE_EXT.has(ext) ? "image" : AUDIO_EXT.has(ext) ? "audio" : VIDEO_EXT.has(ext) ? "video" : "file";
  return { name, url, ext, kind, category, path: `${category}/${name}` };
}

/** Category folders that exist under the root right now (standard ones first, then any extra). */
export async function listCategories() {
  const root = await browse(rootPath());
  const found = (root.dirs ?? []).map(d => decodeURIComponent(String(d).replace(/\/+$/, "").split("/").pop()).toLowerCase());
  return [...CATEGORIES.filter(c => found.includes(c)), ...found.filter(c => !CATEGORIES.includes(c)).sort()];
}

/** Browse the root and every category folder: [{name, url, ext, kind, category, path}]. Root files count as "inbox". */
export async function browseInbox() {
  const rootDir = rootPath();
  const root = await browse(rootDir);
  const categories = await listCategories();
  const files = (root.files ?? []).map(url => toFile(url, "inbox"));
  const listings = await Promise.all(categories.map(c => browse(`${rootDir}/${c}`)));
  listings.forEach((res, i) => { for (const url of res.files ?? []) files.push(toFile(url, categories[i])); });
  files.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return files;
}

async function copyText(text) {
  try {
    if (game.clipboard?.copyPlainText) return game.clipboard.copyPlainText(text);
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn(`${MOD} | clipboard unavailable`, err);
  }
}

export class InboxApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;
  #files = [];
  #error = null;
  #filter = "";
  #category = "";
  #busy = false;

  static DEFAULT_OPTIONS = {
    id: "las-inbox",
    classes: ["las"],
    window: { title: "LAS.Title", icon: "fa-solid fa-images", resizable: true },
    position: { width: 760, height: 560 },
    actions: {
      refresh: InboxApp.#onRefresh,
      copy: InboxApp.#onCopy,
      open: InboxApp.#onOpen,
      applyToken: InboxApp.#onApplyToken
    }
  };

  static PARTS = {
    main: { template: `modules/${MOD}/templates/inbox.hbs`, scrollable: [".las-grid"] }
  };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("LAS.Notify.GMOnly"));
    InboxApp.#instance ??= new InboxApp();
    InboxApp.#instance.render({ force: true });
    InboxApp.#instance.refresh();
    return InboxApp.#instance;
  }

  async refresh() {
    if (this.#busy) return;
    this.#busy = true;
    this.#error = null;
    this.render();
    try {
      this.#files = await browseInbox();
    } catch (err) {
      this.#error = err.message;
      this.#files = [];
    }
    this.#busy = false;
    this.render();
  }

  #visible(f) {
    const q = this.#filter.toLowerCase();
    return (!this.#category || f.category === this.#category) && (!q || f.name.toLowerCase().includes(q));
  }

  async _prepareContext() {
    const present = new Set(this.#files.map(f => f.category));
    const categories = [...CATEGORIES, ...[...present].filter(c => !CATEGORIES.includes(c)).sort()]
      .map(c => ({ id: c, label: c, count: this.#files.filter(f => f.category === c).length, selected: c === this.#category }));
    return {
      files: this.#files.filter(f => this.#visible(f)),
      count: this.#files.length,
      filter: this.#filter,
      category: this.#category,
      categories,
      busy: this.#busy,
      error: this.#error,
      path: rootPath(),
      host: game.i18n.localize(onForge() ? "LAS.Host.Forge" : "LAS.Host.Local"),
      hasSelectedToken: (canvas?.tokens?.controlled?.length ?? 0) > 0
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const apply = () => {
      for (const card of this.element.querySelectorAll(".las-card")) {
        card.hidden = !this.#visible({ name: card.dataset.name, category: card.dataset.category });
      }
    };
    this.element.querySelector("input[data-filter]")?.addEventListener("input", ev => { this.#filter = ev.currentTarget.value; apply(); });
    this.element.querySelector("select[data-category]")?.addEventListener("change", ev => { this.#category = ev.currentTarget.value; apply(); });
    // Drag a card to drop its URL as text into any text field (e.g. an item's image path)
    for (const card of this.element.querySelectorAll(".las-card")) {
      card.addEventListener("dragstart", ev => {
        ev.dataTransfer.setData("text/plain", card.dataset.url);
      });
    }
  }

  #fileOf(target) {
    const card = target.closest(".las-card");
    return card ? { name: card.dataset.name, url: card.dataset.url } : null;
  }

  static async #onRefresh() { await this.refresh(); }

  static async #onCopy(event, target) {
    const f = this.#fileOf(target);
    if (!f) return;
    await copyText(f.url);
    ui.notifications.info(game.i18n.format("LAS.Notify.Copied", { name: f.name }));
  }

  static #onOpen(event, target) {
    const f = this.#fileOf(target);
    if (f) window.open(f.url, "_blank", "noopener");
  }

  /** Set the image on every controlled token (and, with shift, on its actor too). */
  static async #onApplyToken(event, target) {
    const f = this.#fileOf(target);
    const tokens = canvas?.tokens?.controlled ?? [];
    if (!f || !tokens.length) return ui.notifications.warn(game.i18n.localize("LAS.Notify.NoToken"));
    for (const t of tokens) {
      await t.document.update({ "texture.src": f.url });
      if (event.shiftKey && t.actor) await t.actor.update({ img: f.url, "prototypeToken.texture.src": f.url });
    }
    ui.notifications.info(game.i18n.format("LAS.Notify.Applied", { name: f.name, n: tokens.length }));
  }
}
