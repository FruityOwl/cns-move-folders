// Move & Folders for Cast & Scene
// An unofficial add-on. It talks to Cast & Scene only through its public
// `CastAndScene` API, its world settings and the elements it renders.

const MODULE_ID = "cns-move-folders";
const CNS_ID = "cast-and-scene";
const FOLDERS_SETTING = "poolFolders";
const ASSIGNMENTS_SETTING = "poolFolderAssignments";
const EXPANDED_KEY = `${MODULE_ID}.expandedFolders`;
const PRESETS_SETTING = "characterTabs";
const CREATION_SETTING = "presetCreationOrder";
const PRESET_SORT_KEY = `${MODULE_ID}.presetSort`;
const PRESET_SORTS = {
  manual: "PresetSortManual",
  nameAsc: "PresetSortNameAsc",
  nameDesc: "PresetSortNameDesc",
  newest: "PresetSortNewest",
  oldest: "PresetSortOldest"
};

const t = (key, data = null) => data ? game.i18n.format(`CNSMF.${key}`, data) : game.i18n.localize(`CNSMF.${key}`);
const isGM = () => Boolean(game.user?.isGM);
const castAndSceneReady = () => Boolean(game.modules?.get(CNS_ID)?.active && globalThis.CastAndScene);
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function castSetting(key, fallback) {
  try {
    const value = game.settings.get(CNS_ID, key);
    return value ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

/* -------------------------------------------- */
/*  Move mode                                    */
/* -------------------------------------------- */

class MoveMode {
  static enabled = false;
  static drag = null;

  static stage() {
    return document.getElementById("fvn-stage");
  }

  static set(enabled = !this.enabled) {
    this.enabled = Boolean(enabled) && isGM() && castAndSceneReady();
    this.applyToStage();
    if (!this.enabled && this.drag) this.cancel();
    DirectorUI.syncMoveButtons();
    QuickAccessUI.syncMoveButton();
    return this.enabled;
  }

  static applyToStage() {
    const stage = this.stage();
    if (!stage) return;
    stage.classList.toggle("cnsmf-moving", this.enabled);
    let hint = stage.querySelector(":scope > .cnsmf-move-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "cnsmf-move-hint";
      hint.setAttribute("aria-hidden", "true");
      stage.appendChild(hint);
    }
    hint.textContent = t("MoveHint");
    hint.hidden = !this.enabled;
  }

  static activate() {
    document.addEventListener("pointerdown", (event) => this.onPointerDown(event), true);
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !this.enabled) return;
      if (event.target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      // Leave Move mode without also opening Foundry's own Escape menu.
      event.preventDefault();
      event.stopPropagation();
      this.set(false);
    }, true);
  }

  static onPointerDown(event) {
    if (!this.enabled || event.button !== 0) return;
    const wrap = event.target.closest?.("#fvn-stage .fvn-stage__portrait-wrap");
    if (!wrap || wrap.matches(".fvn-stage__portrait-wrap--preview, .fvn-stage__portrait-wrap--exiting, .fvn-stage__portrait-wrap--editing-hidden")) return;
    const stage = this.stage();
    const portrait = CastAndScene.getState().portraits.find((entry) => String(entry.id) === String(wrap.dataset.portraitId));
    // The portraits layer sits inside the camera world, so its client rect
    // already includes any Camera Focus zoom and pan.
    const rect = stage?.querySelector(".fvn-stage__portraits")?.getBoundingClientRect();
    if (!portrait || !rect?.width || !rect?.height) return;

    const x = clamp01(portrait.x);
    const y = clamp01(portrait.y);
    const label = stage.querySelector(`.fvn-stage__nameplate[data-nameplate-id="${CSS.escape(String(portrait.id))}"]`);
    const drag = {
      pointerId: event.pointerId,
      wrap,
      portrait,
      startX: x,
      startY: y,
      x,
      y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      grabOffsetX: event.clientX - (rect.left + x * rect.width),
      grabOffsetY: event.clientY - (rect.top + y * rect.height),
      label,
      labelLeft: label?.style.left ?? "",
      labelTop: label?.style.top ?? "",
      floatingLabel: Boolean(label?.closest(".fvn-stage__names--floating")),
      moved: false
    };
    const move = (moveEvent) => {
      if (moveEvent.pointerId === drag.pointerId) this.onPointerMove(moveEvent);
    };
    const end = (endEvent) => {
      if (endEvent.pointerId !== drag.pointerId || this.drag !== drag) return;
      if (endEvent.type === "pointercancel") return this.cancel();
      this.finish();
      if (drag.moved) void this.save(drag.portrait.characterId ?? drag.portrait.id, drag.x, drag.y);
    };
    drag.detach = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
    };
    this.drag = drag;
    wrap.classList.add("cnsmf-dragging");
    document.documentElement.classList.add("cnsmf-document-dragging");
    event.preventDefault();
    event.stopPropagation();
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
  }

  static onPointerMove(event) {
    const drag = this.drag;
    const rect = this.stage()?.querySelector(".fvn-stage__portraits")?.getBoundingClientRect();
    if (!drag || !rect?.width || !rect?.height) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < 3) return;
    drag.moved = true;
    drag.x = clamp01((event.clientX - drag.grabOffsetX - rect.left) / rect.width);
    drag.y = clamp01((event.clientY - drag.grabOffsetY - rect.top) / rect.height);
    drag.wrap.style.left = `${drag.x * 100}%`;
    drag.wrap.style.top = `${drag.y * 100}%`;
    if (!drag.label) return;
    if (drag.floatingLabel) {
      drag.label.style.left = `${(Number.parseFloat(drag.labelLeft) || 0) + event.clientX - drag.startClientX}px`;
      drag.label.style.top = `${(Number.parseFloat(drag.labelTop) || 0) + event.clientY - drag.startClientY}px`;
    } else {
      drag.label.style.left = `${drag.x * 100}%`;
      drag.label.style.top = drag.labelTop.replace(/-?\d+(?:\.\d+)?%/, `${drag.y * 100}%`);
    }
  }

  static finish() {
    const drag = this.drag;
    this.drag = null;
    if (drag) {
      drag.detach();
      drag.wrap.classList.remove("cnsmf-dragging");
    }
    document.documentElement.classList.remove("cnsmf-document-dragging");
    return drag;
  }

  static cancel() {
    const drag = this.finish();
    if (!drag) return;
    drag.wrap.style.left = `${drag.startX * 100}%`;
    drag.wrap.style.top = `${drag.startY * 100}%`;
    if (drag.label) {
      drag.label.style.left = drag.labelLeft;
      drag.label.style.top = drag.labelTop;
    }
  }

  // One write for the Scene Preset character, one for the live Stage.
  static async save(characterId, x, y) {
    if (!isGM() || !castAndSceneReady()) return false;
    const round = (value) => Math.round(clamp01(value) * 10000) / 10000;
    const position = { x: round(x), y: round(y) };
    const library = foundry.utils.deepClone(castSetting("characterLibrary", []));
    const entry = Array.isArray(library) ? library.find((item) => String(item?.id) === String(characterId)) : null;
    if (entry) {
      Object.assign(entry, position);
      await game.settings.set(CNS_ID, "characterLibrary", library);
    }
    const state = CastAndScene.getState();
    const portrait = state.portraits.find((item) => String(item.characterId ?? item.id) === String(characterId));
    if (portrait) {
      Object.assign(portrait, position);
      await CastAndScene.commitState(state);
    }
    return true;
  }
}

