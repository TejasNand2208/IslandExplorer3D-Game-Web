# Island Explorer 3D — Three.js Edition (no GPU needed)

A browser-based 3D game that runs on integrated graphics and 4 GB RAM. **Aj** (your Mixamo character, now with animations) explores a 3D island generated from your map image.

## 1. Run it
1. Unzip `IslandExplorer3D_Web.zip` (e.g. to `C:\IslandExplorer3D_Web`).
2. Double-click **`start-game.bat`** (keep the black window open). Your browser opens `http://localhost:8080/`.
3. Wait for the loading screen (about 20–60 s on a slow PC: it sculpts the island, paints the ground texture and loads 5 animation files), then click **New Game**.

Use **Chrome or Edge**, and have internet on the first load (Three.js comes from a CDN, then is cached). Don't double-click `index.html` directly.

## 2. Controls
WASD move · **Shift** run · **Space** jump · Mouse look · **E** interact/collect · **Tab** inventory · **M** minimap · **V** camera view · **Esc** pause (Resume / Save / Load / Main Menu, volume, quality, shadows)


## What's new (Samudragrah update)
- **Island name:** the island is now **Samudragrah** (main menu, welcome message, minimap caption, map title).
- **Renamed places (all old names removed, in the game and on the map image):**
  Vismritnagar (city) · **Suryakot** (castle) · Madhuvan (village) · Madhyasth (town) · Samarpan (camp) · Pratham Post (watch post) · Chhoti Basti (hamlet) · **Amritdhara** (new river label) · **Vajra Shikhar** (new mountain label).
  Each has a floating name label; signs tell their story; the quest chain now visits all of them.
- **New map image:** the old names were erased from the artwork and the new names painted in (`assets/IslandMap.png` is the minimap; `assets/IslandMapClean.png` is the text-free copy used to generate the 3D terrain). A copy is also in `IslandExplorer3D_Map_Samudragrah.png`.
- **Three camera views — press `V` to cycle:**
  1. **Third-person** (default).
  2. **First-person:** eye-level view with a light walking bob; Aj's body is hidden.
  3. **Cinematic (auto-controlled):** the camera cuts by itself between orbit, low front, side tracking, crane, aerial and chase shots, with black letterbox bars. Mouse look is off; WASD still moves Aj (relative to the view you had when you started walking).
- **Main page:** your **Make in India lion logo** and the line **पूर्णतः भारतीयम् उद्यमम्** appear on the main menu, above the credit "Made by Tejas Nand  X  Meta AI".

## 3. Earlier changes in this version
**Animations (Aj_*.fbx in `assets/anims/`)**
- `Aj_Standing_Idle` → idle, `Aj_Fast_Run` → run, `Aj_Jump` → jump (squeezed to fit the jump time).
- **No walk animation any more:** the run clip is used for all movement (a little slower without Shift, full speed while sprinting).
- `Aj_Left_Turn` / `Aj_Right_Turn` → when you stand still and swing the camera far to one side, Aj turns in place with the matching animation.
- Root motion is stripped so the game controls movement; animation files load without their textures to save RAM.

**Day/night removed** — the island is now always in bright daytime (static sun, sky, no clock). Sun position, light colours and fog are set at the top of `js/game.js`.

**More realistic map**
- Smooth terrain (220×120 cells) instead of flat low-poly facets, with fractal hills, a ridged snow-capped mountain, gentle beaches and rivers/lakes with banks.
- A painted ground texture: grass variations, forest floor, rock on steep slopes, snow, sand and wet sand, surf foam, a sandy→deep-teal sea floor, and **roads drawn from your map image**.
- Transparent animated ocean with ripples; gradient sky dome, sun and drifting clouds; distance fog.
- Vegetation: ~300 pines, 150 oaks, 80 beach palms, 180 bushes, 3,500 grass tufts and 60 rocks, with colour variation (all GPU-instanced).
- Gabled houses with chimneys, doors and windows in 3 village styles and 2 city styles; Aethelgard City now has a crenellated wall with 4 gates and towers, and a castle with keep, corner towers and curtain walls; a harbor pier with two bobbing sailboats.

**Logo** — your treasure-island artwork (`assets/logo.jpg`) is the title-screen and loading-screen logo; `assets/icon.png` (cropped palm + chest) is the browser tab icon. The main menu also shows **"Made by Tejas Nand  X  Meta AI"**.

## 4. Files
| File | Purpose |
|---|---|
| `index.html` | UI: menus, HUD, inventory, minimap |
| `js/config.js` | Settings, places, quests, animation file names |
| `js/terrain.js` | Map → heights, ground texture, mesh |
| `js/world.js` | Trees, houses, city, castle, items, colliders |
| `js/player.js` | Aj model, animations, movement, collisions |
| `js/game.js` | Scene, sky, water, camera, menus, quests, save/load |
| `js/audio.js` | Generated music and sound effects |

## 5. Low-end tuning
- Pause menu → **Render quality: Low**; keep **Shadows** off.
- `js/config.js`: `COLS` 220 → 160 for a lighter terrain.
- `js/world.js`: lower the grass tufts (`3500`) and tree counts if the frame rate is low.
- Loading is the slowest part (animation FBX files are ~7 MB each); it only happens once per page load.

## 6. Troubleshooting
| Problem | Fix |
|---|---|
| Blank page / "Error:" on the loading screen | Run via `start-game.bat`, check internet for the first load, press F12 for the console |
| Character in T-pose | Check `assets/anims/` contains the `Aj_*.fbx` files |
| Character turns the wrong way / odd turn animation | Turn clips are used best-effort; they only play when standing still |
| Forests/grass look wrong | Change `FOREST_GREEN_MAX` in `js/config.js` |
| Port 8080 busy | Change `$port` in `server.ps1` |
