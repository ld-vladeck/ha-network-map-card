# Changelog

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
