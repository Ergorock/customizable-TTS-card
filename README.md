# Customizable TTS Card

*[Version française](README.fr.md)*

Lovelace card for Home Assistant that broadcasts a voice message (TTS) to a selection of speakers, with reusable saved announcements.

- Pick speakers with simple chips, or “Everywhere”
- Saved announcements: click to fill in the message, ▶ to play it right away
- Save new announcements from the card (stored in the HA user data, synced across devices)
- Adjustable announcement volume; the music playing resumes after the announcement (`announce: true`)
- Interface in English and French (follows the Home Assistant language)

## Installation

### HACS (custom repository)

1. HACS → ⋮ menu → *Custom repositories* → add `https://github.com/Ergorock/customizable-TTS-card`, category **Dashboard**.
2. Install **Customizable TTS Card**, then reload your browser.

### Manual

1. Copy `customizable-tts-card.js` to `config/www/customizable-tts-card.js`.
2. *Settings → Dashboards → ⋮ → Resources*: add `/local/customizable-tts-card.js?v=1.0.0` (type *JavaScript module*).

Then refresh your browser (Ctrl+Shift+R).

## Configuration

```yaml
type: custom:customizable-tts-card
title: Announcements
tts_engine: tts.google_translate_en_com
entities:                 # empty = every speaker that supports “announce”
  - media_player.living_room
  - entity: media_player.kitchen
    name: Kitchen
volume: 35                # default announcement volume (0-100), optional
language: en              # optional, passed to the TTS engine
announcements:            # fixed announcements, in addition to the ones saved from the card
  - name: Dinner
    message: Dinner is ready!
    icon: mdi:silverware-fork-knife
```

The announcement is sent with `media_player.play_media` and `announce: true` and, when a volume is set, `extra: {volume: N}` (supported by the Sonos integration).
