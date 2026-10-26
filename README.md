# Customizable TTS Card

Carte Lovelace pour Home Assistant qui diffuse un message vocal (TTS) sur une sélection d'enceintes, avec des annonces enregistrées réutilisables.

- Sélection des enceintes par simples puces, ou « Partout »
- Annonces enregistrées : clic pour remplir le message, ▶ pour diffuser directement
- Enregistrement de nouvelles annonces depuis la carte (stockées dans les données utilisateur HA, synchronisées entre appareils)
- Volume d'annonce réglable ; la musique en cours reprend après l'annonce (`announce: true`)

## Installation

### HACS (dépôt personnalisé)

1. HACS → menu ⋮ → *Dépôts personnalisés* → ajoutez `https://github.com/Ergorock/customizable-TTS-card`, catégorie **Dashboard**.
2. Installez **Customizable TTS Card**, puis rechargez le navigateur.

### Manuelle

1. Copiez `customizable-tts-card.js` dans `config/www/customizable-tts-card.js`.
2. *Paramètres → Tableaux de bord → ⋮ → Ressources* : ajoutez `/local/customizable-tts-card.js?v=1.0.0` (type *Module JavaScript*).

Rafraîchissez ensuite le navigateur (Ctrl+Maj+R).

## Configuration

```yaml
type: custom:customizable-tts-card
title: Annonces
tts_engine: tts.google_translate_fr_com
entities:                 # vide = toutes les enceintes compatibles « announce »
  - media_player.salon
  - entity: media_player.cuisine
    name: Cuisine
volume: 35                # volume d'annonce par défaut (0-100), optionnel
language: fr              # optionnel, transmis au moteur TTS
announcements:            # annonces fixes, en plus de celles enregistrées depuis la carte
  - name: À table
    message: À table, le repas est prêt !
    icon: mdi:silverware-fork-knife
```

L'annonce est envoyée via `media_player.play_media` avec `announce: true` et, si un volume est défini, `extra: {volume: N}` (pris en charge par l'intégration Sonos).
