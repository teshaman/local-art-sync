const MOD = "local-art-sync";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp"]);
const AUDIO_EXT = new Set(["mp3", "ogg", "wav", "webm", "m4a", "flac"]);
const VIDEO_EXT = new Set(["mp4", "webm", "m4v"]);

function onForge() {
  return typeof ForgeVTT !== "undefined" && !!ForgeVTT.usingTheForge;
}

function filePicker() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/** Browse the configured inbox folder in the assets library (Forge) or the data folder (local). */
export async function browseInbox() {
  const path = (game.settings.get(MOD, "assetsPath") || "art/inbox").replace(/^\/+|\/+$/g, "");
  const source = onForge() ? "forgevtt" : "data";
  const FP = filePicker();
  let result;
  try {
    result = await FP.browse(source, path);
  } catch (err) {
    if (/does not exist|not found|404/i.test(err.message ?? "")) return [];
    throw err;
  }
  const files = (result.files ?? []).map(url => {
    const name = decodeURIComponent(url.split("/").pop().split("?")[0]);
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const kind = IMAGE_EXT.has(ext) ? "image" : AUDIO_EXT.has(ext) ? "audio" : VIDEO_EXT.has(ext) ? "video" : "file";
    return { name, url, ext, kind };
  });
  files.sort((a, b) => a.name.localeCompare(b.name));
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

  async _prepareContext() {
    const q = this.#filter.toLowerCase();
    const files = this.#files.filter(f => !q || f.name.toLowerCase().includes(q));
    return {
      files,
      count: this.#files.length,
      filter: this.#filter,
      busy: this.#busy,
      error: this.#error,
      path: game.settings.get(MOD, "assetsPath"),
      host: game.i18n.localize(onForge() ? "LAS.Host.Forge" : "LAS.Host.Local"),
      hasSelectedToken: (canvas?.tokens?.controlled?.length ?? 0) > 0
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const input = this.element.querySelector("input[data-filter]");
    input?.addEventListener("input", ev => {
      this.#filter = ev.currentTarget.value;
      const q = this.#filter.toLowerCase();
      for (const card of this.element.querySelectorAll(".las-card")) {
        card.hidden = !!q && !card.dataset.name.toLowerCase().includes(q);
      }
    });
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
