# Network Map Card for Home Assistant

> ### ⚠️ Progetto Personale & Supporto (Feel free to fork!)
> Questo è un progetto sviluppato originariamente per esigenze personali e condiviso liberamente a beneficio della community.
> **Non viene fornito supporto attivo, manutenzione o sviluppo di nuove funzionalità su richiesta.**
> Se desideri apportare modifiche, correzioni o estensioni per il tuo ambiente, **sentiti libero di fare un Fork del repository** e personalizzarlo a tuo piacimento!

Una Custom Lovelace Card per Home Assistant che visualizza dinamicamente la topologia della rete locale sotto forma di grafo interattivo ad albero o costellazione radiale.

Il componente deduce i collegamenti fisici e logici combinando i dati provenienti dalle integrazioni di rete (es. router principale, access point, switch gestiti), interrogando il `device_registry` e l'`entity_registry` di Home Assistant, escludendo automaticamente i dispositivi disattivati, estraendo i MAC address hardware dalle connessioni e risolvendo i conflitti di connessione tramite un algoritmo a profondità massima (**Max-Depth Edge Resolution**).

---

## Caratteristiche

*   **Configurazione Completamente Visuale (Card Editor GUI):**
    *   **Nessun YAML Richiesto:** Puoi configurare l'intera scheda direttamente dall'interfaccia grafica di modifica scheda di Home Assistant.
    *   **Selezione Automatica Router Principale:** La prima integrazione aggiunta viene impostata automaticamente come principale, oppure puoi scegliere quale apparato è il gateway master tramite radio button. Non serve digitare manualmente l'indirizzo MAC.
    *   **Scansione Intelligente di Tutti i Dispositivi:** Analizza tutte le entità associate all'integrazione per individuare gli attributi disponibili (es. porta o canale).
    *   **Classificazione LAN vs Wi-Fi con 1 Click:** Rileva tutti i valori reali di porta e canale presenti sui dispositivi (es. `LAN 1`, `5 GHz`, `2.4 GHz`) e permette di classificarli in LAN o Wi-Fi con chip interattivi.
*   **Stili di Grafo Selezionabili (`layout_mode`):**
    *   **Albero (Dall'alto verso il basso - Default):** Disposizione gerarchica compatta e ordinata con il router principale in cima e le interfacce e dispositivi che scendono a pettine.
    *   **Costellazione Radiale (A raggiera):** Disposizione organica circolare con fisica 2D centrata attorno al router principale.
    *   **Albero Orizzontale (Da sinistra a destra):** Flusso orizzontale ideale per schermi ultra-wide o pannelli orizzontali.
*   **Sottorami Distinti per Ogni Interfaccia di Rete:**
    *   Nodi intermediari puliti per ciascuna porta o canale specificato (es. `LAN 1`, `5 GHz`, `2.4 GHz`) o generico se non indicato.
*   **Linee Senza Frecce:** Collegamenti puliti senza frecce direzionali superflue (linee continue per la LAN, tratteggiate per il Wi-Fi).
*   **Layout Fluido e Responsive:**
    *   Altezza elastica automatica basata sullo schermo (`min(70vh, 650px)`) con `ResizeObserver` che adatta la vista al cambio di orientamento su smartphone, tablet e PC.
*   **Filtro Dispositivi Offline:** Pulsante rapido in testata (`Mostra/Nascondi offline`) per pulire al volo la mappa.
*   **Esclusione Dispositivi Disattivati:** Rileva ed esclude automaticamente qualsiasi dispositivo o entità disattivata in Home Assistant (`disabled_by`).
*   **Dettagli Interattivi al Click:** Cassetto laterale con dettagli completi (IP, MAC, porta/canale, stato) e pulsante per aprire la scheda entità nativa di Home Assistant (`hass-more-info`).
*   **Zoom Controls:** Controlli on-screen `+`, `−`, `⛶` (adatta alla finestra) e rotellina del mouse calibrata per uno zoom morbido e progressivo.

---

## Installazione

### Tramite HACS (Home Assistant Community Store)
1. In Home Assistant, apri **HACS** > **Frontend**.
2. Clicca sui tre puntini in alto a destra > **Repository personalizzati**.
3. Inserisci l'URL di questo repository e seleziona la categoria **Lovelace**.
4. Clicca su **Scarica**.

### Installazione Manuale
1. Copia il file compilato `dist/network-map-card.js` nella cartella `config/www/` di Home Assistant.
2. In Home Assistant vai su **Impostazioni** > **Pannelli di controllo** > **Risorse** (nei tre puntini in alto a destra) e aggiungi:
   * **URL:** `/local/network-map-card.js`
   * **Tipo di risorsa:** `Modulo JavaScript`
3. Ricarica la pagina forzatamente (`Ctrl + F5` o `Cmd + Shift + R`).

---

## Configurazione

### 1. Configurazione Visuale (Consigliata)
Non serve scrivere codice YAML:
1. Nella tua plancia Lovelace, clicca su **Modifica plancia** > **+ Aggiungi scheda**.
2. Cerca **"Network Map Card"**.
3. Scegli lo **Stile del grafo** desiderato (*Albero*, *Costellazione radiale*, *Albero orizzontale*).
4. Nel menu a tendina seleziona l'integrazione di rete da aggiungere (es. l'integrazione del router principale) e clicca **Aggiungi**.
5. Seleziona l'attributo che indica la porta o canale e clicca su **LAN** o **Wi-Fi** accanto a ciascun valore rilevato.
6. Aggiungi le eventuali altre integrazioni secondarie (es. Access Point o Switch di rete).
7. Salva la scheda.