/* -------------------------------------------- */
/*  Character Pool folders: data                 */
/* -------------------------------------------- */

class PoolFolders {
  static getFolders() {
    const folders = game.settings.get(MODULE_ID, FOLDERS_SETTING);
    return Array.isArray(folders) ? folders.filter((folder) => folder?.id && typeof folder.name === "string") : [];
  }

  static async setFolders(folders) {
    await game.settings.set(MODULE_ID, FOLDERS_SETTING, folders);
  }

  static getAssignments() {
    const value = game.settings.get(MODULE_ID, ASSIGNMENTS_SETTING);
    return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  }

  static async setAssignments(assignments) {
    await game.settings.set(MODULE_ID, ASSIGNMENTS_SETTING, assignments);
  }

  static poolIds() {
    const pool = castSetting("characterPool", []);
    return Array.isArray(pool) ? pool.map((entry) => String(entry?.id)) : [];
  }

  static tree() {
    const folders = this.getFolders();
    const ids = new Set(folders.map((folder) => String(folder.id)));
    const parentOf = (folder) => {
      const parentId = folder.parentId ? String(folder.parentId) : "";
      return parentId && ids.has(parentId) && parentId !== String(folder.id) ? parentId : "";
    };
    const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    const children = new Map();
    for (const folder of sorted) {
      const parentId = parentOf(folder);
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(folder);
    }
    // A folder caught in a parent loop is shown at the top level instead of vanishing.
    const reached = new Set();
    const walk = (parentId) => {
      for (const folder of children.get(parentId) ?? []) {
        if (reached.has(String(folder.id))) continue;
        reached.add(String(folder.id));
        walk(String(folder.id));
      }
    };
    walk("");
    for (const folder of sorted) {
      if (reached.has(String(folder.id))) continue;
      const siblings = children.get(parentOf(folder)) ?? [];
      const index = siblings.indexOf(folder);
      if (index >= 0) siblings.splice(index, 1);
      if (!children.has("")) children.set("", []);
      children.get("").push(folder);
      reached.add(String(folder.id));
      walk(String(folder.id));
    }
    return { folders, ids, children };
  }

  static folderOf(characterId, ids, assignments = this.getAssignments()) {
    const folderId = assignments[String(characterId)] ? String(assignments[String(characterId)]) : "";
    return folderId && ids.has(folderId) ? folderId : "";
  }

  static isInside(folderId, ancestorId, folders = this.getFolders()) {
    const byId = new Map(folders.map((folder) => [String(folder.id), folder]));
    const seen = new Set();
    let current = byId.get(String(folderId));
    while (current && !seen.has(String(current.id))) {
      if (String(current.id) === String(ancestorId)) return true;
      seen.add(String(current.id));
      current = current.parentId ? byId.get(String(current.parentId)) : null;
    }
    return false;
  }

  static options({ exclude = null } = {}) {
    const { children, folders } = this.tree();
    const options = [{ id: "", label: t("NoFolder") }];
    const walk = (parentId, depth) => {
      for (const folder of children.get(parentId) ?? []) {
        if (exclude && this.isInside(folder.id, exclude, folders)) continue;
        options.push({ id: String(folder.id), label: `${"   ".repeat(depth)}${folder.name}` });
        walk(String(folder.id), depth + 1);
      }
    };
    walk("", 0);
    return options;
  }

