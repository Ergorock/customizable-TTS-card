/**
 * Customizable TTS Card
 * Carte Lovelace pour diffuser un message vocal (TTS) sur une sélection
 * d'enceintes, avec des annonces enregistrées réutilisables.
 *
 * Exemple :
 *   type: custom:customizable-tts-card
 *   title: Annonces
 *   tts_engine: tts.google_translate_fr_com
 *   entities:
 *     - media_player.salon
 *     - entity: media_player.cuisine
 *       name: Cuisine
 *   volume: 35            # volume d'annonce par défaut (0-100), optionnel
 *   announcements:        # annonces fixes, en plus de celles enregistrées depuis la carte
 *     - name: À table
 *       message: À table, le repas est prêt !
 *       icon: mdi:silverware-fork-knife
 */

const CARD_VERSION = "1.0.0";
const ANNOUNCE_FEATURE = 1048576; // MediaPlayerEntityFeature.MEDIA_ANNOUNCE
const STORAGE_KEY = "customizable-tts-card";
const LEGACY_STORAGE_KEY = "annonce-card"; // ancien nom de la carte, pour reprendre les annonces déjà enregistrées

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

class CustomizableTtsCard extends HTMLElement {
  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "tts_engine", selector: { entity: { domain: "tts" } } },
        { name: "entities", selector: { entity: { domain: "media_player", multiple: true } } },
        { name: "volume", selector: { number: { min: 0, max: 100, step: 5, mode: "slider" } } },
      ],
      computeLabel: (s) =>
        ({
          title: "Titre",
          tts_engine: "Moteur de synthèse vocale",
          entities: "Enceintes (vide = toutes celles compatibles)",
          volume: "Volume d'annonce par défaut",
        })[s.name],
    };
  }

  static getStubConfig(hass) {
    const tts = Object.keys(hass.states).find((e) => e.startsWith("tts."));
    return { title: "Annonces", tts_engine: tts };
  }

  setConfig(config) {
    this._config = { title: "Annonces", announcements: [], ...config };
    this._volume = this._config.volume ?? null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._selected = new Set();
      this._userPresets = [];
      this._render();
      this._loadUserData();
    } else {
      this._renderSpeakers();
    }
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  /* ---------- Données ---------- */

  get _speakers() {
    const states = this._hass.states;
    let list = this._config.entities;
    if (!list || !list.length) {
      list = Object.values(states)
        .filter((s) => s.entity_id.startsWith("media_player.") && (s.attributes.supported_features & ANNOUNCE_FEATURE))
        .filter((s) => s.state !== "unavailable")
        .map((s) => s.entity_id);
    }
    return list
      .map((e) => (typeof e === "string" ? { entity: e } : e))
      .filter((e) => states[e.entity])
      .map((e) => {
        const st = states[e.entity];
        return {
          entity: e.entity,
          name: e.name || st.attributes.friendly_name || e.entity,
          icon: e.icon || st.attributes.icon || "mdi:speaker",
          unavailable: st.state === "unavailable",
        };
      });
  }

  get _ttsEngine() {
    return this._config.tts_engine || Object.keys(this._hass.states).find((e) => e.startsWith("tts."));
  }

  get _presets() {
    return [
      ...(this._config.announcements || []).map((p) => ({ ...p, fixed: true })),
      ...this._userPresets.map((p, i) => ({ ...p, index: i })),
    ];
  }

  async _loadUserData() {
    try {
      const get = (key) => this._hass.connection.sendMessagePromise({ type: "frontend/get_user_data", key });
      const data = (await get(STORAGE_KEY))?.value || (await get(LEGACY_STORAGE_KEY))?.value || {};
      this._userPresets = Array.isArray(data.presets) ? data.presets : [];
      const known = new Set(this._speakers.map((s) => s.entity));
      this._selected = new Set((data.selected || []).filter((e) => known.has(e)));
      if (this._config.volume == null && data.volume != null) this._volume = data.volume;
    } catch (err) {
      console.warn("customizable-tts-card: lecture des données utilisateur impossible", err);
    }
    this._render();
  }

  _saveUserData() {
    this._hass.connection
      .sendMessagePromise({
        type: "frontend/set_user_data",
        key: STORAGE_KEY,
        value: { presets: this._userPresets, selected: [...this._selected], volume: this._volume },
      })
      .catch((err) => this._toast(`Enregistrement impossible : ${err.message || err}`));
  }

  /* ---------- Actions ---------- */

  async _announce(message) {
    message = (message || "").trim();
    if (!message) return this._toast("Le message est vide");
    const targets = [...this._selected].filter((e) => this._hass.states[e]?.state !== "unavailable");
    if (!targets.length) return this._toast("Sélectionnez au moins une enceinte");
    const engine = this._ttsEngine;
    if (!engine) return this._toast("Aucun moteur TTS configuré");

    const params = new URLSearchParams({ message });
    if (this._config.language) params.set("language", this._config.language);
    const data = {
      media_content_id: `media-source://tts/${engine}?${params.toString()}`,
      media_content_type: "music",
      announce: true,
    };
    if (this._volume != null && this._volume !== "") data.extra = { volume: Number(this._volume) };

    const btn = this.shadowRoot.querySelector("#send");
    btn.disabled = true;
    try {
      await this._hass.callService("media_player", "play_media", data, { entity_id: targets });
      this._toast(`Annonce envoyée sur ${targets.length} enceinte${targets.length > 1 ? "s" : ""}`);
    } catch (err) {
      this._toast(`Échec de l'annonce : ${err.message || err}`);
    } finally {
      btn.disabled = false;
    }
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
  }

  /* ---------- Rendu ---------- */

  _render() {
    if (!this._config || !this._hass) return;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const prevMessage = this.shadowRoot.querySelector("#message")?.value || "";

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        ${this._config.title ? `<div class="header"><ha-icon icon="mdi:bullhorn"></ha-icon>${esc(this._config.title)}</div>` : ""}
        <div class="content">
          <div class="section-label">Enceintes</div>
          <div class="chips" id="speakers"></div>

          <div class="section-label">Annonces enregistrées</div>
          <div class="presets" id="presets">${this._presetsHtml()}</div>

          <div class="section-label">Message</div>
          <textarea id="message" rows="2" placeholder="Tapez votre message…"></textarea>

          <div class="save-row" id="save-row" hidden>
            <input id="preset-name" type="text" placeholder="Nom de l'annonce" />
            <button class="btn ghost" id="save-ok">OK</button>
            <button class="btn ghost" id="save-cancel">Annuler</button>
          </div>

          <div class="volume-row">
            <ha-icon icon="mdi:volume-high"></ha-icon>
            <input id="volume" type="range" min="0" max="100" step="5" value="${this._volume ?? 30}" />
            <span id="volume-label">${this._volume == null ? "inchangé" : `${this._volume}%`}</span>
          </div>

          <div class="actions">
            <button class="btn ghost" id="save" title="Enregistrer ce message"><ha-icon icon="mdi:content-save-outline"></ha-icon>Enregistrer</button>
            <button class="btn primary" id="send"><ha-icon icon="mdi:bullhorn-outline"></ha-icon>Annoncer</button>
          </div>
        </div>
      </ha-card>`;

    const root = this.shadowRoot;
    const msg = root.querySelector("#message");
    msg.value = prevMessage;
    msg.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) this._announce(msg.value);
    });

    root.querySelector("#send").addEventListener("click", () => this._announce(msg.value));

    const saveRow = root.querySelector("#save-row");
    const nameInput = root.querySelector("#preset-name");
    root.querySelector("#save").addEventListener("click", () => {
      if (!msg.value.trim()) return this._toast("Écrivez d'abord un message");
      saveRow.hidden = false;
      nameInput.value = msg.value.trim().slice(0, 30);
      nameInput.focus();
      nameInput.select();
    });
    const confirmSave = () => {
      const name = nameInput.value.trim();
      if (!name) return;
      this._userPresets.push({ name, message: msg.value.trim() });
      this._saveUserData();
      this._render();
      this._toast(`Annonce « ${name} » enregistrée`);
    };
    root.querySelector("#save-ok").addEventListener("click", confirmSave);
    nameInput.addEventListener("keydown", (ev) => ev.key === "Enter" && confirmSave());
    root.querySelector("#save-cancel").addEventListener("click", () => (saveRow.hidden = true));

    const vol = root.querySelector("#volume");
    const volLabel = root.querySelector("#volume-label");
    vol.addEventListener("input", () => (volLabel.textContent = `${vol.value}%`));
    vol.addEventListener("change", () => {
      this._volume = Number(vol.value);
      this._saveUserData();
    });
    volLabel.addEventListener("click", () => {
      // Clic sur le libellé : revenir à "volume inchangé"
      this._volume = null;
      volLabel.textContent = "inchangé";
      this._saveUserData();
    });

    root.querySelector("#presets").addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-preset]");
      if (!el) return;
      const preset = this._presets[Number(el.dataset.preset)];
      const action = ev.target.closest("[data-action]")?.dataset.action;
      if (action === "play") {
        this._announce(preset.message);
      } else if (action === "delete") {
        this._userPresets.splice(preset.index, 1);
        this._saveUserData();
        this._render();
      } else {
        msg.value = preset.message;
        msg.focus();
      }
    });

    this._lastSpeakersKey = null;
    this._renderSpeakers();
  }

  _presetsHtml() {
    const presets = this._presets;
    if (!presets.length) return `<div class="empty">Aucune annonce. Écrivez un message puis « Enregistrer ».</div>`;
    return presets
      .map(
        (p, i) => `
        <div class="preset" data-preset="${i}" title="${esc(p.message)}">
          <ha-icon icon="${esc(p.icon || "mdi:message-text-outline")}"></ha-icon>
          <span class="preset-name">${esc(p.name)}</span>
          <button class="icon-btn" data-action="play" title="Diffuser maintenant"><ha-icon icon="mdi:play"></ha-icon></button>
          ${p.fixed ? "" : `<button class="icon-btn" data-action="delete" title="Supprimer"><ha-icon icon="mdi:close"></ha-icon></button>`}
        </div>`
      )
      .join("");
  }

  _renderSpeakers() {
    const container = this.shadowRoot?.querySelector("#speakers");
    if (!container) return;
    const speakers = this._speakers;
    // Ne redessiner que si la liste ou la disponibilité a changé
    const key = JSON.stringify([speakers.map((s) => [s.entity, s.name, s.unavailable]), [...this._selected]]);
    if (key === this._lastSpeakersKey) return;
    this._lastSpeakersKey = key;

    const allSelected = speakers.length && speakers.every((s) => s.unavailable || this._selected.has(s.entity));
    container.innerHTML =
      speakers
        .map(
          (s) => `
        <button class="chip ${this._selected.has(s.entity) ? "on" : ""}" data-entity="${esc(s.entity)}" ${s.unavailable ? "disabled" : ""}>
          <ha-icon icon="${esc(s.icon)}"></ha-icon>${esc(s.name)}
        </button>`
        )
        .join("") +
      (speakers.length > 1
        ? `<button class="chip all ${allSelected ? "on" : ""}" data-all="1"><ha-icon icon="mdi:home-sound-out"></ha-icon>Partout</button>`
        : "") +
      (speakers.length ? "" : `<div class="empty">Aucune enceinte compatible trouvée.</div>`);

    container.onclick = (ev) => {
      const chip = ev.target.closest(".chip");
      if (!chip || chip.disabled) return;
      if (chip.dataset.all) {
        const available = speakers.filter((s) => !s.unavailable).map((s) => s.entity);
        this._selected = allSelected ? new Set() : new Set(available);
      } else {
        const e = chip.dataset.entity;
        this._selected.has(e) ? this._selected.delete(e) : this._selected.add(e);
      }
      this._saveUserData();
      this._renderSpeakers();
    };
  }
}

const STYLES = `
  :host { display: block; }
  ha-card { overflow: hidden; }
  .header {
    display: flex; align-items: center; gap: 10px;
    padding: 16px 16px 0; font-size: 1.25rem; font-weight: 500;
    color: var(--primary-text-color);
  }
  .header ha-icon { color: var(--primary-color); }
  .content { padding: 8px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
  .section-label {
    margin-top: 6px; font-size: 0.75rem; font-weight: 500; letter-spacing: 0.04em;
    text-transform: uppercase; color: var(--secondary-text-color);
  }
  .chips, .presets { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px 6px 8px; border-radius: 18px; cursor: pointer;
    font: inherit; font-size: 0.9rem;
    border: 1px solid var(--divider-color);
    background: var(--card-background-color); color: var(--primary-text-color);
    transition: background 0.15s, border-color 0.15s;
  }
  .chip ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
  .chip.on {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
    border-color: var(--primary-color); color: var(--primary-color);
  }
  .chip.on ha-icon { color: var(--primary-color); }
  .chip.all { border-style: dashed; }
  .chip:disabled { opacity: 0.4; cursor: not-allowed; }
  .preset {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 4px 4px 10px; border-radius: 10px; cursor: pointer;
    background: var(--secondary-background-color); color: var(--primary-text-color);
    max-width: 100%;
  }
  .preset:hover { filter: brightness(0.96); }
  .preset > ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
  .preset-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; }
  .icon-btn {
    display: inline-flex; border: none; background: none; padding: 4px; border-radius: 50%;
    cursor: pointer; color: var(--secondary-text-color);
  }
  .icon-btn ha-icon { --mdc-icon-size: 18px; }
  .icon-btn[data-action="play"]:hover { color: var(--primary-color); }
  .icon-btn[data-action="delete"]:hover { color: var(--error-color); }
  textarea, input[type="text"] {
    box-sizing: border-box; width: 100%; font: inherit; font-size: 1rem;
    padding: 10px 12px; border-radius: 8px; resize: vertical;
    border: 1px solid var(--divider-color);
    background: var(--secondary-background-color); color: var(--primary-text-color);
  }
  textarea:focus, input[type="text"]:focus { outline: 2px solid var(--primary-color); outline-offset: -1px; }
  .save-row { display: flex; gap: 8px; align-items: center; }
  .save-row[hidden] { display: none; }
  .volume-row { display: flex; align-items: center; gap: 10px; color: var(--secondary-text-color); }
  .volume-row input { flex: 1; accent-color: var(--primary-color); }
  #volume-label { min-width: 64px; text-align: right; font-size: 0.85rem; cursor: pointer; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
    border-radius: 20px; font: inherit; font-weight: 500; cursor: pointer; border: none;
  }
  .btn ha-icon { --mdc-icon-size: 18px; }
  .btn.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .btn.primary:disabled { opacity: 0.5; cursor: progress; }
  .btn.ghost { background: transparent; color: var(--primary-color); border: 1px solid var(--divider-color); }
  .empty { font-size: 0.85rem; color: var(--secondary-text-color); font-style: italic; }
`;

if (!customElements.get("customizable-tts-card")) customElements.define("customizable-tts-card", CustomizableTtsCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "customizable-tts-card")) {
  window.customCards.push({
    type: "customizable-tts-card",
    name: "Customizable TTS Card",
    description: "Diffuser un message vocal sur une sélection d'enceintes, avec annonces enregistrées.",
    preview: false,
  });
}

console.info(`%c CUSTOMIZABLE-TTS-CARD %c v${CARD_VERSION} `, "background:#03a9f4;color:#fff", "background:#444;color:#fff");
