<div align="center">

# 🏝️ Island Explorer 3D — Samudragrah

**पूर्णतः भारतीयम् उद्यमम्**

A third-person 3D island adventure that runs **in your browser** — no GPU, no install.

[▶ **Play the game**](https://YOUR-USERNAME.github.io/YOUR-REPO/)

</div>

---

## About

Explore **Samudragrah**, a low-poly island generated directly from a hand-painted map. Walk, run and jump across beaches, forests and hills, follow the river **Amritdhara**, climb towards **Vajra Shikhar**, visit the fortress **Suryakot** and enter the capital **Vismritnagar** — collecting wood, stone and fruit along the way.

Built to run smoothly on low-end PCs (Windows 10, Intel i5, 4 GB RAM, integrated graphics).

## Features

- 🗺️ **3D island generated from a map image** — terrain, beaches, rivers, roads and biomes come from the artwork
- 🧍 **Animated character (Aj)** — idle, run, jump and turn-in-place animations
- 🎥 **Three camera views** — third-person, first-person and an auto-controlled **cinematic** camera (press `V`)
- 🏰 **Places to discover** — Vismritnagar (city), Suryakot (castle), Madhuvan (village), Madhyasth (town), Samarpan (camp), Pratham Post (watch post), Chhoti Basti (hamlet), Amritdhara (river), Vajra Shikhar (mountain)
- 🎒 **Collect & quest system** — wood, stone, fruit, inventory and a chain of objectives
- 🧭 **Minimap** drawn from the island map
- 💾 **Save / Load**, pause menu, volume, quality and shadow settings
- 🎵 **Generated music and sound effects** (no audio files needed)
- 🌴 Palm trees, pines, oaks, houses, a walled city with a castle, and a harbor with boats

## Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| `Shift` | Run |
| `Space` | Jump |
| Mouse | Look around |
| `E` | Interact / collect |
| `Tab` | Inventory |
| `M` | Toggle minimap |
| `V` | Change camera view |
| `Esc` | Pause menu |

## Run it locally

1. Download or clone this repository.
2. Double-click **`start-game.bat`** (Windows). It starts a small local server and opens the game at `http://localhost:8080/`.
3. Click **New Game**.

> Open the game through the local server (or GitHub Pages). Double-clicking `index.html` directly will not work because browsers block local file loading.

**Requirements:** Chrome or Edge, and an internet connection on the first load (Three.js is loaded from a CDN).

## Tips for slow PCs

Open the pause menu (`Esc`) and set **Render quality → Low**, and keep **Shadows** off. You can also lower `COLS` in `js/config.js` (for example `220` → `160`).

## Project structure

```
index.html        Page, menus and HUD
js/config.js      Settings, place names, quests, animation files
js/terrain.js     Map image → terrain, ground texture and mesh
js/world.js       Trees, houses, city, castle, harbor, collectibles
js/player.js      Character, animations, movement and collisions
js/game.js        Scene, sky, water, cameras, quests, save/load
js/audio.js       Procedural music and sound effects
assets/           Map, logo, character and animation files
```

Built with [Three.js](https://threejs.org/) and plain JavaScript.

## Credits

**Made by Tejas Nand × Meta AI**

- Character and animations: [Mixamo](https://www.mixamo.com/) (Adobe). Please respect the Mixamo license — the character and animation files are for use in this game and should not be redistributed on their own.
- Three.js — MIT License.
- Logo and map artwork created for this project with AI image tools.
- The "Make in India" lion logo is shown as a tribute and belongs to its respective owner.

---

<div align="center">पूर्णतः भारतीयम् उद्यमम् 🇮🇳</div>
