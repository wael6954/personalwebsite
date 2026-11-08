# Transit World

**Live at [waelhalabi.com](https://waelhalabi.com).** This repo is that site. The domain is a separate purchase, pointed at GitHub Pages, which serves the `main` branch of this repo (the `CNAME` file holds the domain). Pushing to `main` updates the live site within a minute or two.

An interactive 3D portfolio for Wael Halabi, built as a low-poly transit town you scroll through. It's a single static page that loads a hand-modeled Blender world into a three.js scene and then rides you around it on rails. No build step, no framework. Open the page and it runs.

Everything is flat-color low-poly geometry with the color baked into the GLB materials, so the assets stay small. One unit is one metre, and the exported models are Y-up.

## What's in here

| File | What it is |
|---|---|
| `index.html` + `main.js` | The web app. Scene setup, the scrolljack tour, animations, sound, and all the UI live here. |
| `simple.html` | A plain-HTML version of the whole portfolio. It loads automatically when the browser has no WebGL or JavaScript is off, and there's a "Simple version" link in the corner. |
| `projects-data.js` | The ten projects (title, year, area, tags, write-up, links) and what each poster draws. One source for the poster street. |
| `shelter-row.js` | The Shelter Row: the poster street that opens from the Projects sign. Poster cases, camera poses, caption card, input, and the clearing of anything that blocks the view. |
| `posters.js` | Draws each poster on a canvas: the title, the year and a drawing of the project's data or idea. |
| `taste/` | The interactive app for the Restaurant Taste Model project (a copy of `app/index.html` from the `taste-test` repo, with a button back to this site). |
| `wildlife-risk/` | The interactive risk map and the pipeline diagram for the Alberta wildlife crossing project. Both pages carry a noindex tag and are not in the sitemap. |
| `world.glb` | The town. Ring road and tram track, buildings facing a central park with a pond, a walled fountain, four labeled section signs, trees, streetlamps, ducks, townsfolk, a dock, and a small fleet of sailboats out on the sea. |
| `tram.glb` | The red streetcar. It rides the ring and eases to a stop at the shelter each lap. |
| `sky.glb` | Clouds and a bird flock that drift above the town. |
| `name.glb` | The 3D "WAEL HALABI" letters that float in the sky and turn to face the camera. |
| `statement.glb`, `contact.glb` | The red 3D sky text for the landing tagline and the Contact overview. |
| `favicon.svg`, `og.jpg` | The site icon (a little streetcar) and the social-share card. |
| `Wael_Halabi_Resume.pdf` | The résumé, opened in an in-page viewer or downloaded from the Résumé section. |
| `transit_world.blend` | The Blender source for everything above. Renders crash this file, so it was built and checked with viewport screenshots and the live preview. |
| `vendor/` | Local copies of three.js and the Draco decoder, so the site doesn't depend on any CDN for its 3D code. |

## How it works

You land in a slow auto-orbit with the name floating overhead. From here you can pop into an aerial view, which is a top-down transit-style route map where each section sign becomes a labeled station you can click to jump to.

The first scroll wakes the streetcar and hands you off to a damped, section-by-section tour. Each of the four signs (About, Projects, Experience, Résumé) is a stop. The camera eases to face the sign, its content panel fades in, and the panel scrolls on its own. You only move to the next stop once you've scrolled past the end of the current panel, so nothing jumps while you're reading. The final beat is a high overview of the whole island for Contact, with the name back in the sky. Scroll to the top and the orbit resumes.

Each sign has a floating "i" that opens its panel. On the Projects sign it opens the Shelter Row instead (see below).

Drive it with the wheel or trackpad, a touch drag on mobile, the arrow keys, Page Up and Page Down, or Space. The nav dots on the right jump straight to any section. A reduced-motion and mobile fallback tightens the damping and keeps the dots.

## The Shelter Row

The Projects "i" raises ten backlit poster cases out of the park lawn in an arc, one per project. The camera first shows the whole row from a low, frontal angle, then steps in on each poster. Click a poster or a title in the list, or use the arrow keys, the wheel, a sideways swipe, or Next and Previous. The posters you are not looking at blur so the chosen one is the focus. Escape goes back to the list, and a second Escape (or Close) leaves.

Each poster shows only the project's title, its year and a drawing of its data or idea, so people read the write-up on the caption card instead. The card holds the full text and links. On a phone the card is a short peek with a "Read the full write-up" button. "All projects" there goes back to the Projects sign with the list below it, and the posters sink until you pick one. The Projects stop also uses a slightly wider lens on narrow screens so the sign is not cut off. The page's own controls (section dots, day and night, mute, Simple version) step aside while the row is open.

While the row is open, the park trees along the arc, the falling leaves, and any building, lamp, streetcar or bird that crosses the camera's view are hidden, then restored exactly on close. The world's click toys (tree, fountain, bell, streetcar) are switched off so a click only ever means the poster.

The old text panel in `index.html` is still there as a fallback if the row has not loaded, and `simple.html` lists every project in plain HTML.

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

Then open http://localhost:8000. three.js, its loaders and the Draco decoder all load from `vendor/`, so the only outside request is the Montserrat webfont.

Links on the site are clean (`/simple`, `/taste/`, `/wildlife-risk/map`). GitHub Pages serves those from the `.html` files, but `py -m http.server` does not, so those links 404 locally. To test them, use a small server that tries `.html` when a path has no extension (the Python one below), or just open the `.html` filenames directly.

```python
# serve.py: python serve.py <folder>
import http.server, os, sys
root = sys.argv[1]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=root, **k)
    def translate_path(s, path):
        p = super().translate_path(path)
        return p + ".html" if not os.path.exists(p) and os.path.exists(p + ".html") else p
http.server.ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()
```

One caching note. The GLBs cache-bust with `?v=Date.now()`, but the scripts are pinned with version queries: `main.js` and `projects-data.js` in `index.html`, `shelter-row.js` in `main.js`, and `posters.js` in `shelter-row.js`. If you edit one, bump its number or hard-reload so the browser fetches the new file instead of a cached copy.

## Editing content and tuning the tour

The About, Experience and Résumé copy lives in `index.html` inside the `.panel` blocks, so you can rewrite it without touching the scene code. Projects live in `projects-data.js`: add or edit an entry there and the poster street picks it up, then mirror the text in the Projects blocks of `index.html` and `simple.html` (those are the fallback and the plain version). A poster's drawing is chosen by its `poster.viz` entry and implemented in `posters.js`. The camera stops are the `STOPS` array in `main.js`, each with a `pos` and a `look`, if you want to re-aim a beat. The Shelter Row's own camera poses are `overviewPose()` and `posterPose()` in `shelter-row.js`.

Fonts are Montserrat for headings and labels, and Proxima Nova for body with Montserrat as the fallback. Proxima Nova is a commercial Adobe font, so it needs your own Adobe Fonts kit to actually load. There's a commented placeholder for that kit in the head of both HTML files, and until you add it, everything renders in Montserrat.

## Built with

Plain three.js (r0.160) loaded from the local `vendor/` folder through an import map, GLTFLoader and DRACOLoader for the Draco-compressed GLBs, and WebAudio for the sound. No bundler, no framework. The geometry is all original work made in Blender, so nothing here needs attribution.

## Deploying

The live site at waelhalabi.com is deployed this way: the domain is bought separately and pointed at GitHub Pages, which serves the root of the `main` branch, and `CNAME` holds the domain. There is no build step, so a push is the deploy. Pages also serves `foo.html` at `/foo`, which is why the site's links have no `.html`.

It's a static site, so any static host works. Point the host at this folder and serve `index.html`. GitHub Pages, Netlify, Vercel as a static project, or Cloudflare Pages all handle it with no build command. three.js and the Draco decoder are bundled in `vendor/`, so the only thing the site fetches from outside is the Montserrat webfont, and that quietly falls back to a system font if it can't load.
