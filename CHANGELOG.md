# Changelog

## [2026.11.1] - 2026-11-10

### Added
- **Tie-break roaming Wi-Fi:** Gestione del transitorio di roaming tra Access Point a pari livello con prioritizzazione basata su timestamp più recente (`last_seen`, `connect_time`) e potenza del segnale (`signal`, `rssi`).

### Fixed
- **Compatibilità HA Core 2026.11:** Risolto mancato aggancio dei client tracker privi di `device_id` tramite indicizzazione automatica `(config_entry, MAC)`.
- **Protezione stato online:** Impedita la sovrascrittura dello stato attivo da parte di entità `unavailable` o ripristinate (`restored: true`) di altre integrazioni.
- **Punteggio qualità archi:** Precedenza alle interfacce e stati concreti rispetto a candidati fantasma o generici non specificati.

## [2026.11.0] - 2026-11-01

- **Zoom con doppio click e doppio tap:** Introdotto lo zoom progressivo in stile Google Maps con centratura dinamica sul punto toccato o cliccato. Supportato anche `Shift + doppio click` per rimpicciolire.
- **Supporto multi-touch e pinch-to-zoom:** Configurato `touch-action: none` per consentire lo zoom naturale con due dita (allargamento/pizzico) ed eliminare i conflitti con le gesture del browser mobile.
- **Topologia di riferimento dedicata:** Aggiunto `src/reference-network.json` con dati reali anonimizzati per garantire test accurati e generazione automatica dell'anteprima (`preview.html`).

## [2026.10.3] - 2026-10-24

- **Layout Molecolare Reattivo:** Adattamento dinamico dell'orientamento dello scheletro in base allo schermo (orizzontale su desktop, verticale su smartphone) con naturale inclinazione organica.
- **Ramo 'Disconnessi':** Raggruppamento chiaro e visivamente distinto dei dispositivi offline sotto un'interfaccia dedicata.
- **Miglioramenti generali:** Raffinamento del riconoscimento dei dispositivi e stabilità generale del grafo.

## [2026.10.2] - 2026-10-18

- **Layout Molecolare:** Nuovo layout predefinito a scheletro fisso con grappoli periferici liberi e supporto multi-router senza sovrapposizioni.
- **Risoluzione stato online:** Priorità assoluta allo stato connesso nella deduplicazione di MAC uguali tra più integrazioni.
- **Dettagli avanzati:** Percorso compatto (`A > B > C`), tracciamento simultaneo di nome entità e dispositivo da più integrazioni, con prevenzione overflow.
- **Nodo Home Assistant:** Riconoscimento del server con icona nativa ufficiale dall'editor visuale.
- **Persistenza navigazione:** Auto-fit automatico allo stabilizzarsi della fisica e riaggancio istantaneo del canvas al cambio scheda in Lovelace.
- **Editor GUI:** Configurazione esplicita del Gateway Master MAC con suggerimenti automatici.

## [2026.10.1] - 2026-10-17

- **Configurazione visuale (GUI):** Aggiunto editor grafico per configurare la scheda senza scrivere codice YAML.
- **Stili del grafo:** Scelta del layout tra Albero (top-down), Costellazione radiale e Albero orizzontale.
- **Dispositivi disattivati:** Esclusione automatica delle entità disattivate in Home Assistant.
- **Interfaccia e stile:** Layout responsive fluido, linee senza frecce e allineamento allo stile nativo di Home Assistant.

## [2026.10.0] - 2026-10-16

- **Rilascio iniziale:** Custom Lovelace Card per la mappa topologica della rete locale.
- **Inferenza topologica:** Mappatura automatica dei dispositivi da integrazioni multiple con deduplicazione via MAC.
- **Interfacce di rete:** Sottorami dedicati per porte LAN e canali Wi-Fi.
- **Interattività:** Zoom, filtro dispositivi offline e cassetto dettagli con apertura scheda entità HA.
