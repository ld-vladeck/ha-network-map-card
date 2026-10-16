# Network Map Card for Home Assistant

Una Custom Lovelace Card per Home Assistant che visualizza dinamicamente la topologia della rete locale sotto forma di grafo gerarchico interattivo.

Il componente deduce i collegamenti fisici combinando i dati provenienti dalle integrazioni di rete (es. router principale, access point, switch gestiti), interrogando il `device_registry` e l'`entity_registry` di Home Assistant, estraendo i MAC address hardware dalle connessioni e risolvendo i conflitti di connessione tramite un algoritmo a profondità massima (**Max-Depth Edge Resolution**).

---

## Caratteristiche

*   **Standard Home Assistant & HACS:** Pienamente compatibile con HACS e integrato con il Card Picker di Lovelace (`window.customCards`).
*   **Nomi Reali dei Nodi Radice:** Recupera automaticamente il nome personalizzato del router e dell'Access Point dai dispositivi di Home Assistant.
*   **IP Address in Evidenza:** Mostra l'indirizzo IP del dispositivo direttamente sotto al nome (senza l'ingombro del MAC sul grafo principale).
*   **Sottorami Distinti per Ogni Interfaccia di Rete:**
    *   **Nodi Interfaccia Puliti:** Nomi testuali compatti ed eleganti (senza icone emoji, es. `LAN 1`, `5 GHz`, `2.4 GHz`).
    *   **Costellazione Organica Libera (Full 2D Physics):** Tutti i nodi sono liberi di disporsi naturalmente nello spazio 2D attorno al proprio apparato/interfaccia di rete.
    *   **Distanze Ampie Anti-Sovrapposizione:** Molle ed elasticità calibrate (`springLength: 180` per Wi-Fi) con forte repulsione per evitare qualsiasi sovrapposizione tra i nomi dei dispositivi.
*   **Filtro Dispositivi Offline (Pulsante in Testata):** Comodo tasto `[● Nascondi offline] / [○ Mostra offline]` per nascondere i dispositivi non connessi e fare pulizia sulla mappa con un solo click.
*   **Stato Connessione Dinamico:** Nodi a cerchio/punto verdi se connessi, grigi se disconnessi.
*   **Cassetto Dettagli Interattivo (al click):** Mostra IP, MAC, porta/canale, tipo di connessione (LAN/Wi-Fi) e tasto per aprire la scheda nativa di Home Assistant.
*   **1-Click YAML Copy:** Elenco integrato delle integrazioni rilevate in HA con suggerimento del MAC della radice e copia rapida negli appunti.

---

## Installazione Rapida

1. Copia il file compilato `dist/network-map-card.js` nella cartella `config/www/` del tuo Home Assistant.
2. In Home Assistant vai su **Impostazioni** > **Pannelli di controllo** > **Risorse** (in alto a destra nei tre puntini) e aggiungi:
   * **URL:** `/local/network-map-card.js`
   * **Tipo:** Modulo JavaScript
3. Ricarica la pagina forzatamente (`Ctrl + F5` o `Cmd + Shift + R`).

---

## Configurazione della Card (YAML)

### Test con Singola Integrazione (Consigliato per iniziare)

Configurazione minima per testare il router principale con diagnostica a schermo:

```yaml
type: custom:network-map-card
title: "Mappa Router"
master_root_mac: "00:11:22:33:44:01" # MAC reale del tuo router

# Test integrazione singola:
config_entry_id: "INSERISCI_QUI_CONFIG_ENTRY_ID_ROUTER"
root_mac: "00:11:22:33:44:01"
# Opzionali:
# link_attribute: "port" # Se l'integrazione espone la porta (es. lan_port)
debug: true # Mostra a schermo quanti device vengono trovati
```

### Configurazione Completa (Multi-Integrazione: Router + Access Point)

```yaml
type: custom:network-map-card
title: "Mappa di Rete Completa"
master_root_mac: "00:11:22:33:44:01"

integrations:
  # Router principale (es. ZTE)
  - config_entry_id: "01JABCD1234XYZ..."
    root_mac: "00:11:22:33:44:01"
    link_attribute: "port"
    # Mappatura esplicita dei valori porta per LAN e Wi-Fi:
    lan_values: ["LAN1", "LAN2", "LAN3", "LAN4", "eth"]
    wifi_values: ["SSID1", "SSID2", "5G", "2.4G", "wlan"]

  # Access Point secondario (es. TP-Link)
  - config_entry_id: "01JEFA5678WKV..."
    root_mac: "00:11:22:33:44:02"
    link_attribute: "channel"
    wifi_values: ["2.4 GHz", "5 GHz", "Ch 1", "Ch 6", "Ch 11", "Ch 36"]
```

### Come trovare il `config_entry_id` in Home Assistant
1. Vai su **Impostazioni** > **Dispositivi e Servizi**.
2. Clicca sull'integrazione desiderata (es. ZTE o TP-Link).
3. Guarda l'URL nel browser: `.../integration/config_entry/01JABCD1234XYZ...`.
4. Copia la stringa finale alfanumerica: quello è il `config_entry_id`.
