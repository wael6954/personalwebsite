import * as THREE from 'three'
import { drawPosters, blurCanvas, POSTER_W, POSTER_H } from './posters.js?v=4'

// ---------------------------------------------------------------------------
// The Shelter Row: ten backlit poster cases rise out of the park lawn in an arc,
// one per project. The camera first shows the whole row, then steps along it.
// While the row is open it owns wheel / keys / swipe; the caption card is plain
// DOM so it reads for screen readers. Nothing here exists until you open it.
// ---------------------------------------------------------------------------
const R = 12.4                          // arc radius, just outside the benches and trees
const CENTER_A = Math.PI * 1.25         // the Projects sign's side of the park
const SPACING = 2.95
const STEP_A = SPACING / R
const POSTER_PW = 2.4, POSTER_PH = POSTER_PW * POSTER_H / POSTER_W
const CASE_W = POSTER_PW + 0.2, CASE_H = POSTER_PH + 0.2, LEG = 0.42
const CY = LEG + CASE_H / 2             // poster centre height

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

export async function initShelterRow({ scene, camera, dom, projects, isMobile, reduceMotion, onLeave, getLeaves, getTram, getBirds }) {
  const n = projects.length
  const canvases = await drawPosters(projects)
  const textures = canvases.map((cv) => {
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  })
  // soft copies: laid over the posters you are not looking at, so the selected one is the focus
  const blurTextures = canvases.map((cv) => {
    const t = new THREE.CanvasTexture(blurCanvas(cv))
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })

  // ---- geometry ----
  const root = new THREE.Group()
  root.visible = false
  scene.add(root)
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c333b, roughness: 0.6, metalness: 0.4 })
  const backMat = new THREE.MeshStandardMaterial({ color: 0x3a424b, roughness: 0.8 })
  const cases = [], posterMeshes = [], blurMeshes = [], blurAmt = new Array(n).fill(0)
  const angleOf = (i) => CENTER_A + ((n - 1) / 2 - i) * STEP_A     // index grows to screen-right
  for (let i = 0; i < n; i++) {
    const a = angleOf(i)
    const g = new THREE.Group()
    g.position.set(Math.cos(a) * R, 0, Math.sin(a) * R)
    g.rotation.y = Math.PI / 2 - a                                   // +z faces outward
    const box = new THREE.Mesh(new THREE.BoxGeometry(CASE_W, CASE_H, 0.22), [metal, metal, metal, metal, backMat, metal])
    box.position.set(0, LEG + CASE_H / 2, 0)
    box.castShadow = true
    g.add(box)
    for (const sx of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, LEG, 0.16), metal)
      leg.position.set(sx, LEG / 2, 0); leg.castShadow = true; g.add(leg)
    }
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(POSTER_PW, POSTER_PH),
      new THREE.MeshBasicMaterial({ map: textures[i], toneMapped: false })
    )
    poster.position.set(0, CY, 0.115)
    poster.userData.index = i
    g.add(poster)
    posterMeshes.push(poster)
    const soft = new THREE.Mesh(
      new THREE.PlaneGeometry(POSTER_PW, POSTER_PH),
      new THREE.MeshBasicMaterial({ map: blurTextures[i], toneMapped: false, transparent: true, opacity: 0, depthWrite: false })
    )
    soft.position.set(0, CY, 0.12)
    soft.visible = false
    g.add(soft)
    blurMeshes.push(soft)
    cases.push(g); root.add(g)
  }

  // ---- state ----
  let active = false, engaged = false, idx = -1
  let expanded = false   // phone only: the caption card is a short peek until you ask for the full write-up
  let anim = 0, fresh = false
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3()
  const tPos = new THREE.Vector3(), tLook = new THREE.Vector3()
  const base = new THREE.Vector3()

  function vfovHalfTan() { return Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) }
  function overviewPose() {
    // low frontal view from outside the arc, looking in across the lawn: the row, the fountain and
    // the sky behind it. On wide screens the row is nudged right so the caption card doesn't cover it.
    // (Houses, the tram and birds on that side are hidden while the row is open; see occUpdate.)
    const a0 = CENTER_A, nx = Math.cos(a0), nz = Math.sin(a0)
    const arcW = 2 * R * Math.sin((n - 1) / 2 * STEP_A) + 4.5
    const wide = camera.aspect >= 1
    const fit = wide ? 1.02 : 1.0
    const D = THREE.MathUtils.clamp(arcW * fit / (2 * vfovHalfTan() * camera.aspect), 12, 60)
    const el = THREE.MathUtils.degToRad(wide ? 15 : 22)
    const tx = -nz, tz = nx
    const shift = wide ? 3.1 : 0
    const ly = 2.2
    tLook.set(nx * R + tx * shift, ly, nz * R + tz * shift)
    tPos.set(tLook.x + nx * D * Math.cos(el), 1.7 + D * Math.sin(el), tLook.z + nz * D * Math.cos(el))
  }
  function posterPose(i) {
    const a = angleOf(i), nx = Math.cos(a), nz = Math.sin(a), tx = -Math.sin(a), tz = Math.cos(a)
    const wide = camera.aspect >= 1
    const d = Math.max(4.7, (POSTER_PW * (wide ? 1.55 : 1.2)) / (2 * vfovHalfTan() * camera.aspect))
    const off = wide ? 0.6 : 0
    const lift = wide ? 0 : -0.17 * 2 * vfovHalfTan() * d   // poster centre sits above screen centre, clear of the caption card
    const px = nx * R + tx * off, pz = nz * R + tz * off
    tPos.set(px + nx * d, CY + 0.35 + lift, pz + nz * d)
    tLook.set(px, CY + lift, pz)
  }

  // ---- caption card ----
  const hud = document.createElement('div')
  hud.id = 'row-hud'
  hud.hidden = true
  hud.setAttribute('role', 'region')
  hud.setAttribute('aria-label', 'Projects')
  document.body.appendChild(hud)
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

  function render() {
    if (idx < 0) {
      hud.innerHTML = `
        <div class="rh-card" tabindex="-1">
          <h2>Projects</h2>
          <p class="rh-lede">Click a poster to read about it, or pick one from the list.</p>
          <ol class="rh-list">${projects.map((p, i) =>
            `<li><button type="button" data-go="${i}"><span class="rh-t">${esc(p.poster.short || p.title)}</span><span class="rh-y">${esc(p.year)}</span></button></li>`).join('')}</ol>
        </div>
        <button type="button" class="rh-leave" data-leave>Close ✕</button>`
    } else {
      const p = projects[idx]
      const phone = matchMedia('(max-width: 720px)').matches
      hud.innerHTML = `
        <div class="rh-card${phone && !expanded ? ' rh-collapsed' : ''}" tabindex="-1">
          <button type="button" class="rh-back" data-back>← All projects</button>
          <h2>${esc(p.title)}</h2>
          <p class="rh-meta">${esc(p.year)} · ${esc(p.area)} · ${p.tags.map(esc).join(', ')}</p>
          <div class="rh-body">${p.html}</div>
          <button type="button" class="rh-more" data-more>${expanded ? 'Show less' : 'Read the full write-up ↓'}</button>
          ${(p.links || []).length ? `<p class="rh-links">${p.links.map((l) => `<a href="${l.href}"${l.ext ? ' target="_blank" rel="noopener"' : ''}>${esc(l.label)} ↗</a>`).join('')}</p>` : ''}
          <div class="rh-step">
            <button type="button" data-prev ${idx === 0 ? 'disabled' : ''}>← Previous</button>
            <span>${idx + 1} of ${n}</span>
            <button type="button" data-next ${idx === n - 1 ? 'disabled' : ''}>Next →</button>
          </div>
        </div>
        <button type="button" class="rh-leave" data-leave>Close ✕</button>`
    }
    hud.hidden = !active
  }
  hud.addEventListener('click', (e) => {
    const t = e.target.closest('button')
    if (!t) return
    if (t.dataset.go != null) go(+t.dataset.go)
    else if (t.hasAttribute('data-back')) go(-1)
    else if (t.hasAttribute('data-more')) { expanded = !expanded; render() }
    else if (t.hasAttribute('data-prev')) go(idx - 1)
    else if (t.hasAttribute('data-next')) go(idx + 1)
    else if (t.hasAttribute('data-leave')) leave()
  })

  function go(i) {
    if (i !== idx) expanded = false
    idx = Math.max(-1, Math.min(n - 1, i))
    render()
    const card = hud.querySelector('.rh-card'); if (card) card.scrollTop = 0
  }
  // trees and falling leaves must not sit in front of / inside the cases: hide the park trees
  // along the arc (and the leaf particles) while the row is open, restore on leave
  let hidden = []
  const hideClutter = () => {
    if (hidden.length) return
    const lim = (n - 1) / 2 * STEP_A + 0.3, _b = new THREE.Box3()
    scene.traverse((o) => {
      if (!o.isMesh || !/^Tree_[tl]_/.test(o.name) || !o.visible) return
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      _b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)
      const cx = (_b.min.x + _b.max.x) / 2, cz = (_b.min.z + _b.max.z) / 2
      if (Math.hypot(cx, cz) > 22) return
      let d = Math.atan2(cz, cx) - CENTER_A
      d = Math.atan2(Math.sin(d), Math.cos(d))
      if (Math.abs(d) < lim) { o.visible = false; hidden.push(o) }
    })
    const lp = getLeaves && getLeaves()
    if (lp && lp.visible) { lp.visible = false; hidden.push(lp) }
  }
  const showClutter = () => { hidden.forEach((o) => { o.visible = true }); hidden = []; occRestore() }

  // ---- occluders: anything between the camera and the posters (or around the camera) vanishes ----
  // Static world pieces (houses, church, lamps, signs, trees, sky props) get a world box once; a piece is
  // hidden while a thin capsule (segment camera -> poster centre, margin OCC_M) crosses its box, or the
  // camera is inside / within OCC_NEAR of it. The tram and birds are re-tested every frame.
  // Only .visible is toggled; everything we hid is tracked in occHid and restored exactly.
  const OCC_M = 1.2, OCC_NEAR = 2, BIRD_NEAR = 4
  let occStatic = null                       // [{ name, objs, box, mtn }]
  const occHid = new Set()                   // objects currently hidden by us
  const occTargets = []                      // poster centres framed right now (Vector3s)
  const _ob = new THREE.Box3(), _op = new THREE.Vector3(), _oq = new THREE.Vector3()
  const occKey = (nm) => {
    let m = nm.match(/^(TH\d+|APT\d+|CH0|Board_(?!Projects)[A-Za-z]+)(?![A-Za-z])/); if (m) return m[1]
    if (/^Board_Projects/.test(nm)) return null
    m = nm.match(/^Tree_[tl]_(\d+)/); if (m) return 'Tree_' + m[1]
    if (/^(Lamp|Lamph|Cloud)/.test(nm)) return nm
    if (/^(MtnBig|Mtn)/.test(nm)) return 'M:' + nm
    return null
  }
  function occBuild() {
    if (occStatic) return
    scene.updateMatrixWorld(true)
    const map = new Map()
    scene.traverse((o) => {
      if (!o.isMesh || root.getObjectById(o.id)) return
      const k = occKey(o.name); if (!k) return
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      _ob.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)
      let e = map.get(k)
      if (!e) { e = { name: k, objs: [], box: new THREE.Box3(), mtn: k.startsWith('M:') }; map.set(k, e) }
      e.objs.push(o); e.box.union(_ob)
    })
    occStatic = [...map.values()]
  }
  function segHitsBox(a, b, box, m) {
    let t0 = 0, t1 = 1
    for (const ax of ['x', 'y', 'z']) {
      const lo = box.min[ax] - m, hi = box.max[ax] + m, d = b[ax] - a[ax]
      if (Math.abs(d) < 1e-9) { if (a[ax] < lo || a[ax] > hi) return false; continue }
      let u = (lo - a[ax]) / d, v = (hi - a[ax]) / d
      if (u > v) { const t = u; u = v; v = t }
      if (u > t0) t0 = u
      if (v < t1) t1 = v
      if (t0 > t1) return false
    }
    return true
  }
  function posterCentre(i, out) {
    const a = angleOf(i)
    return out.set(Math.cos(a) * R, CY, Math.sin(a) * R)
  }
  function occSetTargets(i, look) {
    occTargets.length = 0
    if (i < 0) { for (let j = 0; j < n; j++) occTargets.push(posterCentre(j, new THREE.Vector3())) }
    else for (let j = Math.max(0, i - 1); j <= Math.min(n - 1, i + 1); j++) occTargets.push(posterCentre(j, new THREE.Vector3()))
    if (look) occTargets.push(look.clone())
  }
  const hitsCorridor = (pos, box, m) => {
    if (_ob.copy(box).expandByScalar(OCC_NEAR).containsPoint(pos)) return true
    for (let j = 0; j < occTargets.length; j++) if (segHitsBox(pos, occTargets[j], box, m)) return true
    return false
  }
  function occHide(o) { if (o.visible) { o.visible = false; occHid.add(o) } }
  function occShow(o) { if (occHid.delete(o)) o.visible = true }
  function occRestore() { occHid.forEach((o) => { o.visible = true }); occHid.clear() }
  // which static pieces the corridor from `pos` hides (pure: used by the update and the debug hook)
  function occStaticHits(pos, out) {
    occBuild()
    for (const e of occStatic) {
      let hit
      if (e.mtn) {   // a cone: inside only if within the shrinking radius at the camera's height
        const bx = e.box, h = bx.max.y - bx.min.y, f = 1 - (pos.y - bx.min.y) / (h || 1)
        const rr = Math.min(bx.max.x - bx.min.x, bx.max.z - bx.min.z) / 2 * f
        hit = bx.containsPoint(pos) && Math.hypot(pos.x - (bx.min.x + bx.max.x) / 2, pos.z - (bx.min.z + bx.max.z) / 2) < rr
      } else hit = hitsCorridor(pos, e.box, OCC_M)
      if (hit) out.push(e)
    }
    return out
  }
  function occApplyStatic(pos) {
    const hits = occStaticHits(pos, []), set = new Set()
    for (const e of hits) for (const o of e.objs) { set.add(o); occHide(o) }
    // anything we hid for the old pose but not the new one comes back (tram/birds are managed per frame)
    occHid.forEach((o) => { if (!set.has(o) && o.userData && o.userData._occStatic) occShow(o) })
    for (const o of set) o.userData._occStatic = true
  }
  function occMoving(pos) {
    const tram = getTram && getTram()
    if (tram) {
      _ob.setFromObject(tram)
      const hit = !_ob.isEmpty() && (hitsCorridor(pos, _ob, OCC_M) || hitsCorridor(camera.position, _ob, OCC_M))
      if (hit) { if (tram.visible) { tram.visible = false; occHid.add(tram) } } else occShow(tram)
    }
    const birds = getBirds && getBirds()
    if (birds) for (let i = 0; i < birds.length; i++) {
      const b = birds[i]
      b.getWorldPosition(_op)
      let hit = _op.distanceToSquared(pos) < BIRD_NEAR * BIRD_NEAR || _op.distanceToSquared(camera.position) < BIRD_NEAR * BIRD_NEAR
      if (!hit) for (let j = 0; j < occTargets.length && !hit; j++) {
        if (_op.distanceToSquared(occTargets[j]) < 3.5 * 3.5) hit = true
        else { _ob.min.copy(_op).subScalar(1); _ob.max.copy(_op).addScalar(1); if (segHitsBox(pos, occTargets[j], _ob, OCC_M)) hit = true }
      }
      if (hit) occHide(b); else occShow(b)
    }
  }
  let occIdx = -2, occLast = new THREE.Vector3(1e9, 0, 0)
  function occUpdate() {
    if (idx !== occIdx || occLast.distanceToSquared(tPos) > 0.0025) {
      occIdx = idx; occLast.copy(tPos)
      occSetTargets(idx, tLook)
      occApplyStatic(tPos)
    }
    occMoving(tPos)
  }
  // test hook: what would be hidden for a camera at `pos` framing poster `i` (-1 = overview)? No side effects.
  function debugOccluders(pos, i = -1, look) {
    const keep = occTargets.slice(); occSetTargets(i, look)
    const names = occStaticHits(pos, []).map((e) => e.name)
    occTargets.length = 0; keep.forEach((t) => occTargets.push(t))
    return names
  }
  function enter() {
    if (active) return
    hideClutter()
    occIdx = -2; occLast.set(1e9, 0, 0)
    active = true; engaged = true
    document.body.classList.add('row-open')
    camPos.copy(camera.position); fresh = true
    go(camera.aspect >= 1.1 ? -1 : 0)
    hud.hidden = false
  }
  function leave() {
    if (!active) return
    active = false
    document.body.classList.remove('row-open')
    showClutter()
    hud.hidden = true
    onLeave && onLeave()
  }

  // ---- input ----
  let wheelAcc = 0, wheelLock = 0
  function handleWheel(dy) {
    if (performance.now() < wheelLock) return
    wheelAcc += dy
    if (Math.abs(wheelAcc) > 70) {
      go(idx + (wheelAcc > 0 ? 1 : -1)); wheelAcc = 0; wheelLock = performance.now() + 520
    }
  }
  function handleKey(e) {
    if (e.key === 'Escape') { idx >= 0 ? go(-1) : leave(); return true }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { if (e.target.closest && e.target.closest('button,a')) return false; go(idx + 1); return true }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { go(idx - 1); return true }
    return false
  }
  function handleSwipe(dx) { go(idx + (dx < 0 ? 1 : -1)) }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  function pick(ev) {
    const r = dom.getBoundingClientRect()
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(posterMeshes, false)[0]
    return hit ? hit.object.userData.index : -1
  }
  dom.addEventListener('click', (ev) => { if (!active) return; const i = pick(ev); if (i >= 0) go(i) })
  dom.addEventListener('pointermove', (ev) => { if (active) dom.style.cursor = pick(ev) >= 0 ? 'pointer' : '' })

  // ---- per-frame: rise the cases, then own the camera while engaged ----
  const _l = new THREE.Vector3()
  function update(dt, look) {
    const target = active ? 1 : 0
    anim += (target - anim) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 2.6))
    if (Math.abs(target - anim) < 0.002) anim = target
    root.visible = anim > 0.001
    // blur every poster except the one in focus (the overview keeps all of them sharp)
    for (let i = 0; i < n; i++) {
      const want = active && idx >= 0 && i !== idx ? 1 : 0
      blurAmt[i] += (want - blurAmt[i]) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 7))
      if (Math.abs(want - blurAmt[i]) < 0.01) blurAmt[i] = want
      blurMeshes[i].material.opacity = blurAmt[i]
      blurMeshes[i].visible = blurAmt[i] > 0.01
    }
    if (root.visible) {
      for (let i = 0; i < n; i++) {
        const k = easeOut(clamp01(anim * 1.9 - Math.abs(i - (n - 1) / 2) * 0.09))
        cases[i].position.y = -(1 - k) * (CASE_H + LEG + 0.8)
      }
    }
    if (!engaged) return
    base.copy(camera.position)           // the beat pose applyCamera just set
    _l.copy(look)
    if (fresh) { camLook.copy(look); fresh = false }
    if (active) { idx < 0 ? overviewPose() : posterPose(idx) } else { tPos.copy(base); tLook.copy(_l) }
    if (active) occUpdate()
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * (active ? 3.1 : 3.6))
    camPos.lerp(tPos, k)
    camLook.lerp(tLook, k)
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    if (!active && camPos.distanceTo(base) < 0.05 && anim === 0) engaged = false
  }

  return {
    get active() { return active }, get engaged() { return engaged },
    enter, leave, handleWheel, handleKey, handleSwipe, update, debugOccluders,
    get occludedCount() { return occHid.size },
  }
}
