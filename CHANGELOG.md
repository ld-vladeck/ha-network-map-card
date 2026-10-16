# Changelog

Tutte le modifiche degne di nota a questo progetto saranno documentate in questo file.

## [1.0.0] - 2026-10-16

### Funzionalità Implementate
- **Custom Lovelace Card per Home Assistant:** Supporto nativo HACS e registrazione nel Card Picker di Lovelace (`window.customCards`).
- **Integrazione Registri HA via WebSocket:** Interrogazione dinamica di `device_registry` ed `entity_registry` per recuperare i client associati a ciascun `config_entry_id`.
- **Deduplicazione basata su MAC Address:** Fusione automatica di nodi rilevati da integrazioni sovrapposte per evitare duplicati fisici.
- **Risoluzione Topologica Max-Depth:** Inferenza della distanza reale dal router master con eliminazione automatica delle scorciatoie logiche IP a favore del collegamento fisico attraverso l'Access Point secondario.
- **Sottorami per Interfaccia di Rete:**
  - Creazione automatica di nodi intermediari per ogni interfaccia/porta specificata (es. `LAN 1`, `5 GHz`, `2.4 GHz`) e per interfacce generiche.
  - Etichette testuali pulite senza emoji.
- **Visualizzazione Grafica e Fisica Organica (2D Physics):**
  - Router Principale (Master) evidenziato con icona `🌐`, colore blu scuro e dimensione maggiorata.
  - Access Point secondari con icona `📡`.
  - Dispositivi Wi-Fi liberi di disporsi in costellazione circolare a 360° attorno alla propria interfaccia.
  - Distanze aumentate (`springLength: 180`) e repulsione potenziata con `avoidOverlap` attivo per evitare sovrapposizioni tra etichette e IP.
- **Tasto Filtro Offline:** Pulsante in testata per mostrare/nascondere con un click tutti i dispositivi disconnessi.
- **Zoom Controls:** Pulsanti on-screen `+`, `−`, `⛶` (adatta alla finestra) e rotellina del mouse ammorbidita.
- **Cassetto Dettagli Interattivo:** Scheda laterale al click su ogni nodo con MAC, IP, interfaccia, stato e pulsante per aprire la scheda entità nativa di Home Assistant (`hass-more-info`).
- **Supporto Diagnostica & 1-Click Copy:** Elenco integrato delle sole integrazioni che tracciano `device_tracker`, con suggerimento del MAC e copia immediata negli appunti dello snippet YAML.
