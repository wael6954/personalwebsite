# Transit World

An interactive 3D portfolio for Wael Halabi, built as a low-poly transit town you scroll through. It's a single static page that loads a hand-modeled Blender world into a three.js scene and then rides you around it on rails. No build step, no framework. Open the page and it runs.

Everything is flat-color low-poly geometry with the color baked into the GLB materials, so the assets stay small. One unit is one metre, and the exported models are Y-up.

## What's in here

| File | What it is |
|---|---|
| `index.html` + `main.js` | The web app. Scene setup, the scrolljack tour, animations, sound, and all the UI live here. |
| `simple.html` | A plain-HTML version of the whole portfolio. It loads automatically when the browser has no WebGL or JavaScript is off, and there's a "Simple version" link in the corner. |
| `world.glb` | The town. Ring road and tram track, buildings facing a central park with a pond, a walled fountain, four labeled section signs, trees, streetlamps, ducks, townsfolk, a dock, and a small fleet of sailboats out on the sea. |
| `tram.glb` | The red streetcar. It rides the ring and eases to a stop at the shelter each lap. |
| `sky.glb` | Clouds and a bird flock that drift above the town. |
| `name.glb` | The 3D "WAEL HALABI" letters that float in the sky and turn to face the camera. |
| `statement.glb`, `contact.glb` | The red 3D sky text for the landing tagline and the Contact overview. |
| `favicon.svg`, `og.jpg` | The site icon (a little streetcar) and the social-share card. |
| `Wael_Halabi_Resume.pdf` | The résumé, opened in an in-page viewer or downloaded from the Résumé section. |
| `transit_world.blend` | The Blender source for everything above. Renders crash this file, so it was built and checked with viewport screenshots and the live preview. |

## How it works

You land in a slow auto-orbit with the name floating overhead. From here you can pop into an aerial view, which is a top-down TTC-style route map where each section sign becomes a labeled station you can click to jump to.

The first scroll wakes the streetcar and hands you off to a damped, section-by-section tour. Each of the four signs (About, Projects, Experience, Résumé) is a stop. The camera eases to face the sign, its content panel fades in, and the panel scrolls on its own. You only move to the next stop once you've scrolled past the end of the current panel, so nothing jumps while you're reading. The final beat is a high overview of the whole island for Contact, with the name back in the sky. Scroll to the top and the orbit resumes.

Drive it with the wheel or trackpad, a touch drag on mobile, the arrow keys, Page Up and Page Down, or Space. The nav dots on the right jump straight to any section. A reduced-motion and mobile fallback tightens the damping and keeps the dots.

## The small stuff

A few things reward poking around.

The town is alive. Chimneys puff smoke, leaves drift through the park, ducks paddle the pond, and townsfolk stand around the grass with one out on the dock. Sailboats bob on the horizon, and the streetcar dings as it pulls into its stop.

Most of it is clickable. Tap the streetcar for a bell and a little hop, tap a tree for a squash-and-bounce, tap the fountain for a splash, or tap the church to ring the bell and scatter the birds. All the sound is synthesized in the browser with WebAudio, and a mute button in the corner remembers your choice.

There's a day/night toggle too. Flip it and the sky turns to dusk, stars and a moon fade in, the streetlamps and windows glow warm, and the fountain lights up. It also remembers your preference between visits.

The Résumé section has a "View résumé" button that opens the PDF in an in-page viewer, with a download button next to it.

## Run it locally

The GLBs need to be served over HTTP, not opened from `file://`. From this folder, start a static server.

```bash
py -m http.server 8000
# or: npx serve
```

Then open http://localhost:8000. three.js and its loaders come from a CDN via the import map in `index.html`, and the Draco decoder comes from Google's CDN, so it needs internet access at runtime.

One caching note. The GLBs cache-bust with `?v=Date.now()`, but `main.js` is pinned with a version query (`?v=30` right now) in `index.html`. If you edit `main.js`, bump that number or hard-reload so the browser fetches the new file instead of a cached copy.

## Editing content and tuning the tour

All the section copy lives in `index.html` inside the `.panel` blocks, so you can rewrite the About, Projects, Experience, and Résumé text without touching the scene code. The camera stops are the `STOPS` array in `main.js`, each with a `pos` and a `look`, if you want to re-aim a beat.

Fonts are Montserrat for headings and labels, and Proxima Nova for body with Montserrat as the fallback. Proxima Nova is a commercial Adobe font, so it needs your own Adobe Fonts kit to actually load. There's a commented placeholder for that kit in the head of both HTML files, and until you add it, everything renders in Montserrat.

## Built with

Plain three.js (r0.160) over a CDN import map, GLTFLoader and DRACOLoader for the Draco-compressed GLBs, and WebAudio for the sound. No bundler, no framework. The geometry is all original work made in Blender, so nothing here needs attribution.

## Deploying

It's a static site, so any static host works. Point the host at this folder and serve `index.html`. GitHub Pages, Netlify, Vercel as a static project, or Cloudflare Pages all handle it with no build command. The only runtime dependency is internet access for the three.js and Draco CDNs.
