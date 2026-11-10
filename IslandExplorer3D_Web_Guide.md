# Island Explorer 3D — Three.js Edition (no GPU needed)

A browser-based 3D game: runs on integrated graphics and 4 GB RAM. Your **Aj.fbx** is the player and your **map image** is turned into the real 3D island automatically.

## 1. Run it (2 minutes)
1. Unzip `IslandExplorer3D_Web.zip` anywhere (e.g. `C:\IslandExplorer3D_Web`).
2. Double-click **`start-game.bat`**. A small black window opens (keep it open) and your browser opens `http://localhost:8080/`.
3. Wait for "Generating 3D island from the map…" (10–30 s on a slow PC), then click **New Game**.

Requirements: Windows 10, **Chrome or Edge**, and an internet connection for the first load (Three.js is loaded from a CDN, then cached). Do **not** double-click `index.html` directly — browsers block local files; use `start-game.bat`.
Fallback if PowerShell is blocked: install VS Code + "Live Server" extension, right-click `index.html` → *Open with Live Server*.

## 2. Controls
WASD move · **Shift** run · **Space** jump · Mouse look · **E** interact/collect · **Tab** inventory · **M** toggle minimap · **Esc** pause (Resume / Save / Load / Main Menu + volume, quality and shadow settings)

## 3. Make the character walk (free animations)
Your Aj.fbx is a Mixamo skin with no animations, so it starts in T-pose with a small bounce.
1. mixamo.com → pick **Idle, Walking, Running, Jump** → Download: Format **FBX Binary (.fbx)**, Skin **Without Skin**.
2. Save them in `assets/anims/` as `Idle.fbx`, `Walking.fbx`, `Running.fbx`, `Jump.fbx`.
3. Refresh the page — they're detected automatically (alternate names are listed in `js/config.js`, `ANIM_FILES`).

## 4. Your 12 milestones → where they live
| # | Milestone | File / what it does |
|---|---|---|
| 1 | Basic environment | `game.js`: scene, sun + hemisphere light, fog, sun/moon discs, water plane |
| 2 | Island terrain + colliders | `terrain.js`: reads `assets/IslandMap.png`, classifies water/sand/grass/forest/road/city/rock/snow, builds a flat-shaded low-poly mesh (160×87 cells), carves lakes/rivers, flattens the city, raises the north mountain. Circle colliders in `world.js` |
| 3 | Player setup | `player.js`: loads `Aj.fbx`, auto-scales to 1.8 m, feet on ground (capsule placeholder if the file is missing) |
| 4 | Player controller | `player.js`: walk 4 / run 7.5 m/s, jump, gravity, slope + deep-water blocking, collision with trees/rocks/buildings |
| 5 | Third-person camera | `game.js` `updateCamera`: pointer-lock mouse look, terrain collision, smooth zoom |
| 6 | Props + triggers | `world.js`: 320 instanced trees, rocks, villages, 80 city buildings + castle, sign posts, floating place labels, place trigger radii |
| 7 | Collection + inventory | `game.js`: E to collect Wood/Stone/Fruit (96 items), 99 max each, quest objectives (`config.js` → `OBJECTIVES`) |
| 8 | UI | `index.html`: HUD, clock, quest box, prompt, toasts, Tab inventory, minimap using your map image |
| 9 | Day/night | `game.js` `applyTime`: 5-minute day (`DAY_LENGTH`), sun/moon motion, sky/fog/light colours |
| 10 | Menus + save/load | Main menu (New/Continue), pause menu, Save/Load stored in the browser's localStorage |
| 11 | Audio | `audio.js`: generated music + SFX (no files), volume sliders |
| 12 | Optimization + "build" | Instancing, flat vertex-colour materials (no textures), pixel-ratio quality setting, shadows off by default. To distribute: zip the folder (players run `start-game.bat`) |

## 5. Low-end tuning
- Pause menu → **Render quality: Low** is the biggest FPS gain. Keep **Shadows off**.
- `js/config.js`: lower `COLS` (e.g. 120) for a lighter terrain; `DAY_LENGTH` for day speed.
- `js/world.js`: reduce the tree count (`trees.length < 320`) if the frame rate is low.
- If forests/grass look wrong, change `FOREST_GREEN_MAX` in `config.js`.
- If the browser shows software rendering ("SwiftShader"), enable *Use graphics acceleration when available* in Chrome/Edge settings and update the Intel graphics driver.

## 6. Optional: work offline
Install Node.js, run `npm install three@0.160.0`, copy `node_modules/three` into a `libs/` folder, then in `index.html` change the import map to
`"three": "./libs/three/build/three.module.js"` and `"three/addons/": "./libs/three/examples/jsm/"`.

## 7. Troubleshooting
| Problem | Fix |
|---|---|
| Blank page / "Error:" on loading screen | Open via `start-game.bat`; check internet for the first load; press F12 → Console |
| Port 8080 busy | Close other servers, or change `$port` in `server.ps1` |
| Mouse doesn't capture | Click the game once; Esc then Resume re-captures |
| Character invisible / white | Check `assets/Aj.fbx` exists; textures embedded in the FBX are used automatically |
| Stuck in water edge | Deep water (> ~0.6 m) is blocked by design; walk back to the beach |
