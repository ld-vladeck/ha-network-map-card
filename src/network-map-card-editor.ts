import { LitElement, html, css, PropertyValues } from 'lit';
import { HomeAssistant, NetworkMapCardConfig, IntegrationConfig } from './types';
import { HaHelper, AvailableIntegrationSummary } from './ha-helper';

export class NetworkMapCardEditor extends LitElement {
  private _hass?: HomeAssistant;
  private _config?: NetworkMapCardConfig;
  private _availableIntegrations: AvailableIntegrationSummary[] = [];
  private _selectedIntegrationToAdd = '';
  private _expandedIntegrations: Set<number> = new Set([0]);

  static styles = css`
    :host {
      display: block;
      color: var(--primary-text-color, #212121);
      font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
      padding: 4px;
    }
    .editor-section {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    .section-title {
      font-size: 0.95rem;
      font-weight: 500;
      margin-bottom: 14px;
      color: var(--primary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .form-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }
    .form-row label {
      font-size: 0.82rem;
      color: var(--secondary-text-color, #757575);
    }
    .input-text,
    .select-dropdown {
      padding: 10px 12px;
      border: 1px solid var(--divider-color, #ccc);
      border-radius: var(--ha-card-border-radius, 6px);
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color, #212121);
      font-size: 0.9rem;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.2s;
    }
    .input-text:focus,
    .select-dropdown:focus {
      border-color: var(--primary-color, #0288d1);
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      user-select: none;
      font-size: 0.88rem;
    }
    /* Integration Card */
    .integration-card {
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: var(--ha-card-border-radius, 8px);
      margin-bottom: 12px;
      overflow: hidden;
      background: var(--card-background-color, #fff);
    }
    .integration-header {
      padding: 12px 14px;
      background: rgba(0, 0, 0, 0.02);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }
    .integration-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .integration-name {
      font-weight: 500;
      font-size: 0.92rem;
    }
    .role-badge {
      font-size: 0.75rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }
    .role-badge.master {
      background: rgba(21, 101, 192, 0.12);
      color: var(--primary-color, #1976d2);
    }
    .role-badge.ap {
      background: rgba(0, 0, 0, 0.06);
      color: var(--secondary-text-color, #666);
    }
    .btn-delete {
      background: none;
      border: none;
      color: var(--error-color, #d32f2f);
      cursor: pointer;
      padding: 4px 8px;
      font-size: 0.82rem;
      border-radius: 4px;
    }
    .btn-delete:hover {
      background: rgba(211, 47, 47, 0.08);
    }
    .integration-body {
      padding: 14px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }
    .role-selector {
      display: flex;
      gap: 16px;
      margin-bottom: 14px;
      background: rgba(0, 0, 0, 0.02);
      padding: 8px 12px;
      border-radius: 6px;
    }
    .role-option {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      cursor: pointer;
    }
    /* Value Categorization Table */
    .values-table {
      margin-top: 8px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      overflow: hidden;
      font-size: 0.85rem;
    }
    .values-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    .values-row:last-child {
      border-bottom: none;
    }
    .value-label {
      font-family: monospace;
      font-weight: 500;
    }
    .chip-group {
      display: flex;
      gap: 6px;
    }
    .chip-btn {
      padding: 3px 12px;
      border-radius: 12px;
      border: 1px solid var(--divider-color, #ccc);
      background: none;
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--secondary-text-color, #666);
      transition: all 0.15s;
    }
    .chip-btn.active.lan {
      background: var(--primary-color, #1976d2);
      border-color: var(--primary-color, #1976d2);
      color: white;
    }
    .chip-btn.active.wifi {
      background: #00897b;
      border-color: #00897b;
      color: white;
    }
    /* Add Integration Button */
    .add-group {
      display: flex;
      gap: 10px;
      margin-top: 8px;
    }
    .btn-primary {
      padding: 9px 16px;
      background: var(--primary-color, #0288d1);
      color: white;
      border: none;
      border-radius: var(--ha-card-border-radius, 6px);
      cursor: pointer;
      font-weight: 500;
      font-size: 0.88rem;
      white-space: nowrap;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  public setConfig(config: NetworkMapCardConfig): void {
    this._config = {
      title: 'Mappa di Rete',
      show_offline: true,
      ...config,
      integrations: config.integrations ? [...config.integrations] : [],
    };
    this.requestUpdate();
  }

  public set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._loadAvailableIntegrations();
  }

  private async _loadAvailableIntegrations(): Promise<void> {
    if (!this._hass) return;
    try {
      await HaHelper.fetchClients(this._hass, []);
      const result = await HaHelper.fetchClients(this._hass, this._config?.integrations || []);
      this._availableIntegrations = result.diagnostics.availableIntegrations;
      this.requestUpdate();
    } catch (_) {}
  }

  private _fireConfigChanged(): void {
    if (!this._config) return;
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onTitleChange(e: Event): void {
    if (!this._config) return;
    const input = e.target as HTMLInputElement;
    this._config = { ...this._config, title: input.value };
    this._fireConfigChanged();
  }

  private _onHeightChange(e: Event): void {
    if (!this._config) return;
    const input = e.target as HTMLInputElement;
    this._config = { ...this._config, height: input.value };
    this._fireConfigChanged();
  }

  private _onToggleOffline(e: Event): void {
    if (!this._config) return;
    const input = e.target as HTMLInputElement;
    this._config = { ...this._config, show_offline: input.checked };
    this._fireConfigChanged();
  }

  private _onLayoutModeChange(e: Event): void {
    if (!this._config) return;
    const select = e.target as HTMLSelectElement;
    this._config = {
      ...this._config,
      layout_mode: select.value as 'tree' | 'radial' | 'horizontal',
    };
    this._fireConfigChanged();
  }

  private _addIntegration(): void {
    if (!this._config || !this._selectedIntegrationToAdd || !this._hass) return;

    const entryId = this._selectedIntegrationToAdd;
    const item = this._availableIntegrations.find((i) => i.id === entryId);

    const autoMac = item?.suggestedRootMac || HaHelper.autoDetectRootMac(this._hass, entryId) || '';
    const isFirst = !this._config.integrations || this._config.integrations.length === 0;

    const availableAttrs = HaHelper.scanAvailableAttributes(this._hass, entryId);
    const defaultAttr =
      availableAttrs.find((a) => a.toLowerCase().includes('port') || a.toLowerCase().includes('channel')) ||
      availableAttrs[0] ||
      '';

    const newIntegration: IntegrationConfig = {
      config_entry_id: entryId,
      name: item?.sampleName || item?.domain || 'Integrazione',
      root_mac: autoMac,
      is_master: isFirst,
      link_attribute: defaultAttr,
      lan_values: ['LAN', 'LAN 1', 'LAN 2', 'LAN 3', 'LAN 4', 'Port 1', 'Port 2', 'eth0', 'eth1'],
      wifi_values: ['2.4 GHz', '5 GHz', 'SSID', 'wlan0', 'Ch 1', 'Ch 6', 'Ch 11', 'Ch 36'],
    };

    const newIntegrations = [...(this._config.integrations || []), newIntegration];
    this._config = {
      ...this._config,
      integrations: newIntegrations,
      master_root_mac: isFirst ? autoMac : this._config.master_root_mac,
    };

    this._expandedIntegrations.add(newIntegrations.length - 1);
    this._selectedIntegrationToAdd = '';
    this._fireConfigChanged();
    this.requestUpdate();
  }

  private _removeIntegration(index: number, e: Event): void {
    e.stopPropagation();
    if (!this._config || !this._config.integrations) return;

    const newIntegrations = this._config.integrations.filter((_, i) => i !== index);

    if (newIntegrations.length > 0 && !newIntegrations.some((i) => i.is_master)) {
      newIntegrations[0].is_master = true;
      this._config.master_root_mac = newIntegrations[0].root_mac;
    }

    this._config = { ...this._config, integrations: newIntegrations };
    this._fireConfigChanged();
    this.requestUpdate();
  }

  private _setMasterIntegration(index: number): void {
    if (!this._config || !this._config.integrations) return;

    const newIntegrations = this._config.integrations.map((int, i) => ({
      ...int,
      is_master: i === index,
    }));

    const masterInt = newIntegrations[index];
    this._config = {
      ...this._config,
      integrations: newIntegrations,
      master_root_mac: masterInt.root_mac,
    };

    this._fireConfigChanged();
    this.requestUpdate();
  }

  private _onAttributeSelect(index: number, e: Event): void {
    if (!this._config || !this._config.integrations) return;
    const select = e.target as HTMLSelectElement;

    const newIntegrations = [...this._config.integrations];
    newIntegrations[index] = {
      ...newIntegrations[index],
      link_attribute: select.value,
    };

    this._config = { ...this._config, integrations: newIntegrations };
    this._fireConfigChanged();
    this.requestUpdate();
  }

  private _toggleValueClassification(
    intIndex: number,
    val: string,
    targetType: 'lan' | 'wifi'
  ): void {
    if (!this._config || !this._config.integrations) return;

    const targetInt = { ...this._config.integrations[intIndex] };
    const toArray = (v?: string[] | string): string[] => {
      if (!v) return [];
      if (Array.isArray(v)) return [...v];
      return String(v)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    };

    let lanVals = toArray(targetInt.lan_values);
    let wifiVals = toArray(targetInt.wifi_values);

    const valLower = val.trim().toLowerCase();

    if (targetType === 'lan') {
      const existingLan = lanVals.findIndex((v) => v.toLowerCase() === valLower);
      if (existingLan !== -1) {
        lanVals.splice(existingLan, 1);
      } else {
        lanVals.push(val);
        wifiVals = wifiVals.filter((v) => v.toLowerCase() !== valLower);
      }
    } else {
      const existingWifi = wifiVals.findIndex((v) => v.toLowerCase() === valLower);
      if (existingWifi !== -1) {
        wifiVals.splice(existingWifi, 1);
      } else {
        wifiVals.push(val);
        lanVals = lanVals.filter((v) => v.toLowerCase() !== valLower);
      }
    }

    targetInt.lan_values = lanVals;
    targetInt.wifi_values = wifiVals;

    const newIntegrations = [...this._config.integrations];
    newIntegrations[intIndex] = targetInt;

    this._config = { ...this._config, integrations: newIntegrations };
    this._fireConfigChanged();
    this.requestUpdate();
  }

  protected render() {
    if (!this._config) return html``;

    const integrations = this._config.integrations || [];
    const configuredEntryIds = new Set(integrations.map((i) => i.config_entry_id));
    const availableToAdd = this._availableIntegrations.filter((i) => !configuredEntryIds.has(i.id));

    return html`
      <div class="card-config">
        <!-- 1. Generale -->
        <div class="editor-section">
          <div class="section-title">Impostazioni generali</div>
          <div class="form-row">
            <label>Titolo</label>
            <input
              type="text"
              class="input-text"
              .value=${this._config.title || ''}
              @input=${this._onTitleChange}
              placeholder="Mappa di Rete"
            />
          </div>
          <div class="form-row">
            <label>Altezza (opzionale, default: responsive)</label>
            <input
              type="text"
              class="input-text"
              .value=${this._config.height || ''}
              @input=${this._onHeightChange}
              placeholder="Auto / Responsive (es. 60vh o 500px)"
            />
            <small style="color: var(--secondary-text-color);">
              Lascia vuoto per adattamento responsive automatico allo schermo (telefono, tablet o PC).
            </small>
          </div>
          <div class="form-row">
            <label>Stile del grafo (Layout)</label>
            <select
              class="select-dropdown"
              .value=${this._config.layout_mode || 'tree'}
              @change=${this._onLayoutModeChange}
            >
              <option value="tree">Albero (Dall'alto verso il basso)</option>
              <option value="radial">Costellazione radiale (A raggiera)</option>
              <option value="horizontal">Albero orizzontale (Da sinistra a destra)</option>
            </select>
          </div>
          <div class="form-row">
            <label class="checkbox-row">
              <input
                type="checkbox"
                ?checked=${this._config.show_offline !== false}
                @change=${this._onToggleOffline}
              />
              Mostra dispositivi offline
            </label>
          </div>
        </div>

        <!-- 2. Integrazioni Configurate -->
        <div class="editor-section">
          <div class="section-title">Integrazioni (${integrations.length})</div>

          ${integrations.map((int, index) => this._renderIntegrationItem(int, index))}

          <!-- Aggiungi nuova integrazione -->
          <div class="form-row" style="margin-top: 14px;">
            <label>Aggiungi integrazione rilevata</label>
            <div class="add-group">
              <select
                class="select-dropdown"
                style="flex: 1;"
                .value=${this._selectedIntegrationToAdd}
                @change=${(e: Event) => {
                  this._selectedIntegrationToAdd = (e.target as HTMLSelectElement).value;
                  this.requestUpdate();
                }}
              >
                <option value="">Seleziona un'integrazione...</option>
                ${availableToAdd.map(
                  (i) => html`
                    <option value=${i.id}>
                      ${i.sampleName || i.domain || 'Integrazione'} (${i.trackerCount} tracker)
                    </option>
                  `
                )}
              </select>
              <button
                class="btn-primary"
                ?disabled=${!this._selectedIntegrationToAdd}
                @click=${this._addIntegration}
              >
                Aggiungi
              </button>
            </div>
            ${availableToAdd.length === 0
              ? html`
                  <small style="color: var(--secondary-text-color); margin-top: 4px;">
                    Tutte le integrazioni di rete disponibili sono già state aggiunte.
                  </small>
                `
              : ''}
          </div>
        </div>
      </div>
    `;
  }

  private _renderIntegrationItem(int: IntegrationConfig, index: number) {
    const isExpanded = this._expandedIntegrations.has(index);
    const availableAttrs = this._hass
      ? HaHelper.scanAvailableAttributes(this._hass, int.config_entry_id)
      : [];

    const selectedAttr = int.link_attribute || availableAttrs[0] || '';
    const uniqueValues =
      this._hass && selectedAttr
        ? HaHelper.scanUniqueAttributeValues(this._hass, int.config_entry_id, selectedAttr)
        : [];

    const lanVals = Array.isArray(int.lan_values)
      ? int.lan_values.map((v) => v.toLowerCase())
      : String(int.lan_values || '')
          .split(',')
          .map((s) => s.trim().toLowerCase());

    const wifiVals = Array.isArray(int.wifi_values)
      ? int.wifi_values.map((v) => v.toLowerCase())
      : String(int.wifi_values || '')
          .split(',')
          .map((s) => s.trim().toLowerCase());

    return html`
      <div class="integration-card">
        <div
          class="integration-header"
          @click=${() => {
            if (this._expandedIntegrations.has(index)) {
              this._expandedIntegrations.delete(index);
            } else {
              this._expandedIntegrations.add(index);
            }
            this.requestUpdate();
          }}
        >
          <div class="integration-title-group">
            <span style="font-size: 0.8rem; color: var(--secondary-text-color);">${isExpanded ? '▼' : '▶'}</span>
            <span class="integration-name">${int.name || 'Integrazione ' + (index + 1)}</span>
            <span class="role-badge ${int.is_master ? 'master' : 'ap'}">
              ${int.is_master ? 'Principale' : 'Secondaria'}
            </span>
          </div>
          <button class="btn-delete" @click=${(e: Event) => this._removeIntegration(index, e)} title="Rimuovi">
            Rimuovi
          </button>
        </div>

        ${isExpanded
          ? html`
              <div class="integration-body">
                <!-- Ruolo: Principale vs Secondaria -->
                <div class="role-selector">
                  <label class="role-option">
                    <input
                      type="radio"
                      name=${`role_${index}`}
                      ?checked=${Boolean(int.is_master)}
                      @change=${() => this._setMasterIntegration(index)}
                    />
                    Principale
                  </label>
                  <label class="role-option">
                    <input
                      type="radio"
                      name=${`role_${index}`}
                      ?checked=${!Boolean(int.is_master)}
                      @change=${() => {
                        if (int.is_master) {
                          const otherIdx = index === 0 ? 1 : 0;
                          this._setMasterIntegration(otherIdx);
                        }
                      }}
                    />
                    Secondaria
                  </label>
                </div>

                <!-- Attributo Porta / Canale -->
                <div class="form-row">
                  <label>Attributo porta o canale</label>
                  <select
                    class="select-dropdown"
                    .value=${selectedAttr}
                    @change=${(e: Event) => this._onAttributeSelect(index, e)}
                  >
                    ${availableAttrs.map(
                      (attr) => html` <option value=${attr} ?selected=${attr === selectedAttr}>${attr}</option> `
                    )}
                  </select>
                </div>

                <!-- Mappatura Valori Rilevati su Tutti i Dispositivi -->
                ${uniqueValues.length > 0
                  ? html`
                      <div class="form-row" style="margin-top: 10px;">
                        <label>Classificazione valori rilevati:</label>
                        <div class="values-table">
                          ${uniqueValues.map((val) => {
                            const valLower = val.toLowerCase();
                            const isLan = lanVals.some((v) => v === valLower || valLower.includes(v));
                            const isWifi = wifiVals.some((v) => v === valLower || valLower.includes(v));

                            return html`
                              <div class="values-row">
                                <span class="value-label">${val}</span>
                                <div class="chip-group">
                                  <button
                                    type="button"
                                    class="chip-btn ${isLan ? 'active lan' : ''}"
                                    @click=${() => this._toggleValueClassification(index, val, 'lan')}
                                  >
                                    LAN
                                  </button>
                                  <button
                                    type="button"
                                    class="chip-btn ${isWifi ? 'active wifi' : ''}"
                                    @click=${() => this._toggleValueClassification(index, val, 'wifi')}
                                  >
                                    Wi-Fi
                                  </button>
                                </div>
                              </div>
                            `;
                          })}
                        </div>
                      </div>
                    `
                  : html`
                      <small style="color: var(--secondary-text-color); margin-top: 6px;">
                        Nessun valore distinto trovato per questo attributo tra i dispositivi attivi.
                      </small>
                    `}
              </div>
            `
          : ''}
      </div>
    `;
  }
}

if (!customElements.get('network-map-card-editor')) {
  customElements.define('network-map-card-editor', NetworkMapCardEditor);
}