---

### 2. Configurazione Manuale (YAML)

Se preferisci configurarla in modalità YAML, ecco un esempio completo:

```yaml
type: custom:network-map-card
title: "Mappa di Rete"
layout_mode: tree # Opzioni: tree (default), radial, horizontal
show_offline: true # true = mostra anche i dispositivi disconnessi

integrations:
  # Integrazione 1: Router Principale / Gateway
  - config_entry_id: "01JABCD1234XYZ..."
    is_master: true # Imposta questo router come nodo principale
    link_attribute: "port" # Attributo dell'entità che espone la porta
    lan_values: ["LAN 1", "LAN 2", "LAN 3", "LAN 4", "eth"]
    wifi_values: ["SSID1", "SSID2", "5G", "2.4G", "wlan"]

  # Integrazione 2: Access Point / Switch Secondario
  - config_entry_id: "01JEFA5678WKV..."
    is_master: false
    link_attribute: "channel"
    wifi_values: ["2.4 GHz", "5 GHz", "Ch 1", "Ch 6", "Ch 11", "Ch 36"]
```

#### Opzioni di Configurazione Principali

| Parametro | Tipo | Descrizione | Default |
| :--- | :--- | :--- | :--- |
| `type` | string | Obbligatorio: `custom:network-map-card` | - |
| `title` | string | Titolo visualizzato nella testata della scheda | `"Mappa di Rete"` |
| `layout_mode` | string | Stile di layout: `tree` (albero top-down), `radial` (costellazione), `horizontal` (albero orizzontale) | `"tree"` |
| `height` | string | Altezza personalizzata CSS (es. `"500px"`, `"60vh"`). Se omesso, è automatico e responsive. | `min(70vh, 650px)` |
| `show_offline` | boolean | Mostra inizialmente i dispositivi offline sulla mappa | `true` |
| `integrations` | list | Elenco delle integrazioni di rete da visualizzare | `[]` |

#### Opzioni per Singola Integrazione (`integrations`)

| Parametro | Tipo | Descrizione | Default |
| :--- | :--- | :--- | :--- |
| `config_entry_id` | string | ID univoco dell'integrazione in Home Assistant | Obbligatorio |
| `is_master` | boolean | Se `true`, imposta questo apparato come router master al vertice | `false` (la 1ª è master) |
| `root_mac` | string | Indirizzo MAC dell'apparato (auto-rilevato se omesso) | Auto-rilevato |
| `link_attribute` | string | Attributo da cui leggere porta LAN o canale Wi-Fi | Auto-rilevato |
| `lan_values` | list/string | Valori o parole chiave da classificare come LAN cablata | Valori standard |
| `wifi_values` | list/string | Valori o parole chiave da classificare come Wi-Fi wireless | Valori standard |

---

## Sviluppo Locale

Requisiti: Node.js >= 18

```bash
# Installa le dipendenze
npm install

# Esegui i test unitari
npm test

# Compila il bundle singolo di produzione in dist/
npm run build
```
