# Network Map Card for Home Assistant

> ### ⚠️ Progetto Personale & Supporto (Feel free to fork!)
> Questo è un progetto sviluppato originariamente per esigenze personali e condiviso liberamente a beneficio della community.
> **Non viene fornito supporto attivo, manutenzione o sviluppo di nuove funzionalità su richiesta.**
> Se desideri apportare modifiche, correzioni o estensioni per il tuo ambiente, **sentiti libero di fare un Fork del repository** e personalizzarlo a tuo piacimento!

Una Custom Lovelace Card per Home Assistant che visualizza dinamicamente la topologia della rete locale sotto forma di grafo interattivo (**Molecolare**, **Albero**, **Radiale**, **Orizzontale**).

Il componente deduce i collegamenti fisici e logici combinando i dati provenienti dalle integrazioni di rete (es. router principale, access point, switch gestiti), interrogando il `device_registry` e l'`entity_registry` di Home Assistant, escludendo automaticamente i dispositivi disattivati, dando precedenza assoluta allo stato online nella deduplicazione dei MAC address e risolvendo i percorsi multi-hop tramite profondità topologica (**Max-Depth Edge Resolution**).

---

## Caratteristiche

*   **4 Stili di Grafo Selezionabili (`layout_mode`):**
    *   **Molecolare (`molecular` - Predefinito):** Disposizione organica a scheletro portante rigido (router e interfacce a distanze calibrate e stabili) con dispositivi client mobili all'esterno. Mantiene sgombra l'area centrale inter-apparato ed è nativamente predisposto per topologie multi-router.
    *   **Albero (`tree`):** Gerarchia verticale classica ordinata dall'alto verso il basso.
    *   **Radiale (`radial`):** Disposizione organica a raggiera attorno al router master.
    *   **Orizzontale (`horizontal`):** Flusso gerarchico da sinistra verso destra, ideale per schermi ultra-wide o pannelli orizzontali.
    *   *Selezionabile dall'Editor Visuale o ciclabile con 1 click direttamente dal pulsante layout della mappa.*

*   **Configurazione Completamente Visuale (Card Editor GUI):**
    *   **Nessun YAML Richiesto:** Puoi configurare l'intera scheda direttamente dall'interfaccia grafica di modifica scheda di Home Assistant.
    *   **Selezione Router Principale (Gateway):** Campo dedicato per impostare o verificare il `master_root_mac`, con pulsanti rapidi pre-popolati con i MAC rilevati da Home Assistant.
    *   **Riconoscimento Server Home Assistant:** Menu a tendina per selezionare quale dispositivo ospita il server Home Assistant, evidenziato sulla mappa con l'icona ufficiale nativa azzurra.
    *   **Scansione Intelligente dei Dispositivi:** Analizza tutte le entità per individuare gli attributi disponibili (porta o canale).
    *   **Classificazione LAN vs Wi-Fi con 1 Click:** Rileva tutti i valori reali di porta e canale presenti sui dispositivi (es. `LAN 1`, `5 GHz`, `2.4 GHz`) e permette di classificarli in LAN o Wi-Fi con chip interattivi.
    *   **Verifica MAC per Singola Integrazione:** Possibilità di confermare o personalizzare il `root_mac` di ciascun apparato.

*   **Dettagli Completi e Interattivi al Click (Drawer Laterale):**
    *   **Percorso di Rete Fisico a Breadcrumb (`A > B > C`):** Visualizzazione compatta a sviluppo orizzontale dei soli apparati fisici dal Gateway al dispositivo (es. `Router Gateway > Access Point > Dispositivo`), escludendo le interfacce intermedie per la massima leggibilità, con pillole interattive cliccabili per mettere a fuoco la mappa.
    *   **Informazioni Comuni Consolidate:** Indirizzo IP e MAC address con pulsanti di copia rapida negli appunti, stato di connessione e tipo di interfaccia.
    *   **Multi-Integrazione con Nome Entità e Dispositivo:** Schede separate per ciascuna integrazione che traccia lo stesso dispositivo, riportando sia il **Nome entità** (friendly name) che il nome del **Dispositivo** fisico (se diversi), l'ID entità esatto, lo stato (`home`/`not_home`), la porta/canale, parametri Wi-Fi (dBm, Mbps) e pulsante per aprire direttamente la scheda nativa dell'entità in Home Assistant (`hass-more-info`).
    *   **Protezione Overflow Orizzontale:** Gestione dinamica dei testi lunghi (nomi host o ID entità complessi) con a capo automatico fluido riga per riga, prevenendo qualsiasi barra di scorrimento orizzontale.
    *   **Design Tipografico Pulito:** Interfaccia priva di icone o emoji decorative superflue, basata sui token grafici del tema nativo di Home Assistant.