  static optionsHtml(selected = "", options = this.options()) {
    return options.map((option) => `<option value="${escapeHtml(option.id)}" ${option.id === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  }

  static totals() {
    const { ids, children } = this.tree();
    const assignments = this.getAssignments();
    const direct = new Map();
    for (const id of this.poolIds()) {
      const folderId = this.folderOf(id, ids, assignments);
      direct.set(folderId, (direct.get(folderId) ?? 0) + 1);
    }
    const totals = new Map();
    const total = (folderId) => {
      if (totals.has(folderId)) return totals.get(folderId);
      totals.set(folderId, 0);
      const count = (direct.get(folderId) ?? 0) + (children.get(folderId) ?? []).reduce((sum, folder) => sum + total(String(folder.id)), 0);
      totals.set(folderId, count);
      return count;
    };
    return total;
  }

  static expanded() {
    try {
      const value = JSON.parse(localStorage.getItem(EXPANDED_KEY) || "[]");
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch (_error) {
      return new Set();
    }
  }

  static setExpanded(folderId, open) {
    if (!folderId) return;
    const set = this.expanded();
    if (open) set.add(String(folderId)); else set.delete(String(folderId));
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set])); } catch (_error) { /* view preference only */ }
  }

  static async assign(characterIds, folderId) {
    const { ids } = this.tree();
    const target = folderId && ids.has(String(folderId)) ? String(folderId) : "";
    const assignments = this.getAssignments();
    let changed = false;
    for (const id of characterIds) {
      const key = String(id);
      if ((assignments[key] ?? "") === target) continue;
      if (target) assignments[key] = target; else delete assignments[key];
      changed = true;
    }
    if (!changed) return false;
    // Forget assignments for characters that were deleted from the pool.
    const pool = new Set(this.poolIds());
    for (const key of Object.keys(assignments)) if (!pool.has(key)) delete assignments[key];
    if (target) this.setExpanded(target, true);
    await this.setAssignments(assignments);
    return true;
  }

  static async moveFolder(folderId, parentId = null) {
    const folders = foundry.utils.deepClone(this.getFolders());
    const folder = folders.find((entry) => String(entry.id) === String(folderId));
    if (!folder) return false;
    const target = parentId && folders.some((entry) => String(entry.id) === String(parentId)) ? String(parentId) : null;
    if (target && this.isInside(target, folder.id, folders)) {
      ui.notifications.warn(t("FolderCycle"));
      return false;
    }
    if ((folder.parentId ?? null) === target) return false;
    folder.parentId = target;
    if (target) this.setExpanded(target, true);
    await this.setFolders(folders);
    return true;
  }

  static async create(name, parentId = null) {
    const folders = foundry.utils.deepClone(this.getFolders());
    const parent = parentId && folders.some((entry) => String(entry.id) === String(parentId)) ? String(parentId) : null;
    const folder = { id: foundry.utils.randomID(), name, parentId: parent };
    folders.push(folder);
    this.setExpanded(folder.id, true);
    if (parent) this.setExpanded(parent, true);
    await this.setFolders(folders);
    return folder;
  }

  static async rename(folderId, name) {
    const folders = foundry.utils.deepClone(this.getFolders());
    const folder = folders.find((entry) => String(entry.id) === String(folderId));
    if (!folder || !name) return false;
    folder.name = name;
    await this.setFolders(folders);
    return true;
  }

  // Deleting a folder never deletes characters: contents move up one level.
  static async remove(folderId) {
    const folders = foundry.utils.deepClone(this.getFolders());
    const folder = folders.find((entry) => String(entry.id) === String(folderId));
    if (!folder) return false;
    const parent = folders.find((entry) => String(entry.id) === String(folder.parentId) && entry !== folder);
    const assignments = this.getAssignments();
    const members = Object.keys(assignments).filter((key) => String(assignments[key]) === String(folder.id));
    const subfolders = folders.filter((entry) => String(entry.parentId ?? "") === String(folder.id));
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("DeleteFolder") },
      content: `<p>${t("DeleteFolderConfirm", {
        name: escapeHtml(folder.name),
        count: members.length,
        folders: subfolders.length,
        parent: parent ? escapeHtml(parent.name) : t("TopLevel")
      })}</p>`,
      yes: { icon: "<i class='fa-solid fa-trash'></i>", label: t("Delete") },
      no: { label: t("Cancel") },
      modal: true
    });
    if (!confirmed) return false;
    for (const key of members) {
      if (parent) assignments[key] = parent.id; else delete assignments[key];
    }
    for (const child of subfolders) child.parentId = parent?.id ?? null;
    if (members.length) await this.setAssignments(assignments);
    await this.setFolders(folders.filter((entry) => entry !== folder));
    this.setExpanded(folder.id, false);
    return true;
  }
}

/* -------------------------------------------- */
/*  Scene preset order                           */
/* -------------------------------------------- */

class PresetOrder {
  static collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  static observers = new WeakMap();
  static drag = null;
  static pendingOrder = null;
  static recording = Promise.resolve();

  static presets() {
    const presets = castSetting(PRESETS_SETTING, []);
    return Array.isArray(presets) ? presets.filter((preset) => preset?.id) : [];
  }

  static getSort() {
    try {
      const sort = localStorage.getItem(PRESET_SORT_KEY);
      return sort && Object.hasOwn(PRESET_SORTS, sort) ? sort : "manual";
    } catch (_error) {
      return "manual";
    }
  }

  static setSort(sort) {
    try { localStorage.setItem(PRESET_SORT_KEY, sort); } catch (_error) { /* view preference only */ }
    for (const select of document.querySelectorAll(".cnsmf-preset-sort select")) select.value = sort;
    this.apply();
  }

  static creationOrder() {
    const order = game.settings.get(MODULE_ID, CREATION_SETTING);
    return Array.isArray(order) ? order.map(String) : [];
  }

  // Cast & Scene stores no dates, but it only ever appends presets, so the list
  // is in creation order until this add-on first reorders it. Snapshot it once
  // and append anything new from then on.
  static recordCreation() {
    this.recording = this.recording.then(async () => {
      const ids = this.presets().map((preset) => String(preset.id));
      const present = new Set(ids);
      const stored = this.creationOrder();
      const known = new Set(stored);
      const next = [...stored.filter((id) => present.has(id)), ...ids.filter((id) => !known.has(id))];
      if (next.length !== stored.length || next.some((id, index) => id !== stored[index])) await game.settings.set(MODULE_ID, CREATION_SETTING, next);
    }).catch((error) => console.error(`${MODULE_ID} | Could not record preset creation order`, error));
    return this.recording;
  }

  // Sorting only decides what is shown; the saved list stays the manual order.
  static displayOrder(sort = this.getSort()) {
    if (this.pendingOrder) return this.pendingOrder;
    const presets = this.presets().map((preset, index) => ({ id: String(preset.id), name: String(preset.name ?? ""), index }));
    const created = new Map(this.creationOrder().map((id, index) => [id, index]));
    const age = (preset) => created.get(preset.id) ?? created.size + preset.index;
    const compare = {
      nameAsc: (a, b) => this.collator.compare(a.name, b.name),
      nameDesc: (a, b) => this.collator.compare(b.name, a.name),
      newest: (a, b) => age(b) - age(a),
      oldest: (a, b) => age(a) - age(b)
    }[sort];
    if (compare) presets.sort((a, b) => compare(a, b) || a.index - b.index);
    return presets.map((preset) => preset.id);
  }

  static arrange(region) {
    const items = [...region.querySelectorAll(":scope > [data-tab-id]")];
    if (region.matches("[data-region='tabs']")) for (const item of items) item.draggable = true;
    const position = new Map(this.displayOrder().map((id, index) => [id, index]));
    const place = (item) => position.get(item.dataset.tabId) ?? position.size;
    // Quick Access keeps presets bound to the current scene at the front.
    const group = (item) => item.classList.contains("is-scene-bound") ? 0 : 1;
    const sorted = [...items].sort((a, b) => group(a) - group(b) || place(a) - place(b));
    if (sorted.every((item, index) => item === items[index])) return;
    const observer = this.observers.get(region);
    observer?.disconnect();
    region.append(...sorted);
    observer?.observe(region, { childList: true });
  }

  static apply() {
    for (const region of document.querySelectorAll("#fvn-director [data-region='tabs'], #fvn-scene-palette [data-region='palette-tabs']")) this.arrange(region);
  }

  static watch(region) {
    if (!region || this.observers.has(region)) return;
    const observer = new MutationObserver(() => {
      void this.recordCreation();
      this.arrange(region);
    });
    this.observers.set(region, observer);
    observer.observe(region, { childList: true });
    this.arrange(region);
  }

  static attachDirector(panel) {
    const region = panel.querySelector("[data-region='tabs']");
    if (!region) return;
    this.injectSortControl(region);
    this.listenDrag(region);
    this.watch(region);
  }

  static injectSortControl(region) {
    const label = document.createElement("label");
    label.className = "cnsmf-preset-sort";
    label.title = t("PresetSortTooltip");
    label.innerHTML = `<i class="fa-solid fa-arrow-down-short-wide" aria-hidden="true"></i><select aria-label="${t("PresetSortLabel")}">${
      Object.entries(PRESET_SORTS).map(([sort, key]) => `<option value="${sort}">${t(key)}</option>`).join("")
    }</select>`;
    const select = label.querySelector("select");
    select.value = this.getSort();
    select.addEventListener("change", () => this.setSort(select.value));
    region.before(label);
  }

  static shownIds(region) {
    return [...region.querySelectorAll(":scope > .fvn-tab[data-tab-id]")].map((tab) => tab.dataset.tabId);
  }

  // Works from the pointer position, so gaps and the empty space below the list count too.
  static dropSlot(region, event) {
    const tabs = [...region.querySelectorAll(":scope > .fvn-tab[data-tab-id]")];
    if (!tabs.length) return null;
    const horizontal = getComputedStyle(region).flexDirection.startsWith("row");
    const next = tabs.find((tab) => {
      const rect = tab.getBoundingClientRect();
      return horizontal ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
    });
    return next ? { tab: next, after: false } : { tab: tabs.at(-1), after: true };
  }

  static orderAfterDrop(region, id, slot) {
    const shown = this.shownIds(region);
    const order = shown.filter((entry) => entry !== id);
    if (slot.tab.dataset.tabId === id) return shown;
    order.splice(order.indexOf(slot.tab.dataset.tabId) + (slot.after ? 1 : 0), 0, id);
    return order;
  }

  static listenDrag(region) {
    const clearSlot = () => {
      for (const tab of region.querySelectorAll(".cnsmf-drop-before, .cnsmf-drop-after")) tab.classList.remove("cnsmf-drop-before", "cnsmf-drop-after");
    };
    const unchanged = (order) => this.shownIds(region).every((id, index) => id === order[index]);
    region.addEventListener("dragstart", (event) => {
      const tab = event.target.closest?.(".fvn-tab[data-tab-id]");
      if (!tab) return;
      this.drag = tab.dataset.tabId;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-cnsmf-preset", this.drag);
      tab.classList.add("is-dragging");
    });
    region.addEventListener("dragover", (event) => {
      if (!this.drag) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearSlot();
      const slot = this.dropSlot(region, event);
      if (slot && !unchanged(this.orderAfterDrop(region, this.drag, slot))) slot.tab.classList.add(slot.after ? "cnsmf-drop-after" : "cnsmf-drop-before");
    });
    region.addEventListener("dragleave", (event) => {
      if (!region.contains(event.relatedTarget)) clearSlot();
    });
    region.addEventListener("drop", async (event) => {
      const id = this.drag;
      if (!id) return;
      event.preventDefault();
      clearSlot();
      this.drag = null;
      const slot = this.dropSlot(region, event);
      if (!slot) return;
      const order = this.orderAfterDrop(region, id, slot);
      if (!unchanged(order)) await this.saveManualOrder(order);
    });
    region.addEventListener("dragend", () => {
      this.drag = null;
      clearSlot();
      for (const tab of region.querySelectorAll(".is-dragging")) tab.classList.remove("is-dragging");
    });
  }

  // The order on screen becomes the manual order, even if a sort was active.
  static async saveManualOrder(ids) {
    const position = new Map(ids.map((id, index) => [id, index]));
    const presets = foundry.utils.deepClone(this.presets());
    const place = (preset) => position.get(String(preset.id)) ?? position.size;
    const ordered = presets.map((preset, index) => ({ preset, index }))
      .sort((a, b) => place(a.preset) - place(b.preset) || a.index - b.index)
      .map((entry) => entry.preset);
    // The drop shows at once; the world setting takes a moment to save.
    this.pendingOrder = ordered.map((preset) => String(preset.id));
    this.setSort("manual");
    try {
      await game.settings.set(CNS_ID, PRESETS_SETTING, ordered);
    } finally {
      this.pendingOrder = null;
      this.apply();
    }
  }

  static onSettingChanged(setting) {
    if (setting?.key !== `${CNS_ID}.${PRESETS_SETTING}`) return;
    void this.recordCreation();
    this.apply();
  }
}

/* -------------------------------------------- */
/*  Small dialogs                                */
/* -------------------------------------------- */

class Dialogs {
  static readField(button, dialog, name) {
    return (button?.form ?? dialog?.element)?.querySelector?.(`[name="${name}"]`)?.value ?? "";
  }

  static async folderName({ title, value = "" }) {
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content: `<div class="form-group"><label>${t("FolderName")}</label><input type="text" name="cnsmfFolderName" maxlength="80" autocomplete="off" value="${escapeHtml(value)}" autofocus /></div>`,
      ok: { icon: "fa-solid fa-check", label: t("Save"), callback: (_event, button, dialog) => this.readField(button, dialog, "cnsmfFolderName") },
      rejectClose: false
    });
    const name = typeof result === "string" ? result.trim() : "";
    return name || null;
  }

  static async pickFolder({ title, selected = "", exclude = null }) {
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content: `<div class="form-group"><label>${t("Folder")}</label><select name="cnsmfFolderId">${PoolFolders.optionsHtml(selected, PoolFolders.options({ exclude }))}</select></div>`,
      ok: { icon: "fa-solid fa-folder-tree", label: t("Move"), callback: (_event, button, dialog) => this.readField(button, dialog, "cnsmfFolderId") },
      rejectClose: false
    });
    return typeof result === "string" ? result : null;
  }
}

/* -------------------------------------------- */
/*  Director integration                         */
/* -------------------------------------------- */

class DirectorUI {
  static panel = null;
  static listObserver = null;
  static pickerObserver = null;
  static editorObserver = null;
  static editingId = null;
  static pendingFolderId = null;
  static openingInFolder = false;
  static pendingSave = null;
  static contextCardId = null;
  static drag = null;
  static pickerTicks = new Set();

  static attach(panel) {
    if (!panel || panel.dataset.cnsmfAttached) return;
    panel.dataset.cnsmfAttached = "true";
    this.panel = panel;
    this.injectMoveButton(panel);
    this.injectFolderButton(panel);
    this.injectEditorField(panel);
    this.listenClicks(panel);
    this.listenDragAndDrop(panel);
    this.listenPicker(panel);
    PresetOrder.attachDirector(panel);

    const list = panel.querySelector("[data-region='character-list']");
    this.listObserver = new MutationObserver(() => this.groupList());
    if (list) this.listObserver.observe(list, { childList: true });
    const pickerList = panel.querySelector('[data-region="pool-picker-list"]');
    this.pickerObserver = new MutationObserver(() => this.groupPicker());
    if (pickerList) this.pickerObserver.observe(pickerList, { childList: true });
    const editor = panel.querySelector("[data-region='editor']");
    this.editorObserver = new MutationObserver(() => this.onEditorToggle());
    if (editor) this.editorObserver.observe(editor, { attributes: true, attributeFilter: ["class"] });
    this.syncMoveButtons();
    this.groupList();
  }

  static isPoolMode() {
    return Boolean(this.panel?.isConnected && this.panel.classList.contains("fvn-director--pool-mode"));
  }

  /* Re-render through Cast & Scene's own search handlers. */
  static refresh() {
    if (!this.panel?.isConnected) return;
    this.panel.querySelector("[data-field='search']")?.dispatchEvent(new Event("input"));
    this.panel.querySelector("[data-field='pool-search']")?.dispatchEvent(new Event("input"));
  }

  static injectMoveButton(panel) {
    const actions = panel.querySelector(".fvn-stage-actions");
    if (!actions || actions.querySelector(".cnsmf-move-toggle")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cnsmf-move-toggle";
    button.dataset.cnsmfAction = "toggle-move";
    button.title = t("MoveTooltip");
    button.innerHTML = `<i class="fa-solid fa-up-down-left-right"></i> <span>${t("MoveStart")}</span>`;
    actions.appendChild(button);
  }

  static syncMoveButtons() {
    for (const button of document.querySelectorAll(".cnsmf-move-toggle")) {
      button.classList.toggle("is-active", MoveMode.enabled);
      button.setAttribute("aria-pressed", String(MoveMode.enabled));
      const label = button.querySelector("span");
      if (label) label.textContent = t(MoveMode.enabled ? "MoveStop" : "MoveStart");
    }
  }

  static injectFolderButton(panel) {
    const toolbar = panel.querySelector(".fvn-toolbar");
    if (!toolbar || toolbar.querySelector(".cnsmf-new-folder")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cnsmf-new-folder";
    button.dataset.cnsmfAction = "new-folder";
    button.title = t("NewFolder");
    button.setAttribute("aria-label", t("NewFolder"));
    button.innerHTML = '<i class="fa-solid fa-folder-plus"></i>';
    toolbar.insertBefore(button, toolbar.querySelector('[data-action="new-character"]'));
  }

  static injectEditorField(panel) {
    const editor = panel.querySelector("[data-region='editor']");
    if (!editor || editor.querySelector(".cnsmf-folder-field")) return;
    const field = document.createElement("label");
    field.className = "cnsmf-folder-field";
    field.innerHTML = `<span>${t("Folder")}</span><select name="cnsmfFolderId"></select>`;
    const anchor = editor.querySelector('[data-region="editor-tab-field"]');
    if (anchor) anchor.after(field);
    else editor.querySelector(".fvn-editor__scroll")?.appendChild(field);

    editor.addEventListener("submit", () => {
      if (!this.isPoolMode()) return;
      this.pendingSave = {
        editingId: this.editingId,
        folderId: editor.querySelector('[name="cnsmfFolderId"]')?.value ?? "",
        before: new Set(PoolFolders.poolIds())
      };
    }, true);
  }

  static onEditorToggle() {
    const editor = this.panel?.querySelector("[data-region='editor']");
    if (!editor || editor.classList.contains("fvn-editor--hidden") || !this.isPoolMode()) return;
    const select = editor.querySelector('[name="cnsmfFolderId"]');
    if (!select) return;
    const { ids } = PoolFolders.tree();
    const selected = this.editingId
      ? PoolFolders.folderOf(this.editingId, ids)
      : (this.pendingFolderId && ids.has(String(this.pendingFolderId)) ? String(this.pendingFolderId) : "");
    select.innerHTML = PoolFolders.optionsHtml(selected);
    select.value = selected;
  }

  // After Cast & Scene saves a pool character it closes the editor and
  // re-renders the list; that is when the chosen folder is applied.
  static resolvePendingSave() {
    const pending = this.pendingSave;
    const editor = this.panel?.querySelector("[data-region='editor']");
    if (!pending || !editor?.classList.contains("fvn-editor--hidden")) return;
    this.pendingSave = null;
    this.pendingFolderId = null;
    const targets = pending.editingId
      ? [pending.editingId]
      : PoolFolders.poolIds().filter((id) => !pending.before.has(id));
    if (targets.length) void PoolFolders.assign(targets, pending.folderId);
  }

  static listenClicks(panel) {
    // Capture runs before Cast & Scene's own handlers, so the editor target is known.
    panel.addEventListener("click", (event) => {
      const original = event.target.closest?.("[data-action]");
      const action = original?.dataset.action;
      if (action === "edit") {
        const card = original.closest(".fvn-character--pool[data-character-id]");
        this.editingId = card ? card.dataset.characterId : null;
        this.pendingSave = null;
      } else if (action === "new-character") {
        this.editingId = null;
        this.pendingSave = null;
        if (!this.openingInFolder) this.pendingFolderId = null;
      } else if (action === "cancel-edit" || action === "view-tabs" || action === "view-pool") {
        this.pendingSave = null;
      } else if (action === "add-from-pool") {
        this.pickerTicks = new Set();
      }
    }, true);

    panel.addEventListener("click", async (event) => {
      const button = event.target.closest?.("[data-cnsmf-action]");
      if (!button) return;
      const action = button.dataset.cnsmfAction;
      const folderId = button.closest("[data-cnsmf-folder-id]")?.dataset.cnsmfFolderId ?? null;
      switch (action) {
        case "toggle-move": MoveMode.set(); break;
        case "new-folder": await this.createFolder(); break;
        case "toggle-folder":
          if (!event.target.closest("input, label, button")) this.toggleFolder(button.closest("[data-cnsmf-folder-id]"));
          break;
        case "new-character-in-folder": this.newCharacterInFolder(folderId); break;
        case "new-subfolder": await this.createFolder(folderId); break;
        case "rename-folder": await this.renameFolder(folderId); break;
        case "delete-folder": await PoolFolders.remove(folderId); break;
      }
    });

    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const header = event.target.closest?.(".cnsmf-folder__header");
      if (!header || event.target !== header) return;
      event.preventDefault();
      this.toggleFolder(header.closest("[data-cnsmf-folder-id]"));
    });

    panel.addEventListener("contextmenu", (event) => {
      const header = event.target.closest?.(".cnsmf-folder__header");
      if (header && this.isPoolMode()) {
        event.preventDefault();
        event.stopPropagation();
        ContextMenu.openFolder(event, header.closest("[data-cnsmf-folder-id]")?.dataset.cnsmfFolderId);
        return;
      }
      const card = event.target.closest?.(".fvn-character--pool[data-character-id]");
      if (!card) return;
      this.contextCardId = card.dataset.characterId;
      // Cast & Scene builds its own menu in this same event; extend it afterwards.
      window.setTimeout(() => ContextMenu.extendPoolCharacterMenu(card.dataset.characterId), 0);
    }, true);
  }

  static async createFolder(parentId = null) {
    const parent = parentId ? PoolFolders.getFolders().find((entry) => String(entry.id) === String(parentId)) : null;
    const name = await Dialogs.folderName({ title: parent ? t("NewFolderIn", { name: parent.name }) : t("NewFolder"), value: t("NewFolderDefault") });
    if (name) await PoolFolders.create(name, parent?.id ?? null);
  }

  static async renameFolder(folderId) {
    const folder = PoolFolders.getFolders().find((entry) => String(entry.id) === String(folderId));
    if (!folder) return;
    const name = await Dialogs.folderName({ title: t("RenameFolderTitle", { name: folder.name }), value: folder.name });
    if (name) await PoolFolders.rename(folder.id, name);
  }

  static newCharacterInFolder(folderId) {
    const button = this.panel?.querySelector('[data-action="new-character"]');
    if (!button) return;
    this.pendingFolderId = folderId;
    this.openingInFolder = true;
    try { button.click(); } finally { this.openingInFolder = false; }
  }

  static toggleFolder(section) {
    const folderId = section?.dataset.cnsmfFolderId;
    if (!folderId) return;
    const open = section.classList.contains("is-collapsed");
    PoolFolders.setExpanded(folderId, open);
    section.classList.toggle("is-collapsed", !open);
    const header = section.querySelector(":scope > .cnsmf-folder__header");
    header?.setAttribute("aria-expanded", String(open));
    const icon = header?.querySelector(".cnsmf-folder__icon");
    icon?.classList.toggle("fa-folder-open", open);
    icon?.classList.toggle("fa-folder", !open);
  }

  static folderSection(folder, { open, total, controls, draggable }) {
    const section = document.createElement("section");
    section.className = `cnsmf-folder${open ? "" : " is-collapsed"}`;
    section.dataset.cnsmfFolderId = String(folder.id);
    section.innerHTML = `
      <div class="cnsmf-folder__header" data-cnsmf-action="toggle-folder" role="button" tabindex="0" aria-expanded="${open}" ${draggable ? 'draggable="true"' : ""}>
        <i class="fa-solid fa-chevron-down cnsmf-folder__caret" aria-hidden="true"></i>
        <i class="fa-solid ${open ? "fa-folder-open" : "fa-folder"} cnsmf-folder__icon" aria-hidden="true"></i>
        <strong class="cnsmf-folder__name">${escapeHtml(folder.name)}</strong>
        <span class="cnsmf-folder__count">${total}</span>
        ${controls}
      </div>
      <div class="cnsmf-folder__content"></div>`;
    return section;
  }

  // Shared by the pool list and the Add-from-pool picker: wraps the items
  // Cast & Scene rendered into folder sections, keeping their order.
  static buildTree({ items, idOf, query, controls, draggable, emptyText, wrapItems = (nodes) => nodes }) {
    const { ids, children } = PoolFolders.tree();
    const assignments = PoolFolders.getAssignments();
    const expanded = PoolFolders.expanded();
    const total = PoolFolders.totals();
    const byFolder = new Map();
    for (const item of items) {
      const folderId = PoolFolders.folderOf(idOf(item), ids, assignments);
      if (!byFolder.has(folderId)) byFolder.set(folderId, []);
      byFolder.get(folderId).push(item);
    }
    const build = (folder) => {
      const id = String(folder.id);
      const subfolders = (children.get(id) ?? []).map(build).filter(Boolean);
      const own = byFolder.get(id) ?? [];
      if (query && !own.length && !subfolders.length) return null;
      const section = this.folderSection(folder, { open: Boolean(query) || expanded.has(id), total: total(id), controls, draggable });
      const content = section.querySelector(".cnsmf-folder__content");
      content.append(...subfolders, ...(own.length ? wrapItems(own) : []));
      if (!subfolders.length && !own.length) content.innerHTML = `<div class="cnsmf-folder__empty">${t(emptyText)}</div>`;
      return section;
    };
    return {
      sections: (children.get("") ?? []).map(build).filter(Boolean),
      root: byFolder.get("") ?? []
    };
  }

  static groupList() {
    const list = this.panel?.querySelector("[data-region='character-list']");
    if (!list || !this.isPoolMode() || list.querySelector(":scope > .cnsmf-folder")) return;
    this.resolvePendingSave();
    const cards = [...list.querySelectorAll(":scope > .fvn-character--pool[data-character-id]")];
    for (const card of cards) {
      card.draggable = true;
      card.title = t("DragToFolder");
      for (const image of card.querySelectorAll("img")) image.draggable = false;
    }
    const query = this.panel.querySelector("[data-field='search']")?.value.trim() ?? "";
    const controls = `<span class="cnsmf-folder__actions">
        <button type="button" data-cnsmf-action="new-character-in-folder" title="${t("NewCharacterInFolder")}"><i class="fa-solid fa-user-plus"></i></button>
        <button type="button" data-cnsmf-action="new-subfolder" title="${t("NewSubfolder")}"><i class="fa-solid fa-folder-plus"></i></button>
        <button type="button" data-cnsmf-action="rename-folder" title="${t("RenameFolder")}"><i class="fa-solid fa-pen-to-square"></i></button>
        <button type="button" data-cnsmf-action="delete-folder" title="${t("DeleteFolder")}"><i class="fa-solid fa-trash"></i></button>
      </span>`;
    const { sections } = this.buildTree({ items: cards, idOf: (card) => card.dataset.characterId, query, controls, draggable: true, emptyText: "EmptyFolder" });
    if (!sections.length) return;
    this.listObserver.disconnect();
    list.prepend(...sections);
    this.listObserver.observe(list, { childList: true });
  }

  static groupPicker() {
    const list = this.panel?.querySelector('[data-region="pool-picker-list"]');
    if (!list || list.querySelector(":scope > .cnsmf-folder")) return;
    const choices = [...list.querySelectorAll(":scope > .fvn-pool-choice")];
    if (!choices.length) return list.classList.remove("cnsmf-picker-grouped");
    // Keep ticks across Cast & Scene's re-render on search.
    for (const input of list.querySelectorAll('input[name="poolCharacter"]')) {
      if (this.pickerTicks.has(input.value)) input.checked = true;
    }
    const query = this.panel.querySelector("[data-field='pool-search']")?.value.trim() ?? "";
    const grid = (nodes) => {
      const wrapper = document.createElement("div");
      wrapper.className = "cnsmf-picker-grid";
      wrapper.append(...nodes);
      return [wrapper];
    };
    const { sections, root } = this.buildTree({
      items: choices,
      idOf: (choice) => choice.querySelector('input[name="poolCharacter"]')?.value,
      query,
      controls: `<label class="cnsmf-folder__select" title="${t("SelectFolder")}"><input type="checkbox" data-cnsmf-select-folder aria-label="${t("SelectFolder")}" /></label>`,
      draggable: false,
      emptyText: "EmptyFolderPicker",
      wrapItems: grid
    });
    this.pickerObserver.disconnect();
    list.classList.add("cnsmf-picker-grouped");
    list.replaceChildren(...sections, ...(root.length ? grid(root) : []));
    this.syncPickerFolderChecks();
    this.pickerObserver.observe(list, { childList: true });
  }

  static listenPicker(panel) {
    panel.addEventListener("change", (event) => {
      const folderBox = event.target.closest?.("[data-cnsmf-select-folder]");
      if (folderBox) {
        for (const input of folderBox.closest("[data-cnsmf-folder-id]")?.querySelectorAll('input[name="poolCharacter"]') ?? []) {
          input.checked = folderBox.checked;
          if (input.checked) this.pickerTicks.add(input.value); else this.pickerTicks.delete(input.value);
        }
        this.syncPickerFolderChecks();
        return;
      }
      const choice = event.target.closest?.('[data-region="pool-picker-list"] input[name="poolCharacter"]');
      if (!choice) return;
      if (choice.checked) this.pickerTicks.add(choice.value); else this.pickerTicks.delete(choice.value);
      this.syncPickerFolderChecks();
    });
  }

  static syncPickerFolderChecks() {
    const list = this.panel?.querySelector('[data-region="pool-picker-list"]');
    for (const box of list?.querySelectorAll("[data-cnsmf-select-folder]") ?? []) {
      const inputs = [...(box.closest("[data-cnsmf-folder-id]")?.querySelectorAll('input[name="poolCharacter"]') ?? [])];
      const ticked = inputs.filter((input) => input.checked).length;
      box.checked = inputs.length > 0 && ticked === inputs.length;
      box.indeterminate = ticked > 0 && ticked < inputs.length;
      box.disabled = !inputs.length;
    }
  }

  static listenDragAndDrop(panel) {
    const list = panel.querySelector("[data-region='character-list']");
    if (!list) return;
    const dragType = "application/x-cnsmf-pool";
    const clearTargets = () => {
      list.classList.remove("cnsmf-drop-root");
      for (const element of list.querySelectorAll(".is-drop-target")) element.classList.remove("is-drop-target");
    };
    const dropFolderId = (event) => event.target.closest?.(".cnsmf-folder[data-cnsmf-folder-id]")?.dataset.cnsmfFolderId ?? "";
    const canDrop = (folderId) => {
      if (!this.drag) return false;
      if (this.drag.type === "folder") return !folderId || !PoolFolders.isInside(folderId, this.drag.id);
      return true;
    };
    list.addEventListener("dragstart", (event) => {
      if (!this.isPoolMode()) return;
      const header = event.target.closest?.(".cnsmf-folder__header");
      const card = event.target.closest?.(".fvn-character--pool[data-character-id]");
      if (header) this.drag = { type: "folder", id: header.closest("[data-cnsmf-folder-id]")?.dataset.cnsmfFolderId };
      else if (card) this.drag = { type: "character", id: card.dataset.characterId };
      else return;
      if (!this.drag.id) {
        this.drag = null;
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(dragType, JSON.stringify(this.drag));
      (header ?? card).classList.add("is-dragging");
    });
    list.addEventListener("dragover", (event) => {
      if (!this.drag) return;
      const folderId = dropFolderId(event);
      clearTargets();
      if (!canDrop(folderId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (folderId) list.querySelector(`.cnsmf-folder[data-cnsmf-folder-id="${CSS.escape(folderId)}"]`)?.classList.add("is-drop-target");
      else list.classList.add("cnsmf-drop-root");
    });
    list.addEventListener("dragleave", (event) => {
      if (!list.contains(event.relatedTarget)) clearTargets();
    });
    list.addEventListener("drop", async (event) => {
      const drag = this.drag;
      if (!drag) return;
      event.preventDefault();
      clearTargets();
      const folderId = dropFolderId(event);
      if (!canDrop(folderId)) return;
      this.drag = null;
      if (drag.type === "folder") await PoolFolders.moveFolder(drag.id, folderId || null);
      else await PoolFolders.assign([drag.id], folderId);
    });
    list.addEventListener("dragend", () => {
      this.drag = null;
      clearTargets();
      for (const element of list.querySelectorAll(".is-dragging")) element.classList.remove("is-dragging");
    });
  }
}

/* -------------------------------------------- */
/*  Context menus                                */
/* -------------------------------------------- */

class ContextMenu {
  static menu = null;

  static button(action, icon, label, danger = false) {
    return `<button type="button" role="menuitem" data-cnsmf-menu="${action}" class="${danger ? "is-danger" : ""}"><i class="fa-solid ${icon}"></i><span>${escapeHtml(label)}</span></button>`;
  }

  static extendPoolCharacterMenu(characterId) {
    const menu = [...document.querySelectorAll("body > .fvn-context-menu:not(.cnsmf-menu)")].pop();
    if (!menu || menu.querySelector("[data-cnsmf-menu]") || !DirectorUI.isPoolMode()) return;
    const anchor = menu.querySelector('[data-context-action="context-add-pool-character"]');
    const holder = document.createElement("div");
    holder.innerHTML = this.button("move-character", "fa-folder-tree", t("MoveToFolder"));
    const item = holder.firstElementChild;
    if (anchor) anchor.after(item); else menu.prepend(item);
    item.addEventListener("click", async () => {
      menu.remove();
      await this.moveCharacter(characterId);
    });
    // Keep the menu inside the viewport after adding a row.
    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
  }

  static async moveCharacter(characterId) {
    const pool = castSetting("characterPool", []);
    const character = Array.isArray(pool) ? pool.find((entry) => String(entry?.id) === String(characterId)) : null;
    if (!character) return;
    const { ids } = PoolFolders.tree();
    const result = await Dialogs.pickFolder({ title: t("MoveTitle", { name: character.name }), selected: PoolFolders.folderOf(character.id, ids) });
    if (result !== null) await PoolFolders.assign([character.id], result);
  }

  static openFolder(event, folderId) {
    const folder = PoolFolders.getFolders().find((entry) => String(entry.id) === String(folderId));
    if (!folder) return;
    this.close();
    const menu = document.createElement("div");
    menu.className = "fvn-context-menu cnsmf-menu";
    menu.setAttribute("role", "menu");
    menu.innerHTML = [
      this.button("new-character", "fa-user-plus", t("NewCharacterInFolder")),
      this.button("new-subfolder", "fa-folder-plus", t("NewSubfolder")),
      this.button("rename", "fa-pen-to-square", t("RenameFolder")),
      this.button("move-folder", "fa-folder-tree", t("MoveToFolder")),
      '<div class="fvn-context-menu__separator" role="separator"></div>',
      this.button("delete", "fa-trash", t("DeleteFolder"), true)
    ].join("");
    menu.addEventListener("click", async (clickEvent) => {
      const action = clickEvent.target.closest("[data-cnsmf-menu]")?.dataset.cnsmfMenu;
      if (!action) return;
      this.close();
      if (action === "new-character") DirectorUI.newCharacterInFolder(folder.id);
      else if (action === "new-subfolder") await DirectorUI.createFolder(folder.id);
      else if (action === "rename") await DirectorUI.renameFolder(folder.id);
      else if (action === "delete") await PoolFolders.remove(folder.id);
      else if (action === "move-folder") {
        const parent = folder.parentId ?? "";
        const result = await Dialogs.pickFolder({ title: t("MoveTitle", { name: folder.name }), selected: String(parent), exclude: folder.id });
        if (result !== null) await PoolFolders.moveFolder(folder.id, result || null);
      }
    });
    document.body.appendChild(menu);
    this.menu = menu;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(window.innerWidth - rect.width - 8, Math.max(8, event.clientX))}px`;
    menu.style.top = `${Math.min(window.innerHeight - rect.height - 8, Math.max(8, event.clientY))}px`;
    menu.querySelector("button")?.focus({ preventScroll: true });
  }

  static close() {
    this.menu?.remove();
    this.menu = null;
  }

  static activate() {
    window.addEventListener("pointerdown", (event) => {
      if (this.menu && !event.target.closest?.(".cnsmf-menu")) this.close();
    }, true);
    // "Edit" in Cast & Scene's own pool menu opens the editor for the card
    // that was right-clicked.
    document.addEventListener("click", (event) => {
      if (!event.target.closest?.('.fvn-context-menu [data-context-action="context-edit-character"]')) return;
      DirectorUI.editingId = DirectorUI.isPoolMode() ? DirectorUI.contextCardId : null;
      DirectorUI.pendingSave = null;
    }, true);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    });
  }
}

