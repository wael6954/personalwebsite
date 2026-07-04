# Transit World — Low-Poly (Bruno-Simon-inspired) Kit

A playful, flat-color low-poly transit world, built in Blender for a navigable three.js
portfolio scene. **Y-up**, **1 unit = 1 metre**. No textures — all color is in the GLB
materials (baseColor factors), so the whole thing is tiny.

## Files

| File | What | Size |
|------|------|------|
| `tram.glb` | The chunky low-poly streetcar (hero) | 28 KB |
| `world.glb` | **Circular "roundabout town":** a ring road + tram track with detailed buildings arranged *around* it facing center — gabled townhouses (dormers, chimneys, bay windows, storefronts, awnings), a **church landmark** (tower, spire, clock, stained glass) and a **brick apartment mid-rise** (balconies, rooftop tank). Center holds a **park with a pond + fountain**, benches, and **four labeled section signs** (About / Projects / Experience / Résumé) at the park's four corners. Grass tufts + textured ground, trees ringing the park, streetlights, bushes | 2.3 MB |
| `sky.glb` | Stylized puffy clouds + a bird flock (keep separate so you can drift/animate them in the web app) | 27 KB |
| `name.glb` | "WAEL HALABI" 3D letters — the web app floats these high in the sky and billboards them to face the camera (hidden in aerial view) | 31 KB |
| `Wael_Halabi_Resume.pdf` | Résumé PDF — linked by the "Download résumé" button in the Résumé section | 81 KB |
| `index.html` + `main.js` | **The scrollytelling portfolio web app** — grounded island (sea + mountains), roundabout town, tram rides the ring, orbit landing → damped scrolljack tour, section content panels, soft shadows | — |

### How the portfolio works (`main.js`)

The world sits on a **grass island in a sea, ringed by low-poly mountains**. The experience is a **cinematic scrolljack**, not free navigation:

- **Landing = slow auto-orbit.** The name floats in the sky. An **Aerial view** button (top-down) is offered *only here*; scrolling in dismisses it.
- **First scroll wakes the streetcar** and hands off to a **damped, section-based** tour. Scroll back to the top and orbit resumes.
- **Each sign is a section.** The camera eases to a beat facing each sign and its content panel fades in: About, Projects, Experience, Résumé. The panels scroll internally, and the tour only eases to the next sign once you scroll **past the end** of the current panel (so you can read without jumping). The final **Contact** beat is a high overview of the whole city with the name in the sky.
- Input: wheel / trackpad, touch-drag, arrow / PageUp-Down / Space (jump sections), and the right-side nav dots (click a section). A `prefers-reduced-motion` / mobile fallback tightens the damping and keeps the nav dots for jumping.

Tune the tour by editing the `STOPS` array (camera `pos` + `look` per beat) in `main.js`.
All section copy lives in `index.html` (the `.panel` blocks).

## ▶ Run the web app

The GLBs must be served over HTTP (not `file://`). From this folder:

```bash
py -m http.server 8000        # or: npx serve
```

Then open **http://localhost:8000** and scroll. three.js + loaders come from a CDN (import
map in `index.html`), and the Draco decoder from Google's CDN — so it needs internet at
runtime. To embed in your React/Vite site, port `main.js` into a component and
`npm install three` (see notes at the bottom).

> **Note:** GLBs are cache-busted with `?v=Date.now()`; `main.js` is versioned (`?v=2` in
> `index.html`). After editing `main.js`, bump that number (or hard-reload) so the browser
> fetches the new module instead of a cached copy.

The tram is a **separate file** on purpose — in the web app it's the moving/hero object,
while `world.glb` is the static environment. The tram sits at the origin on the rails (its
length runs along **X**); the main road runs along X and a cross road along the other
horizontal axis.

## Art style

- Flat solid colors, chunky beveled shapes, big round wheels — deliberately toy-like.
- Palette: TTC-red tram, cream trim, bright building colors (blue/orange/teal/yellow/pink/green),
  green ground, dark roads. The "WAEL HALABI" letters are red.
- Everything is original geometry — **no attribution required** (unlike the photoreal kit).

## Building the web app later (not done yet — this was scoped to models only)

The plan for the navigable three.js scene:

1. **Load** `world.glb` once (static) and `tram.glb` (the hero) with `GLTFLoader` (+ `DRACOLoader`,
   decoder from `gstatic.com/draco/v1/decoders/` — both are Draco-compressed).
2. **Shading for the Bruno look:** either keep the flat materials with soft lighting, or swap
   meshes to `MeshToonMaterial` for a cel-shaded feel. Add one soft directional light + a
   hemisphere fill, and a soft contact/blob shadow under the tram.
3. **Navigable camera — follow the ring, don't go straight.** The town is a **circle** (ring
   road centerline radius ≈ 17m, buildings around radius ≈ 24m, central park/pond at the
   origin). Drive the camera along a **circular / `CatmullRom` loop path** so navigation
   *winds around* the town (matching the feel of the transit-map site), easing to a stop at
   each project board (they sit at radius ≈ 12.5m at ~40°, 160°, 280°). Point the camera
   inward/along the ring; `OrbitControls` with damping for free look between stops.
4. **Interactivity:** raycast the 3 `Board_*` panels and the `Name_WaelHalabi` letters so
   clicking them opens a project / section.
5. Optional later: gently drift the tram along the rails, add the drivable physics (Rapier)
   if you ever want the full Bruno driving experience.

## Note on previews

Full Cycles/Eevee **renders were crashing this Blender session**, so the build was previewed
with viewport screenshots rather than beauty renders. The real visual polish (toon shading,
shadows, sky) happens in the three.js app anyway.