*   **Motore Topologico Intelligente:**
    *   **Priorità Stato Online:** Quando più integrazioni rilevano lo stesso MAC address, la priorità di associazione all'interfaccia viene data al dispositivo online (`home`/`connected`), evitando che client attivi vengano agganciati a record storici o offline.
    *   **Risoluzione Max-Depth:** Se entrambi i record sono online o entrambi offline, il client viene collegato al nodo a profondità topologica maggiore (l'access point o switch fisico più vicino).
    *   **Ordinamento Alfabetico Naturale:** Tutte le interfacce di rete (LAN, Wi-Fi 2.4 GHz, Wi-Fi 5 GHz, ecc.) sono ordinate alfanumericamente in senso orario o da sinistra a destra.
    *   **Esclusione Dispositivi Disattivati:** Rileva ed esclude automaticamente qualsiasi dispositivo o entità disattivata in Home Assistant (`disabled_by !== null`).

*   **Interfaccia Grafica e Canvas:**
    *   **Adattamento Automatico al 100% dello Spazio:** La scheda riempie automaticamente tutto lo spazio orizzontale e verticale fornito dal contenitore esterno (viste a pannello, griglie o masonry), adattandosi in tempo reale grazie a `ResizeObserver`.
    *   **Canvas Full-Bleed:** Titolo e barre superiori rimosse per lasciare il 100% dell'area visiva al grafo della rete.
    *   **Linee Senza Frecce:** Collegamenti puliti senza frecce direzionali superflue (linee continue per la LAN, tratteggiate per il Wi-Fi).
    *   **Controlli Fluttuanti Integrati:** Pulsanti on-screen in basso a sinistra: `+` (zoom in), `−` (zoom out), `⛶` (adatta schermo), **icona layout** (rotazione al volo tra Molecolare, Albero, Radiale e Orizzontale) e **icona occhio** (per mostrare/nascondere temporaneamente i dispositivi offline).
    *   **Persistenza al Cambio Scheda:** Riaggancio istantaneo del canvas e ripopolamento automatico quando si naviga tra le schede della dashboard (`connectedCallback`), con auto-fit morbido allo stabilizzarsi della fisica.

---

## Installazione

### Tramite HACS (Home Assistant Community Store)
1. In Home Assistant, apri **HACS** > **Frontend**.
2. Clicca sui tre puntini in alto a destra > **Repository personalizzati**.
3. Inserisci l'URL del repository:
   ```text
   https://github.com/ld-vladeck/ha-network-map-card
   ```
4. Seleziona la categoria **Lovelace**.
5. Clicca su **Scarica**.

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
3. Scegli lo **Stile del grafo** desiderato (*Molecolare*, *Albero*, *Radiale*, *Orizzontale*).
4. Nel campo **MAC Router Principale (Gateway)** conferma o seleziona il MAC del tuo router primario.
5. Seleziona l'eventuale **Dispositivo Home Assistant** per mostrare l'icona ufficiale.
6. Aggiungi le integrazioni di rete da visualizzare (es. router principale, access point, switch).
7. Per ciascuna integrazione, seleziona l'attributo che indica la porta o canale e clicca su **LAN** o **Wi-Fi** accanto a ciascun valore rilevato.
8. Salva la scheda.

---

### 2. Configurazione Manuale (YAML)

Se preferisci configurarla in modalità YAML, ecco un esempio completo:

```yaml
type: custom:network-map-card
layout_mode: molecular # Opzioni: molecular (default), tree, radial, horizontal
master_root_mac: "AA:BB:CC:11:22:33" # Opzionale: MAC del router gateway principale (auto-rilevato se omesso)
homeassistant_mac: "B8:27:EB:44:55:66" # Opzionale: MAC del server Home Assistant (mostra icona dedicata)
show_offline: true # true = mostra inizialmente i dispositivi offline (default: true)

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
| `layout_mode` | string | Stile di layout: `molecular` (predefinito), `tree`, `radial`, `horizontal` | `"molecular"` |
| `master_root_mac` | string | MAC del router principale/gateway (livello 0). Se omesso, è auto-rilevato. | Auto-rilevato |
| `homeassistant_mac` | string | MAC del dispositivo che ospita Home Assistant (mostra icona dedicata) | - |
| `show_offline` | boolean | Mostra inizialmente i dispositivi offline sulla mappa (toggled da icona occhio) | `true` |
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