/* -------------------------------------------- */
/*  Quick Access integration                     */
/* -------------------------------------------- */

class QuickAccessUI {
  static attach(root) {
    const controls = root?.querySelector(".fvn-scene-palette__controls");
    if (!controls || controls.querySelector(".cnsmf-palette-move")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cnsmf-palette-move";
    button.title = t("MoveTooltip");
    button.innerHTML = `<i class="fa-solid fa-up-down-left-right"></i><span>${t("MoveStart")}</span>`;
    button.addEventListener("click", () => MoveMode.set());
    const row = controls.querySelector(".fvn-scene-palette__utility-row");
    if (row) row.after(button); else controls.prepend(button);
    this.syncMoveButton();
  }

  static syncMoveButton() {
    for (const button of document.querySelectorAll(".cnsmf-palette-move")) {
      button.classList.toggle("is-active", MoveMode.enabled);
      button.setAttribute("aria-pressed", String(MoveMode.enabled));
      const label = button.querySelector("span");
      if (label) label.textContent = t(MoveMode.enabled ? "MoveStop" : "MoveStart");
    }
  }
}

/* -------------------------------------------- */
/*  Wiring                                       */
/* -------------------------------------------- */

function attachToCastAndScene() {
  const director = document.getElementById("fvn-director");
  if (director) DirectorUI.attach(director);
  const palette = document.getElementById("fvn-scene-palette");
  if (palette) QuickAccessUI.attach(palette);
  PresetOrder.watch(palette?.querySelector("[data-region='palette-tabs']"));
  if (document.getElementById("fvn-stage")) MoveMode.applyToStage();
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, FOLDERS_SETTING, {
    name: "Character Pool folders",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => DirectorUI.refresh()
  });
  game.settings.register(MODULE_ID, ASSIGNMENTS_SETTING, {
    name: "Character Pool folder assignments",
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => DirectorUI.refresh()
  });
  game.settings.register(MODULE_ID, CREATION_SETTING, {
    name: "Scene preset creation order",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => PresetOrder.apply()
  });
  game.keybindings.register(MODULE_ID, "toggleMoveMode", {
    name: "CNSMF.KeybindingMove",
    hint: "CNSMF.KeybindingMoveHint",
    editable: [],
    restricted: true,
    repeat: false,
    onDown: () => {
      if (!isGM()) return false;
      MoveMode.set();
      return true;
    }
  });
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { toggleMoveMode: (force = null) => MoveMode.set(force === null ? !MoveMode.enabled : Boolean(force)) };
});

Hooks.once("ready", () => {
  if (!isGM()) return;
  if (!castAndSceneReady()) {
    ui.notifications.warn(t("RequiresCastAndScene"));
    return;
  }
  MoveMode.activate();
  ContextMenu.activate();
  void PresetOrder.recordCreation();
  // Cast & Scene saves its presets without telling its own windows, or other GMs'.
  Hooks.on("createSetting", (setting) => PresetOrder.onSettingChanged(setting));
  Hooks.on("updateSetting", (setting) => PresetOrder.onSettingChanged(setting));
  // Cast & Scene appends its Stage, Director and Quick Access to <body>.
  new MutationObserver(attachToCastAndScene).observe(document.body, { childList: true });
  attachToCastAndScene();
});
