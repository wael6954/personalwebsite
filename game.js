/* RIGHT OF WAY — a 3-lane top-down endless runner down a streetcar line.
 *
 * Self-contained on purpose: no imports, no external image/audio/font URLs, so
 * this same module drops into a standalone HTML page as easily as it does into
 * index.html. Art is hand-drawn into the canvas; sound is synthesised on the
 * fly with the Web Audio API.
 *
 * Nothing outside the canvas updates per frame: the loop owns its own rAF and
 * draws the live HUD (score, speed) itself. The DOM overlays below only change
 * on a state transition — start, death, pause, mute — so the host page never
 * re-renders while the game is running.
 */

// --- Virtual design space -----------------------------------------------
// Everything is authored against a fixed 480x800 stage and scaled to fit, so
// lane geometry and hitboxes behave identically on a phone and a 4K monitor.
const VW = 480, VH = 800
const LANE_W = 104
const LANE_X = [VW / 2 - LANE_W, VW / 2, VW / 2 + LANE_W]
const ROAD_L = VW / 2 - LANE_W * 1.5
const ROAD_R = VW / 2 + LANE_W * 1.5
// The streetcar rides at PLAYER_Y_HOME and the throttle slides it up or down
// the screen: forward for speed and less warning, back for a calmer read of
// the traffic ahead. Throttle runs -1..1 and scales the world speed with it.
const PLAYER_Y_HOME = VH - 200
const PLAYER_Y_SWING = 110
const THROTTLE_GAIN = 0.3

const C = {
  emerald:     '#14876c',
  emeraldDark: '#0d5c4a',
  ruby:        '#d63456',
  rubyDark:    '#a3223e',
  sapphire:    '#2e4370',
  sapphireDark:'#1b2a4a',
  amber:       '#e8b339',
  amberDeep:   '#b9861f',
  cream:       '#f2ead6',
  asphalt:     '#232b40',
  asphaltLit:  '#2b3450',
  rail:        '#7d8cb0',
  ink:         '#0e1424',
  walk:        '#39456b',
  walkLit:     '#465480'
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]

// rounded rect, written out rather than relying on ctx.roundRect for reach
function rr(g, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  g.beginPath()
  g.moveTo(x + r, y)
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r)
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r)
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y)
  g.closePath()
}
function fillRR(g, x, y, w, h, r, col) { rr(g, x, y, w, h, r); g.fillStyle = col; g.fill() }

// ---------------------------------------------------------------------------
// AUDIO — everything procedural. A browser will not let us make noise before a
// gesture, so the context is created lazily on the first key press or tap.
// ---------------------------------------------------------------------------
function makeAudio(startMuted) {
  let ctx = null, master = null, noiseBuf = null
  let hum = null                 // { oscA, oscB, gain, filter } while a run is live
  let muted = startMuted

  function ensure() {
    if (ctx) return ctx
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(ctx.destination)
    const n = ctx.sampleRate * 0.9
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    return ctx
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume() }

  // one-shot tone with an exponential tail
  function tone(type, freq, when, dur, vol, glideTo) {
    if (!ctx || muted) return
    const t0 = ctx.currentTime + when
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t0)
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(master)
    o.start(t0); o.stop(t0 + dur + 0.05)
  }
  function noise(when, dur, vol, f0, f1, q) {
    if (!ctx || muted) return
    const t0 = ctx.currentTime + when
    const s = ctx.createBufferSource(); s.buffer = noiseBuf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.Q.value = q || 1
    bp.frequency.setValueAtTime(f0, t0)
    bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(bp); bp.connect(g); g.connect(master)
    s.start(t0); s.stop(t0 + dur + 0.05)
  }

  return {
    unlock() { ensure(); resume() },
    get muted() { return muted },
    setMuted(m) {
      muted = m
      if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02)
    },
    // low engine rumble, pitched by how fast the run has got
    startHum() {
      if (!ensure() || hum) return
      const g = ctx.createGain(), f = ctx.createBiquadFilter()
      f.type = 'lowpass'; f.frequency.value = 420
      g.gain.value = 0.0001
      g.gain.setTargetAtTime(0.085, ctx.currentTime, 0.4)
      const a = ctx.createOscillator(), b = ctx.createOscillator()
      a.type = 'sawtooth'; a.frequency.value = 52
      b.type = 'sine';     b.frequency.value = 79
      a.connect(f); b.connect(f); f.connect(g); g.connect(master)
      a.start(); b.start()
      hum = { a, b, g, f }
    },
    setHumSpeed(k) {                     // k: 0 at the start, 1 at top speed
      if (!hum || !ctx) return
      const t = ctx.currentTime
      hum.a.frequency.setTargetAtTime(52 + k * 34, t, 0.25)
      hum.b.frequency.setTargetAtTime(79 + k * 50, t, 0.25)
      hum.f.frequency.setTargetAtTime(420 + k * 900, t, 0.3)
    },
    stopHum() {
      if (!hum || !ctx) return
      const h = hum; hum = null
      h.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12)
      setTimeout(() => { try { h.a.stop(); h.b.stop() } catch (e) {} }, 500)
    },
    token() { ensure(); tone('triangle', 988, 0, 0.11, 0.16); tone('triangle', 1480, 0.07, 0.16, 0.13) },
    lane()  { ensure(); tone('sine', 440, 0, 0.055, 0.1, 620); noise(0, 0.05, 0.03, 900, 2400, 2) },
    nearMiss() { ensure(); noise(0, 0.28, 0.07, 260, 1900, 0.8) },
    crash() {
      ensure()
      noise(0, 0.55, 0.28, 1600, 90, 0.6)
      tone('square', 150, 0, 0.5, 0.2, 42)
      tone('sawtooth', 90, 0.04, 0.7, 0.14, 30)
    },
    over() { ensure(); tone('triangle', 520, 0, 0.22, 0.1, 392); tone('triangle', 392, 0.18, 0.4, 0.09, 262) },
    close() { try { if (ctx) ctx.close() } catch (e) {} ctx = null; hum = null }
  }
}

// ---------------------------------------------------------------------------
// ART — every sprite is drawn from scratch, top-down, centred on the origin
// with its nose pointing up (-y). Silhouettes are deliberately chunky: at full
// speed you read the shape, not the detail.
// ---------------------------------------------------------------------------
const FONT = "'Montserrat', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

function shadow(g, w, h, r, dx, dy) {
  g.fillStyle = 'rgba(0,0,0,.38)'
  rr(g, -w / 2 + (dx || 0), -h / 2 + (dy || 7), w, h, r)
  g.fill()
}

// dark bogies poking out from under a vehicle, with spokes that visibly turn
function wheels(g, w, h, spin, inset) {
  const ww = 9, wh = 22, x = w / 2 - (inset || 2)
  const ys = [-h / 2 + h * 0.2, h / 2 - h * 0.2]
  for (const y of ys) {
    for (const sx of [-1, 1]) {
      const wx = sx * x - (sx < 0 ? ww : 0)
      fillRR(g, wx, y - wh / 2, ww, wh, 3, '#161d2b')
      // spoke tick: a bright dash marching along the wheel as it rolls
      const p = ((spin * 0.5) % 1 + 1) % 1
      g.fillStyle = 'rgba(242,234,214,.55)'
      g.fillRect(wx + 2, y - wh / 2 + p * (wh - 4), ww - 4, 3)
    }
  }
}

function drawStreetcar(g, o) {
  const w = o.w, h = o.h, hw = w / 2, hh = h / 2
  const body = o.body || C.emerald, dark = o.dark || C.emeraldDark
  shadow(g, w, h, 16, 0, 8)
  wheels(g, w, h, o.spin || 0, 1)

  fillRR(g, -hw, -hh, w, h, 15, body)
  fillRR(g, -hw + 6, -hh + 14, w - 12, h - 28, 10, dark)      // roof deck

  g.fillStyle = 'rgba(0,0,0,.18)'                             // roof ribs
  for (let i = 1; i < 6; i++) g.fillRect(-hw + 10, -hh + 14 + i * (h - 28) / 6, w - 20, 2.5)

  g.fillStyle = C.cream                                       // waist stripes
  g.fillRect(-hw + 3, -hh + 16, 3, h - 32)
  g.fillRect(hw - 6, -hh + 16, 3, h - 32)

  g.fillStyle = C.sapphireDark                                // side windows
  for (let i = 0; i < 4; i++) {
    const seg = (h - 74) / 4
    const y = -hh + 34 + i * seg
    rr(g, -hw + 7, y, 5, seg - 8, 2); g.fill()
    rr(g, hw - 12, y, 5, seg - 8, 2); g.fill()
  }

  fillRR(g, -hw + 10, -hh + 5, w - 20, 13, 6, C.sapphireDark) // cab glass, front
  fillRR(g, -hw + 10, hh - 18, w - 20, 11, 5, C.sapphireDark) // and back

  fillRR(g, -13, -6, 26, 26, 5, '#2b3648')                    // pantograph housing
  g.strokeStyle = '#8ea0bd'; g.lineWidth = 2.5
  g.beginPath(); g.moveTo(-9, 2); g.lineTo(0, -16); g.lineTo(9, 2); g.stroke()

  // ruby door bands: the route accent, and they break up a long green box
  g.fillStyle = o.stalled ? C.amberDeep : C.ruby
  g.fillRect(-hw + 1, -hh + h * 0.42, 5, 22)
  g.fillRect(hw - 6, -hh + h * 0.42, 5, 22)

  // destination blind: lit dot-matrix bars rather than lettering, so the
  // sprite carries no text at any zoom level
  fillRR(g, -21, -hh + 21, 42, 12, 3, C.ink)
  const bars = o.stalled ? [6] : [8, 5, 11, 4]
  let bx = -18
  for (const bwid of bars) {
    g.fillStyle = o.stalled ? 'rgba(232,179,57,.35)' : C.amber
    g.fillRect(bx, -hh + 25, bwid, 4)
    bx += bwid + 3
  }

  if (!o.stalled) {
    fillRR(g, -hw + 8, -hh + 1, 10, 5, 2, C.cream)            // headlights
    fillRR(g, hw - 18, -hh + 1, 10, 5, 2, C.cream)
    const grd = g.createLinearGradient(0, -hh, 0, -hh - 92)   // wash on the road ahead
    grd.addColorStop(0, 'rgba(232,179,57,.28)')
    grd.addColorStop(1, 'rgba(232,179,57,0)')
    g.fillStyle = grd
    g.beginPath(); g.moveTo(-hw + 6, -hh); g.lineTo(hw - 6, -hh)
    g.lineTo(hw + 26, -hh - 92); g.lineTo(-hw - 26, -hh - 92); g.closePath(); g.fill()
  } else {
    // a dead streetcar runs its four-ways instead of its headlights
    const on = (((o.spin || 0) * 2) | 0) % 2 === 0
    const col = on ? C.amber : 'rgba(232,179,57,.25)'
    fillRR(g, -hw + 6, -hh + 2, 9, 6, 2, col)
    fillRR(g, hw - 15, -hh + 2, 9, 6, 2, col)
    fillRR(g, -hw + 6, hh - 8, 9, 6, 2, col)
    fillRR(g, hw - 15, hh - 8, 9, 6, 2, col)
  }
  fillRR(g, -hw + 8, hh - 5, 10, 4, 2, C.rubyDark)            // tail lights
  fillRR(g, hw - 18, hh - 5, 10, 4, 2, C.rubyDark)
}

function drawCar(g, o) {
  const w = o.w, h = o.h, hw = w / 2, hh = h / 2
  shadow(g, w - 4, h - 4, 12, 0, 6)
  wheels(g, w, h, o.spin || 0, 0)
  fillRR(g, -hw, -hh, w, h, 13, o.body)
  fillRR(g, -hw + 6, -hh + h * 0.22, w - 12, h * 0.52, 9, o.dark)          // cabin
  fillRR(g, -hw + 9, -hh + h * 0.24, w - 18, h * 0.14, 4, C.sapphireDark)  // windshield
  fillRR(g, -hw + 9, -hh + h * 0.60, w - 18, h * 0.12, 4, C.sapphireDark)  // rear glass
  g.fillStyle = 'rgba(255,255,255,.10)'                                    // roof highlight
  g.fillRect(-hw + 12, -hh + h * 0.40, w - 24, h * 0.16)
  g.fillStyle = o.dark                                                     // mirrors
  g.fillRect(-hw - 3, -hh + h * 0.26, 4, 7)
  g.fillRect(hw - 1, -hh + h * 0.26, 4, 7)
  fillRR(g, -hw + 7, -hh + 2, 11, 5, 2, C.cream)
  fillRR(g, hw - 18, -hh + 2, 11, 5, 2, C.cream)
  const tl = o.braking ? '#ff5a72' : C.rubyDark
  fillRR(g, -hw + 7, hh - 7, 11, 5, 2, tl)
  fillRR(g, hw - 18, hh - 7, 11, 5, 2, tl)
}

function drawSUV(g, o) {
  const w = o.w, h = o.h, hw = w / 2, hh = h / 2
  shadow(g, w - 2, h - 2, 11, 0, 7)
  wheels(g, w, h, o.spin || 0, 0)
  fillRR(g, -hw, -hh, w, h, 9, o.body)                                     // boxier
  fillRR(g, -hw + 5, -hh + h * 0.18, w - 10, h * 0.60, 7, o.dark)
  fillRR(g, -hw + 8, -hh + h * 0.20, w - 16, h * 0.13, 3, C.sapphireDark)
  fillRR(g, -hw + 8, -hh + h * 0.64, w - 16, h * 0.12, 3, C.sapphireDark)
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3                       // roof rails
  g.beginPath()
  g.moveTo(-hw + 11, -hh + h * 0.36); g.lineTo(-hw + 11, -hh + h * 0.62)
  g.moveTo(hw - 11, -hh + h * 0.36); g.lineTo(hw - 11, -hh + h * 0.62)
  g.stroke()
  fillRR(g, -hw + 6, -hh + 2, 13, 6, 2, C.cream)
  fillRR(g, hw - 19, -hh + 2, 13, 6, 2, C.cream)
  fillRR(g, -hw + 6, hh - 8, 13, 6, 2, C.rubyDark)
  fillRR(g, hw - 19, hh - 8, 13, 6, 2, C.rubyDark)
}

// three cones staggered across the lane — reads as a work zone, not a box
function drawCones(g, o) {
  const spots = [[-24, -22], [4, 0], [-8, 24]]
  for (let i = 0; i < spots.length; i++) {
    const bob = Math.sin((o.phase || 0) * 3 + i) * 1.2
    g.save(); g.translate(spots[i][0], spots[i][1] + bob)
    g.fillStyle = 'rgba(0,0,0,.35)'
    g.beginPath(); g.ellipse(2, 6, 15, 8, 0, 0, 7); g.fill()
    fillRR(g, -15, -4, 30, 12, 3, '#c25320')                  // base
    g.fillStyle = '#e8642a'                                   // cone, from above
    g.beginPath(); g.ellipse(0, 0, 13, 11, 0, 0, 7); g.fill()
    g.fillStyle = C.cream
    g.beginPath(); g.ellipse(0, 0, 8.5, 7, 0, 0, 7); g.fill()
    g.fillStyle = '#f0762f'
    g.beginPath(); g.ellipse(0, 0, 5, 4, 0, 0, 7); g.fill()
    g.restore()
  }
}

function drawBarrier(g, o) {
  const w = o.w, h = o.h, hw = w / 2
  shadow(g, w, h, 5, 0, 6)
  fillRR(g, -hw, -h / 2, w, h, 4, '#d8d2c2')
  g.save(); rr(g, -hw, -h / 2, w, h, 4); g.clip()             // hazard stripes
  g.fillStyle = '#e8642a'
  for (let x = -hw - h; x < hw + h; x += 22) {
    g.beginPath()
    g.moveTo(x, -h / 2); g.lineTo(x + 11, -h / 2)
    g.lineTo(x + 11 + h, h / 2); g.lineTo(x + h, h / 2)
    g.closePath(); g.fill()
  }
  g.restore()
  g.fillStyle = '#4a5468'                                     // legs
  g.fillRect(-hw + 6, h / 2 - 2, 9, 9)
  g.fillRect(hw - 15, h / 2 - 2, 9, 9)
  const on = Math.sin((o.phase || 0) * 7) > 0                 // blinking lamp
  g.fillStyle = on ? C.amber : '#7a6a3a'
  g.beginPath(); g.arc(0, -h / 2 - 3, 5, 0, 7); g.fill()
  if (on) {
    g.fillStyle = 'rgba(232,179,57,.22)'
    g.beginPath(); g.arc(0, -h / 2 - 3, 13, 0, 7); g.fill()
  }
}

// jaywalker: shoulders rock and arms swing, so the shape flickers as it drifts
function drawPed(g, o) {
  const p = o.phase || 0
  const swing = Math.sin(p * 9)
  g.save(); g.rotate(swing * 0.10)
  g.fillStyle = 'rgba(0,0,0,.35)'
  g.beginPath(); g.ellipse(2, 8, 17, 10, 0, 0, 7); g.fill()
  fillRR(g, -9, 4 + swing * 4, 8, 15, 3, o.dark)              // legs
  fillRR(g, 1, 4 - swing * 4, 8, 15, 3, o.dark)
  fillRR(g, -15, -6 - swing * 3, 7, 16, 3, o.body)            // arms
  fillRR(g, 8, -6 + swing * 3, 7, 16, 3, o.body)
  fillRR(g, -13, -11, 26, 24, 8, o.body)                      // torso from above
  g.fillStyle = C.cream
  g.fillRect(-7, -11, 14, 3)                                  // collar
  g.fillStyle = o.skin
  g.beginPath(); g.arc(0, -6, 9, 0, 7); g.fill()              // head
  g.fillStyle = o.hair
  g.beginPath(); g.arc(0, -7.5, 9, Math.PI * 0.08, Math.PI * 0.92, true); g.fill()
  g.restore()
}

function drawCyclist(g, o) {
  const p = o.phase || 0
  g.save(); g.rotate(Math.sin(p * 5) * 0.09)                  // weaves in the lane
  g.fillStyle = 'rgba(0,0,0,.35)'
  g.beginPath(); g.ellipse(2, 8, 13, 26, 0, 0, 7); g.fill()
  g.strokeStyle = '#1b2230'; g.lineWidth = 5                  // wheels, edge-on
  g.beginPath(); g.moveTo(0, -30); g.lineTo(0, -16); g.moveTo(0, 14); g.lineTo(0, 30); g.stroke()
  g.strokeStyle = C.ruby; g.lineWidth = 4                     // frame
  g.beginPath(); g.moveTo(0, -20); g.lineTo(0, 22); g.stroke()
  g.strokeStyle = '#2b3648'; g.lineWidth = 4                  // handlebars
  g.beginPath(); g.moveTo(-13, -17); g.lineTo(13, -17); g.stroke()
  const swing = Math.sin(p * 11) * 3
  fillRR(g, -13, -4 + swing, 8, 17, 3, C.sapphire)            // pedalling legs
  fillRR(g, 5, -4 - swing, 8, 17, 3, C.sapphire)
  fillRR(g, -11, -14, 22, 24, 8, o.body)                      // back
  g.fillStyle = C.amber
  g.fillRect(-11, -4, 22, 4)                                  // hi-vis flash
  g.fillStyle = '#e2c8a8'
  g.beginPath(); g.arc(0, -13, 8, 0, 7); g.fill()
  fillRR(g, -9, -22, 18, 12, 6, C.cream)                      // helmet
  g.fillStyle = 'rgba(0,0,0,.25)'
  g.fillRect(-9, -18, 18, 2.5)
  g.fillStyle = C.rubyDark
  g.beginPath(); g.arc(0, 26, 3.5, 0, 7); g.fill()            // rear light
  g.restore()
}

// open manhole: the road surface is simply gone
function drawPothole(g, o) {
  const w = o.w, h = o.h
  g.fillStyle = '#39415c'                                     // broken asphalt lip
  g.beginPath(); g.ellipse(0, 0, w / 2 + 5, h / 2 + 4, 0, 0, 7); g.fill()
  g.fillStyle = '#05070c'
  g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, 7); g.fill()
  g.fillStyle = 'rgba(232,179,57,.10)'
  g.beginPath(); g.ellipse(0, -h * 0.22, w / 2 - 6, h / 2 - 8, 0, Math.PI, 0); g.fill()
  g.save(); g.translate(w / 2 + 6, h / 2 - 2)                 // the cover, shoved aside
  g.fillStyle = '#4b5570'
  g.beginPath(); g.ellipse(0, 0, 17, 12, 0.3, 0, 7); g.fill()
  g.strokeStyle = '#39415c'; g.lineWidth = 2
  for (let i = -2; i <= 2; i++) {
    g.beginPath(); g.moveTo(-12, i * 4.2); g.lineTo(12, i * 4.2); g.stroke()
  }
  g.restore()
}

// Fare token: brass, stamped with a streetcar, spinning (faked by squashing x)
function drawToken(g, t) {
  const sq = Math.abs(Math.cos(t * 2.6))
  g.save()
  g.fillStyle = 'rgba(0,0,0,.28)'
  g.beginPath(); g.ellipse(2, 9, 13 * Math.max(sq, 0.25), 9, 0, 0, 7); g.fill()
  g.scale(Math.max(sq, 0.16), 1)
  g.fillStyle = C.amberDeep
  g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill()
  g.fillStyle = C.amber
  g.beginPath(); g.arc(0, -1.5, 14, 0, 7); g.fill()
  g.fillStyle = C.amberDeep
  g.beginPath(); g.arc(0, -1.5, 9.5, 0, 7); g.fill()
  g.fillStyle = C.amber
  g.beginPath(); g.arc(0, -1.5, 7.5, 0, 7); g.fill()
  if (sq > 0.55) {                                            // stamp, only face-on
    g.fillStyle = C.amberDeep                                 // a little streetcar in relief
    rr(g, -4.5, -5.5, 9, 9, 2); g.fill()
    g.fillStyle = C.amber
    g.fillRect(-3, -4, 6, 2.5)
    g.fillStyle = C.amberDeep
    g.fillRect(-3.5, 2.5, 7, 1.4)
  }
  g.restore()
}

// ---------------------------------------------------------------------------
// OBSTACLE CATALOGUE
// `rel` is how fast the thing is itself travelling as a fraction of the world
// speed: a parked car closes at full speed, a cyclist much more gently.
// `telegraph` obstacles spawn further off-screen and flash a warning in their
// lane before they arrive, so a lane-blocker never simply appears on top of you.
// ---------------------------------------------------------------------------
const PAINT = [
  { body: C.ruby,     dark: C.rubyDark },
  { body: '#3f6fa8',  dark: '#27466b' },
  { body: C.cream,    dark: '#c2b795' },
  { body: '#6a5fa8',  dark: '#463b7a' },
  { body: '#4a5468',  dark: '#323a4a' },
  { body: '#c9702f',  dark: '#8f4d1d' }
]
const SKIN = ['#e8c39e', '#c68b62', '#8d5a3b', '#f0d3b4']
const HAIR = ['#2b2118', '#4a3524', '#6b4a2f', '#1a1a1f']

const KINDS = {
  parkedCar: { w: 58, h: 104, rel: 0,    hit: 0.40, draw: drawCar,        label: 'a parked car' },
  movingCar: { w: 58, h: 104, rel: 0.48, hit: 0.40, draw: drawCar,        label: 'oncoming traffic' },
  suv:       { w: 72, h: 126, rel: 0.24, hit: 0.40, draw: drawSUV,        label: 'an SUV' },
  cones:     { w: 78, h: 78,  rel: 0,    hit: 0.34, draw: drawCones,      label: 'a work zone' },
  barrier:   { w: 94, h: 26,  rel: 0,    hit: 0.46, draw: drawBarrier,    label: 'a barrier', telegraph: true },
  ped:       { w: 42, h: 48,  rel: 0.14, hit: 0.38, draw: drawPed,        label: 'a jaywalker', drift: true },
  cyclist:   { w: 38, h: 68,  rel: 0.52, hit: 0.34, draw: drawCyclist,    label: 'a cyclist', weave: true },
  stalled:   { w: 66, h: 174, rel: 0,    hit: 0.45, draw: drawStreetcar,  label: 'a stalled streetcar', telegraph: true },
  pothole:   { w: 76, h: 52,  rel: 0,    hit: 0.38, draw: drawPothole,    label: 'an open manhole', telegraph: true }
}

// weights shift as the run goes on: early runs are mostly cones and parked
// cars, later ones lean on the hazards that actually force a decision
function kindFor(elapsed) {
  const late = clamp((elapsed - 12) / 45, 0, 1)
  const w = {
    parkedCar: 22,
    cones:     18 - 8 * late,
    movingCar: 10 + 8 * late,
    suv:        8 + 6 * late,
    ped:        9 + 5 * late,
    cyclist:    7 + 5 * late,
    barrier:    6 + 4 * late,
    pothole:    5 + 6 * late,
    stalled:    2 + 9 * late
  }
  let total = 0
  for (const k in w) total += w[k]
  let r = Math.random() * total
  for (const k in w) { r -= w[k]; if (r <= 0) return k }
  return 'parkedCar'
}

function makeObstacle(kind, lane) {
  const K = KINDS[kind]
  const o = {
    kind, lane, K,
    w: K.w, h: K.h,
    x: LANE_X[lane], y: 0,
    phase: Math.random() * 6,
    spin: 0,
    passed: false, hit: false
  }
  if (kind === 'parkedCar' || kind === 'movingCar') {
    const p = pick(PAINT); o.body = p.body; o.dark = p.dark
    o.braking = kind === 'movingCar' && Math.random() < 0.3
  } else if (kind === 'suv') {
    const p = pick(PAINT); o.body = p.body; o.dark = p.dark
  } else if (kind === 'ped') {
    const p = pick(PAINT); o.body = p.body; o.dark = p.dark
    o.skin = pick(SKIN); o.hair = pick(HAIR)
    o.driftAmp = rand(18, 30); o.driftRate = rand(0.9, 1.5); o.driftOff = Math.random() * 6
  } else if (kind === 'cyclist') {
    o.body = pick(PAINT).body
    o.driftAmp = rand(10, 18); o.driftRate = rand(1.3, 2.1); o.driftOff = Math.random() * 6
  } else if (kind === 'stalled') {
    o.body = C.emeraldDark; o.dark = '#0a4438'; o.stalled = true
  }
  return o
}

// ---------------------------------------------------------------------------
// STREET DRESSING — rooftops, trees, lamps and a transit stop, all top-down
// ---------------------------------------------------------------------------
function makeProp(side, y) {
  const r = Math.random()
  if (r < 0.50) {
    return { type: 'roof', side, y, w: rand(140, 300), h: rand(120, 230),
             hue: pick(['#2e4370', '#27395f', '#344a7c', '#1f3053']),
             cols: 3 + ((Math.random() * 4) | 0), rows: 3 + ((Math.random() * 4) | 0),
             lit: 0.25 + Math.random() * 0.6 }
  }
  if (r < 0.70) return { type: 'tree', side, y, h: 70, r: rand(20, 30) }
  if (r < 0.88) return { type: 'lamp', side, y, h: 110 }
  return { type: 'stop', side, y, h: 150 }
}

function drawProp(g, p, edgeX, dir) {
  // dir: +1 when the prop sits to the right of the road, -1 to the left
  g.save()
  if (p.type === 'roof') {
    const x = edgeX + dir * 10
    const x0 = dir > 0 ? x : x - p.w
    g.fillStyle = 'rgba(0,0,0,.35)'
    rr(g, x0 + dir * 4, p.y + 6, p.w, p.h, 6); g.fill()
    fillRR(g, x0, p.y, p.w, p.h, 6, p.hue)
    g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = 3
    rr(g, x0 + 9, p.y + 9, p.w - 18, p.h - 18, 4); g.stroke()   // parapet
    // rooftop skylights, some lit amber. The grid is derived from the roof's
    // own size so the panes stay square instead of stretching into bars.
    const cols = Math.max(2, Math.round((p.w - 44) / 40))
    const rows = Math.max(2, Math.round((p.h - 44) / 40))
    const sw = (p.w - 44) / cols, sh = (p.h - 44) / rows
    const pane = Math.min(sw, sh) * 0.62
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const on = ((i * 7 + j * 13) % 10) / 10 < p.lit
        g.fillStyle = on ? 'rgba(232,179,57,.70)' : 'rgba(12,18,34,.65)'
        rr(g, x0 + 22 + i * sw + (sw - pane) / 2, p.y + 22 + j * sh + (sh - pane) / 2, pane, pane, 2)
        g.fill()
      }
    }
    fillRR(g, x0 + p.w * 0.5 - 14, p.y + p.h - 34, 28, 22, 3, '#1a2440')  // rooftop unit
  } else if (p.type === 'tree') {
    const x = edgeX + dir * (18 + p.r)
    g.fillStyle = 'rgba(0,0,0,.3)'
    g.beginPath(); g.arc(x + 3, p.y + 6, p.r, 0, 7); g.fill()
    g.fillStyle = '#1f4a3c'
    g.beginPath(); g.arc(x, p.y, p.r, 0, 7); g.fill()
    g.fillStyle = '#2a6450'
    g.beginPath(); g.arc(x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.66, 0, 7); g.fill()
    g.fillStyle = '#39806a'
    g.beginPath(); g.arc(x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.3, 0, 7); g.fill()
  } else if (p.type === 'lamp') {
    const x = edgeX + dir * 14
    // the light pool spills onto the road — most of the night lighting comes
    // from these, which is why they sit on the same layer as the asphalt
    const grd = g.createRadialGradient(x - dir * 34, p.y, 4, x - dir * 34, p.y, 92)
    grd.addColorStop(0, 'rgba(232,179,57,.20)')
    grd.addColorStop(1, 'rgba(232,179,57,0)')
    g.fillStyle = grd
    g.beginPath(); g.arc(x - dir * 34, p.y, 92, 0, 7); g.fill()
    g.strokeStyle = '#33405e'; g.lineWidth = 6
    g.beginPath(); g.moveTo(x, p.y); g.lineTo(x - dir * 34, p.y); g.stroke()
    g.fillStyle = '#4a5878'
    g.beginPath(); g.arc(x, p.y, 8, 0, 7); g.fill()
    g.fillStyle = C.amber
    g.beginPath(); g.ellipse(x - dir * 36, p.y, 9, 6, 0, 0, 7); g.fill()
  } else {
    const x = edgeX + dir * 12
    const x0 = dir > 0 ? x : x - 52
    fillRR(g, x0, p.y, 52, 96, 5, 'rgba(12,18,34,.55)')          // shelter roof
    g.strokeStyle = C.rail; g.lineWidth = 2
    rr(g, x0 + 5, p.y + 5, 42, 86, 4); g.stroke()
    fillRR(g, x0 + 12, p.y + 100, 28, 34, 3, '#1a2440')          // stop flag
    g.fillStyle = C.ruby
    g.fillRect(x0 + 12, p.y + 100, 28, 10)
    g.fillStyle = C.cream                                        // streetcar pictogram
    rr(g, x0 + 19, p.y + 114, 14, 14, 3); g.fill()
    g.fillStyle = '#1a2440'
    g.fillRect(x0 + 21, p.y + 117, 10, 4)
    g.fillRect(x0 + 20, p.y + 125, 12, 1.6)
  }
  g.restore()
}

// ---------------------------------------------------------------------------
// OVERLAY CHROME — start / game-over / HUD buttons. These are real DOM because
// they are text and want real focus and hit targets, but nothing here is
// touched per frame: the live score is drawn into the canvas instead.
// ---------------------------------------------------------------------------
const CSS = `
.rw-root { position:absolute; inset:0; overflow:hidden; background:${C.sapphireDark};
  font-family:${FONT}; color:${C.cream}; -webkit-user-select:none; user-select:none;
  -webkit-tap-highlight-color:transparent; touch-action:none; }
.rw-canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.rw-probe { position:absolute; top:0; left:0; width:0; height:env(safe-area-inset-top,0px);
  pointer-events:none; }
.rw-layer { position:absolute; inset:0; pointer-events:none;
  padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px)
          env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px); }

/* above the start/over screens: mute, pause and the way out stay usable and
   at full contrast even while an overlay is up */
.rw-icons { position:absolute; top:14px; right:14px; display:flex; gap:9px;
  align-items:center; pointer-events:auto; z-index:3; }
/* the borders are heavy on purpose: on top of a busy street these controls
   have to read as controls, not as scenery */
/* Controls are built like signage and arcade panels: square corners, a hard
   2px rule, and a solid offset block instead of a soft drop shadow. Pressing
   one drops it into its own shadow. */
.rw-icon { width:44px; height:44px; border-radius:2px; border:2px solid ${C.cream};
  background:${C.sapphireDark}; color:${C.cream}; font-size:17px; line-height:1; cursor:pointer;
  display:grid; place-items:center; font-family:inherit;
  box-shadow:4px 4px 0 rgba(232,179,57,.9);
  transition:transform .1s ease, box-shadow .1s ease, background .2s ease; }
.rw-icon:hover { background:${C.sapphire}; transform:translate(2px,2px); box-shadow:2px 2px 0 ${C.amber}; }
.rw-icon:active { transform:translate(4px,4px); box-shadow:0 0 0 ${C.amber}; }

/* the way out stays in the top-right row with mute/pause (top-left is where
   the canvas draws the live score, so it can't live there) but fills solid
   amber, so it doesn't read as a third identical outlined icon */
.rw-exit { height:44px; padding:0 14px; gap:7px; display:flex; align-items:center;
  border-radius:2px; border:2px solid ${C.amber}; background:${C.amber}; color:${C.sapphireDark};
  font-family:inherit; font-size:11.5px; font-weight:800; letter-spacing:.09em;
  text-transform:uppercase; cursor:pointer;
  box-shadow:4px 4px 0 rgba(242,234,214,.9);
  transition:transform .1s ease, box-shadow .1s ease, background .2s ease; }
.rw-exit:hover { background:#f2c257; transform:translate(2px,2px); box-shadow:2px 2px 0 ${C.cream}; }
.rw-exit:active { transform:translate(4px,4px); box-shadow:0 0 0 ${C.cream}; }
.rw-exit b { font-size:16px; font-weight:800; line-height:1; }
@media (max-width:520px) { .rw-exit span { display:none; } .rw-exit { width:44px; padding:0; } }

.rw-screen { position:absolute; inset:0; z-index:1; display:none; flex-direction:column;
  align-items:center; justify-content:center; text-align:center; gap:4px;
  padding:28px 24px; pointer-events:auto;
  background:radial-gradient(ellipse at 50% 42%, rgba(27,42,74,.80) 0%, rgba(8,12,24,.93) 72%); }
.rw-screen.on { display:flex; animation:rw-fade .32s ease both; }
@keyframes rw-fade { from { opacity:0; transform:translateY(8px);} to { opacity:1; transform:none; } }

/* One ink for every word on screen; hierarchy comes from size and opacity,
   and amber is reserved for rules, borders and blocks. */
.rw-eyebrow { font-size:11px; letter-spacing:.26em; text-transform:uppercase; color:${C.cream};
  opacity:.6; font-weight:700; margin-bottom:6px; }
.rw-title { font-size:clamp(28px,8.5vw,46px); font-weight:800; letter-spacing:-.02em; line-height:1.02;
  color:${C.cream}; margin-bottom:8px; }
.rw-title em { font-style:normal; color:${C.cream}; }
.rw-sub { font-size:clamp(13px,3.6vw,15px); line-height:1.5; color:${C.cream}; opacity:.72;
  max-width:34ch; margin-bottom:18px; }
.rw-keys { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:24px; }
.rw-key { font-size:11px; letter-spacing:.06em; text-transform:uppercase; font-weight:600;
  padding:7px 12px; border-radius:2px; border-left:3px solid rgba(232,179,57,.85);
  background:rgba(242,234,214,.07); color:${C.cream}; opacity:.85; }
.rw-key b { color:${C.cream}; font-weight:800; }

.rw-btn { font-family:inherit; font-size:13px; font-weight:800; letter-spacing:.14em;
  text-transform:uppercase; padding:15px 30px; border-radius:2px; cursor:pointer;
  border:2px solid ${C.cream}; background:${C.sapphireDark}; color:${C.cream};
  box-shadow:6px 6px 0 ${C.amber};
  transition:transform .1s ease, box-shadow .1s ease, background .2s ease; }
.rw-btn:hover { background:${C.emeraldDark}; transform:translate(3px,3px); box-shadow:3px 3px 0 ${C.amber}; }
.rw-btn:active { transform:translate(6px,6px); box-shadow:0 0 0 ${C.amber}; }
.rw-btn.ghost { box-shadow:6px 6px 0 rgba(242,234,214,.25); border-color:rgba(242,234,214,.55);
  padding:15px 22px; font-size:12px; }
.rw-btn.ghost:hover { box-shadow:3px 3px 0 rgba(242,234,214,.35); }
.rw-btn.ghost:active { box-shadow:0 0 0 rgba(242,234,214,0); }
.rw-btnrow { display:flex; gap:16px; align-items:center; justify-content:center; flex-wrap:wrap; }

.rw-scores { display:flex; gap:26px; justify-content:center; margin:6px 0 20px; }
.rw-scorebox { min-width:96px; }
.rw-scorebox span { display:block; font-size:10px; letter-spacing:.2em; text-transform:uppercase;
  color:rgba(242,234,214,.55); margin-bottom:3px; }
.rw-scorebox strong { font-size:32px; font-weight:800; letter-spacing:-.02em; color:${C.cream}; }
.rw-record { font-size:11px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
  color:${C.cream}; border:2px solid ${C.amber}; padding:5px 12px; border-radius:2px;
  margin-bottom:12px; display:none; }
.rw-record.on { display:inline-block; animation:rw-pop .4s ease both; }
@keyframes rw-pop { from { transform:scale(.7); opacity:0 } to { transform:none; opacity:1 } }
.rw-cause { font-size:12.5px; color:${C.cream}; opacity:.62; margin-bottom:12px; }
.rw-scorebox span { color:${C.cream}; }

.rw-touch { position:absolute; left:0; right:0; bottom:0; display:none;
  justify-content:space-between; gap:12px;
  padding:0 16px calc(18px + env(safe-area-inset-bottom,0px)); pointer-events:none; }
.rw-throttle { display:flex; flex-direction:column; gap:8px; pointer-events:none; }
.rw-throttle button { width:72px; height:46px; font-size:18px; }
.rw-touch button { pointer-events:auto; width:80px; height:64px; border-radius:2px;
  border:2px solid rgba(242,234,214,.7); background:${C.sapphireDark}; color:${C.cream};
  font-size:24px; line-height:1; box-shadow:4px 4px 0 rgba(232,179,57,.75); }
.rw-touch button:active { background:${C.emeraldDark};
  transform:translate(4px,4px); box-shadow:0 0 0 ${C.amber}; }
.rw-root.playing .rw-touch { display:flex; }
@media (hover:hover) and (pointer:fine) { .rw-root .rw-touch { display:none !important; } }
.rw-root :focus-visible { outline:2px solid ${C.amber}; outline-offset:3px; }
`

let cssInjected = false
function injectCSS() {
  if (cssInjected || document.getElementById('rw-style')) { cssInjected = true; return }
  const s = document.createElement('style')
  s.id = 'rw-style'
  s.textContent = CSS
  document.head.appendChild(s)
  cssInjected = true
}

const MARKUP = `
<canvas class="rw-canvas"></canvas>
<div class="rw-probe"></div>
<div class="rw-layer">
  <div class="rw-icons">
    <button class="rw-icon rw-mute" type="button" aria-label="Mute sound">&#128266;</button>
    <button class="rw-icon rw-pause" type="button" aria-label="Pause">&#10074;&#10074;</button>
    <button class="rw-exit" type="button" aria-label="Back to the main site">
      <b>&#8592;</b><span>Back to site</span></button>
  </div>

  <div class="rw-screen rw-start on">
    <h1 class="rw-title">Right of <em>Way</em></h1>
    <p class="rw-sub">Take the last streetcar down King. Switch lanes to dodge traffic, cones
      and the occasional open manhole, and sweep up fare tokens on the way. Push the throttle
      forward for speed and score, ease off to buy yourself room. The line only gets faster.</p>
    <div class="rw-keys">
      <div class="rw-key"><b>&#8592; &#8594;</b> or <b>A D</b> &nbsp;switch lane</div>
      <div class="rw-key"><b>&#8593; &#8595;</b> or <b>W S</b> &nbsp;throttle</div>
      <div class="rw-key"><b>swipe</b>&nbsp; on mobile</div>
      <div class="rw-key"><b>M</b>&nbsp; mute &nbsp;&#183;&nbsp; <b>P</b>&nbsp; pause</div>
    </div>
    <button class="rw-btn rw-play" type="button">Start the run</button>
  </div>

  <div class="rw-screen rw-over">
    <h1 class="rw-title">Service <em>disruption</em></h1>
    <p class="rw-cause"></p>
    <div class="rw-record">New personal best</div>
    <div class="rw-scores">
      <div class="rw-scorebox"><span>Score</span><strong class="rw-final">0</strong></div>
      <div class="rw-scorebox best"><span>Best</span><strong class="rw-best">0</strong></div>
    </div>
    <div class="rw-btnrow">
      <button class="rw-btn rw-again" type="button">Run again</button>
      <button class="rw-btn ghost rw-quit" type="button">Back to the site</button>
    </div>
  </div>

  <div class="rw-screen rw-paused">
    <div class="rw-eyebrow">Holding at the stop</div>
    <h1 class="rw-title">Paused</h1>
    <button class="rw-btn rw-resume" type="button">Resume</button>
  </div>

  <div class="rw-touch">
    <button class="rw-left" type="button" aria-label="Move left">&#9664;</button>
    <div class="rw-throttle">
      <button class="rw-up" type="button" aria-label="Speed up">&#9650;</button>
      <button class="rw-down" type="button" aria-label="Slow down">&#9660;</button>
    </div>
    <button class="rw-right" type="button" aria-label="Move right">&#9654;</button>
  </div>
</div>
`

// ---------------------------------------------------------------------------
// MOUNT
// ---------------------------------------------------------------------------
export function mountStreetcarRunner(host, opts = {}) {
  injectCSS()
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  const root = document.createElement('div')
  root.className = 'rw-root'
  root.innerHTML = MARKUP
  host.appendChild(root)

  const $ = (sel) => root.querySelector(sel)
  const canvas = $('.rw-canvas')
  const probe = $('.rw-probe')
  const g = canvas.getContext('2d')
  const startScreen = $('.rw-start'), overScreen = $('.rw-over'), pauseScreen = $('.rw-paused')
  const muteBtn = $('.rw-mute'), pauseBtn = $('.rw-pause'), exitBtn = $('.rw-exit')
  if (!opts.onExit) { exitBtn.remove(); $('.rw-quit').remove() }

  let best = parseInt(localStorage.getItem('rw-best') || '0', 10) || 0
  $('.rw-best').textContent = best

  // Fall back to the site-wide mute preference the first time, so someone who
  // silenced the portfolio does not get blasted by the game.
  const storedMute = localStorage.getItem('rw-muted')
  const audio = makeAudio(storedMute !== null ? storedMute === '1' : localStorage.getItem('tw-muted') === '1')
  function syncMute() {
    muteBtn.innerHTML = audio.muted ? '&#128263;' : '&#128266;'
    muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound')
  }
  syncMute()

  // --- viewport ------------------------------------------------------------
  let W = 1, H = 1, dpr = 1, scale = 1, offX = 0, offY = 0, safeTop = 0
  const view = { left: 0, right: VW, top: 0, bottom: VH }
  function resize() {
    const r = root.getBoundingClientRect()
    W = Math.max(1, r.width); H = Math.max(1, r.height)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
    // fit the 800-tall stage to the height, but never let the road run wider
    // than the viewport — on a short landscape phone width wins instead
    scale = Math.min(H / VH, W / (VW * 0.72))
    offX = W / 2 - (VW / 2) * scale
    offY = H - VH * scale
    view.left = -offX / scale
    view.right = view.left + W / scale
    view.top = -offY / scale
    safeTop = probe.offsetHeight / scale
  }
  const ro = new ResizeObserver(resize)
  ro.observe(root)
  resize()

  // --- state ---------------------------------------------------------------
  const S = {
    mode: 'ready',          // ready | running | dead | paused
    t: 0, dist: 0, speed: 240, base: 240,
    lane: 1, px: LANE_X[1], py: PLAYER_Y_HOME, pvx: 0, lean: 0, bob: 0, spin: 0,
    throttle: 0, throttleTarget: 0,
    tokens: 0, near: 0, score: 0, cause: '',
    obs: [], coins: [], streaks: [], sparks: [], props: [],
    nextSpawn: 340, propCursor: [0, 0], shake: 0, flash: 0, deadFor: 0, sf: 0
  }
  // which throttle inputs are being held right now, from keys or touch
  const held = { up: false, down: false }

  function seedProps() {
    S.props.length = 0
    for (const side of [0, 1]) {
      let y = VH + 40
      while (y > view.top - 400) {
        const p = makeProp(side, y)
        S.props.push(p)
        y -= p.h + rand(14, 64)
      }
      S.propCursor[side] = y
    }
  }
  seedProps()

  function reset() {
    S.t = 0; S.dist = 0; S.speed = 240; S.base = 240
    S.lane = 1; S.px = LANE_X[1]; S.py = PLAYER_Y_HOME; S.pvx = 0
    S.lean = 0; S.bob = 0; S.spin = 0
    S.throttle = 0; S.throttleTarget = 0
    held.up = held.down = false
    S.tokens = 0; S.near = 0; S.score = 0; S.cause = ''
    S.obs.length = 0; S.coins.length = 0; S.sparks.length = 0
    S.nextSpawn = 360; S.shake = 0; S.flash = 0; S.deadFor = 0
  }

  function show(screen) {
    for (const s of [startScreen, overScreen, pauseScreen]) s.classList.toggle('on', s === screen)
    root.classList.toggle('playing', screen === null)
    pauseBtn.style.display = screen === null ? '' : 'none'
  }

  function startRun() {
    audio.unlock()
    reset()
    S.mode = 'running'
    show(null)
    audio.startHum()
  }

  function die(cause) {
    if (S.mode !== 'running') return
    S.mode = 'dead'; S.cause = cause
    held.up = held.down = false
    S.shake = reduce ? 6 : 26; S.flash = 1
    for (let i = 0; i < 26; i++) {
      S.sparks.push({
        x: S.px, y: S.py - 50, vx: rand(-260, 260), vy: rand(-320, 120),
        life: rand(0.4, 1.0), col: pick([C.amber, C.cream, C.ruby, '#ff8a5c'])
      })
    }
    audio.crash(); audio.stopHum()
    setTimeout(() => audio.over(), 380)

    const isRecord = S.score > best
    if (isRecord) { best = S.score; try { localStorage.setItem('rw-best', String(best)) } catch (e) {} }
    $('.rw-final').textContent = S.score
    $('.rw-best').textContent = best
    $('.rw-record').classList.toggle('on', isRecord)
    $('.rw-cause').textContent = cause
      ? `Ran straight into ${cause} after ${S.t.toFixed(1)}s and ${S.tokens} tokens.`
      : ''
    // hold the wreck on screen for a beat before the overlay lands
    setTimeout(() => { if (S.mode === 'dead') show(overScreen) }, 750)
  }

  function togglePause(force) {
    if (S.mode === 'running' && force !== false) {
      S.mode = 'paused'; show(pauseScreen); audio.stopHum()
      held.up = held.down = false   // a key-up during a pause would be missed
    } else if (S.mode === 'paused' && force !== true) {
      S.mode = 'running'; show(null); audio.startHum()
    }
  }

  function moveLane(dir) {
    if (S.mode !== 'running') return
    const next = clamp(S.lane + dir, 0, 2)
    if (next === S.lane) return
    S.lane = next
    audio.lane()
  }

  // --- spawning ------------------------------------------------------------
  function spawnWave() {
    const twoLanes = S.t > 16 && Math.random() < (S.t > 42 ? 0.5 : 0.3)
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5)
    const blocked = lanes.slice(0, twoLanes ? 2 : 1)
    let deepest = 0
    for (const lane of blocked) {
      const o = makeObstacle(kindFor(S.t), lane)
      // telegraphed hazards start further out so their warning has time to read
      const lead = o.K.telegraph ? 300 : 30
      o.y = view.top - o.h / 2 - lead
      deepest = Math.max(deepest, lead)
      S.obs.push(o)
    }
    // tokens go in a lane that is still open, as a reward for reading the wave
    const free = [0, 1, 2].filter((l) => !blocked.includes(l))
    if (free.length && Math.random() < 0.55) {
      const lane = pick(free)
      const n = 2 + ((Math.random() * 3) | 0)
      for (let i = 0; i < n; i++) {
        S.coins.push({ x: LANE_X[lane], y: view.top - 30 - i * 48, got: false, phase: Math.random() * 6 })
      }
    }
    // gap is measured in seconds of travel, not pixels, so reaction time stays
    // roughly constant even as the streetcar speeds up
    S.nextSpawn = S.dist + S.speed * rand(0.60, 0.98) + deepest
  }

  // --- simulation ----------------------------------------------------------
  function scrollWorld(dt, speed) {
    const d = speed * dt
    S.dist += d
    for (const p of S.props) p.y += d
    for (let i = S.props.length - 1; i >= 0; i--) if (S.props[i].y > VH + 420) S.props.splice(i, 1)
    for (const side of [0, 1]) {
      S.propCursor[side] += d
      while (S.propCursor[side] > view.top - 260) {
        const p = makeProp(side, S.propCursor[side])
        S.props.push(p)
        S.propCursor[side] -= p.h + rand(14, 64)
      }
    }
    // speed streaks: the faster you go, the more the street smears
    const sf = S.sf = clamp((speed - 240) / 618, 0, 1)   // from the speed actually being scrolled
    if (!reduce && sf > 0.08) {
      const want = Math.min(80, 8 + sf * 70)
      while (S.streaks.length < want) {
        S.streaks.push({ x: rand(ROAD_L, ROAD_R), y: rand(view.top, VH), len: rand(30, 130) })
      }
    }
    for (let i = S.streaks.length - 1; i >= 0; i--) {
      const s = S.streaks[i]
      s.y += d * rand(1.6, 2.4)
      if (s.y - s.len > VH + 20) {
        if (S.streaks.length > 8 + sf * 70) S.streaks.splice(i, 1)
        else { s.y = view.top - rand(0, 200); s.x = rand(ROAD_L, ROAD_R); s.len = rand(30, 130) }
      }
    }
  }

  // 0 at the line's slowest, 1 at full throttle on a fully ramped-up run
  const speedFactor = () => clamp((S.speed - 240) / 618, 0, 1)

  function update(dt) {
    S.t += dt
    S.base = 240 + Math.min(S.t * 9, 420)

    // throttle: eased so the streetcar surges and settles rather than snapping
    S.throttleTarget = clamp((held.up ? 1 : 0) + (held.down ? -1 : 0), -1, 1)
    S.throttle = lerp(S.throttle, S.throttleTarget, 1 - Math.exp(-dt * 4.5))
    S.speed = S.base * (1 + S.throttle * THROTTLE_GAIN)
    S.py = PLAYER_Y_HOME - S.throttle * PLAYER_Y_SWING

    audio.setHumSpeed(speedFactor())
    scrollWorld(dt, S.speed)

    // lane easing, with lean and a little stretch in the direction of travel
    const target = LANE_X[S.lane]
    const nx = lerp(S.px, target, 1 - Math.exp(-dt * 13))
    S.pvx = (nx - S.px) / Math.max(dt, 0.001)
    S.px = nx
    S.lean = lerp(S.lean, clamp((target - S.px) * 0.004, -0.13, 0.13), 1 - Math.exp(-dt * 10))
    S.bob += dt * (6 + speedFactor() * 10)
    S.spin += dt * S.speed / 40

    if (S.dist > S.nextSpawn) spawnWave()

    // obstacles
    const pHalfW = 26, pHalfH = 58
    for (let i = S.obs.length - 1; i >= 0; i--) {
      const o = S.obs[i]
      o.phase += dt
      o.spin += dt * S.speed / 40
      o.y += S.speed * (1 - o.K.rel) * dt
      if (o.K.drift || o.K.weave) {
        // jaywalkers and cyclists wander, but stay inside their own lane so the
        // lane you picked is still the lane you have to survive
        o.x = LANE_X[o.lane] + Math.sin(o.phase * o.driftRate + o.driftOff) * o.driftAmp
      }
      if (o.y - o.h > VH + 60) { S.obs.splice(i, 1); continue }

      const dx = Math.abs(o.x - S.px)
      const dy = Math.abs(o.y - (S.py - pHalfH * 0.1))
      const hitX = o.w * o.K.hit + pHalfW
      const hitY = o.h * o.K.hit + pHalfH
      if (!o.hit && dx < hitX && dy < hitY) { o.hit = true; die(o.K.label) ; return }
      // near miss: it went past, close enough to feel it
      if (!o.passed && o.y > S.py + 30) {
        o.passed = true
        if (dx < hitX + 34) {
          S.near++
          S.shake = Math.max(S.shake, reduce ? 2 : 9)
          audio.nearMiss()
        }
      }
    }

    // tokens
    for (let i = S.coins.length - 1; i >= 0; i--) {
      const c = S.coins[i]
      c.y += S.speed * dt
      c.phase += dt
      if (c.y > VH + 40) { S.coins.splice(i, 1); continue }
      if (Math.abs(c.x - S.px) < 40 && Math.abs(c.y - S.py) < 62) {
        S.coins.splice(i, 1)
        S.tokens++
        audio.token()
        for (let k = 0; k < 5; k++) {
          S.sparks.push({ x: c.x, y: c.y, vx: rand(-90, 90), vy: rand(-140, -20), life: rand(0.25, 0.5), col: C.amber })
        }
      }
    }

    S.score = Math.floor(S.dist / 16) + S.tokens * 25 + S.near * 10
    stepEffects(dt)
  }

  function stepEffects(dt) {
    S.shake *= Math.exp(-dt * 6)
    S.flash = Math.max(0, S.flash - dt * 2.4)
    for (let i = S.sparks.length - 1; i >= 0; i--) {
      const s = S.sparks[i]
      s.life -= dt
      if (s.life <= 0) { S.sparks.splice(i, 1); continue }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 520 * dt
    }
  }

  // attract mode: the street keeps rolling behind the start screen
  function idle(dt) {
    S.bob += dt * 5
    S.spin += dt * 4
    scrollWorld(dt, S.mode === 'dead' ? 0 : 150)
    if (S.mode === 'dead') S.deadFor += dt
    stepEffects(dt)
  }

  // --- rendering -----------------------------------------------------------
  function drawStreet() {
    const vw = view.right - view.left, vh = VH - view.top
    g.fillStyle = C.sapphireDark
    g.fillRect(view.left - 10, view.top - 10, vw + 20, vh + 20)

    g.fillStyle = C.walk                                     // sidewalks
    g.fillRect(view.left, view.top, ROAD_L - view.left, vh)
    g.fillRect(ROAD_R, view.top, view.right - ROAD_R, vh)
    g.fillStyle = 'rgba(0,0,0,.16)'                          // paving joints
    const jo = S.dist % 64
    for (let y = view.top - 64 + jo; y < VH; y += 64) {
      g.fillRect(view.left, y, ROAD_L - view.left, 3)
      g.fillRect(ROAD_R, y, view.right - ROAD_R, 3)
    }

    g.fillStyle = C.asphalt                                  // roadway
    g.fillRect(ROAD_L, view.top, ROAD_R - ROAD_L, vh)
    g.fillStyle = C.asphaltLit                               // centre lane is lighter
    g.fillRect(ROAD_L + LANE_W, view.top, LANE_W, vh)

    g.fillStyle = C.walkLit                                  // curbs
    g.fillRect(ROAD_L - 5, view.top, 5, vh)
    g.fillRect(ROAD_R, view.top, 5, vh)

    // streetcar track: two rails and sleepers in every lane
    const so = S.dist % 46
    for (let l = 0; l < 3; l++) {
      const cx = LANE_X[l]
      g.fillStyle = 'rgba(0,0,0,.22)'
      for (let y = view.top - 46 + so; y < VH; y += 46) g.fillRect(cx - 28, y, 56, 6)
      g.fillStyle = 'rgba(125,140,176,.55)'
      g.fillRect(cx - 22, view.top, 3.5, vh)
      g.fillRect(cx + 19, view.top, 3.5, vh)
    }

    // lane dividers, dashed and scrolling
    const lo = S.dist % 64
    g.fillStyle = 'rgba(242,234,214,.42)'
    for (const lx of [ROAD_L + LANE_W, ROAD_L + LANE_W * 2]) {
      for (let y = view.top - 64 + lo; y < VH; y += 64) g.fillRect(lx - 1.5, y, 3, 34)
    }
  }

  function drawProps() {
    for (const p of S.props) {
      if (p.y < view.top - 420 || p.y > VH + 420) continue
      drawProp(g, p, p.side ? ROAD_R + 5 : ROAD_L - 5, p.side ? 1 : -1)
    }
  }

  function drawStreaks() {
    const sf = S.sf
    if (reduce || sf <= 0.08) return
    g.strokeStyle = `rgba(242,234,214,${0.05 + sf * 0.16})`
    g.lineWidth = 2
    g.beginPath()
    for (const s of S.streaks) {
      g.moveTo(s.x, s.y - s.len * (0.4 + sf))
      g.lineTo(s.x, s.y)
    }
    g.stroke()
  }

  function drawCoins() {
    for (const c of S.coins) {
      if (c.y < view.top - 40 || c.y > VH + 40) continue
      g.save(); g.translate(c.x, c.y + Math.sin(c.phase * 3) * 3)
      drawToken(g, c.phase)
      g.restore()
    }
  }

  function drawObstacles() {
    for (const o of S.obs) {
      if (o.y < view.top - o.h || o.y > VH + o.h) continue
      g.save(); g.translate(o.x, o.y)
      o.K.draw(g, o)
      g.restore()
    }
  }

  // a hazard still off-screen announces itself in its lane first
  function drawWarnings() {
    const y = view.top + 44 + safeTop
    for (const o of S.obs) {
      if (!o.K.telegraph || o.y + o.h / 2 > view.top + 6) continue
      const near = clamp(1 - (view.top - (o.y + o.h / 2)) / 300, 0, 1)
      const blink = 0.35 + 0.65 * Math.abs(Math.sin(performance.now() / 110))
      const a = blink * (0.35 + near * 0.65)
      g.save(); g.translate(LANE_X[o.lane], y)
      const grd = g.createLinearGradient(0, -20, 0, 210)
      grd.addColorStop(0, `rgba(232,179,57,${0.20 * a})`)
      grd.addColorStop(1, 'rgba(232,179,57,0)')
      g.fillStyle = grd
      g.fillRect(-LANE_W / 2 + 6, -20, LANE_W - 12, 230)
      g.fillStyle = `rgba(232,179,57,${a})`
      g.beginPath(); g.moveTo(0, 12); g.lineTo(-17, -14); g.lineTo(17, -14); g.closePath(); g.fill()
      g.fillStyle = `rgba(27,42,74,${a})`
      g.font = '800 13px ' + FONT
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('!', 0, -3)
      g.restore()
    }
  }

  function drawPlayer() {
    const stretch = clamp(Math.abs(S.pvx) / 1100, 0, 0.16)
    g.save()
    g.translate(S.px, S.py + Math.sin(S.bob) * 1.8)
    g.rotate(S.lean + (S.mode === 'dead' ? Math.min(S.deadFor * 1.6, 0.55) : 0))
    // leaning on the throttle stretches the car along its length
    g.scale(1 + stretch - S.throttle * 0.03, 1 - stretch * 0.5 + S.throttle * 0.06)
    drawStreetcar(g, { w: 60, h: 150, spin: S.mode === 'dead' ? 0 : S.spin })
    g.restore()
  }

  function drawSparks() {
    for (const s of S.sparks) {
      g.globalAlpha = clamp(s.life * 2, 0, 1)
      g.fillStyle = s.col
      g.fillRect(s.x - 2.5, s.y - 2.5, 5, 5)
    }
    g.globalAlpha = 1
  }

  function drawHUD() {
    if (S.mode === 'ready') return
    const x = view.left + 20, y = view.top + 20 + safeTop
    g.textBaseline = 'top'; g.textAlign = 'left'
    g.fillStyle = 'rgba(242,234,214,.55)'
    g.font = '700 10px ' + FONT
    g.fillText('SCORE', x, y)
    g.fillStyle = C.cream
    g.font = '800 30px ' + FONT
    g.fillText(String(S.score), x, y + 13)
    g.fillStyle = 'rgba(242,234,214,.5)'
    g.font = '600 11px ' + FONT
    g.fillText('BEST ' + Math.max(best, S.score), x, y + 48)

    // token tally
    g.save(); g.translate(x + 9, y + 78)
    g.scale(0.62, 0.62); drawToken(g, 0)
    g.restore()
    g.fillStyle = C.cream
    g.font = '700 14px ' + FONT
    g.textBaseline = 'middle'
    g.fillText('x ' + S.tokens, x + 24, y + 78)

    // speed meter sits under the score rather than top-right, where it would
    // collide with the mute and pause buttons on a narrow screen
    g.textBaseline = 'top'
    g.fillStyle = 'rgba(242,234,214,.55)'
    g.font = '700 10px ' + FONT
    g.fillText('SPEED', x, y + 98)
    const bw = 92, by = y + 112
    g.fillStyle = 'rgba(242,234,214,.16)'
    rr(g, x, by, bw, 7, 1); g.fill()
    const sf = speedFactor()
    g.fillStyle = sf > 0.8 ? C.ruby : C.amber
    rr(g, x, by, Math.max(6, bw * sf), 7, 1); g.fill()
    // tick at the coasting speed, so the bar shows what the throttle is adding
    const coast = clamp((S.base - 240) / 618, 0, 1)
    g.fillStyle = C.cream
    g.fillRect(x + bw * coast - 1, by - 2, 2, 11)
  }

  // darken the far edges so the eye stays on the street, which matters most on
  // a wide desktop window where the sidewalks run off for hundreds of pixels
  function drawVignette() {
    const w = Math.max(40, (ROAD_L - view.left) * 0.85)
    let grd = g.createLinearGradient(view.left, 0, view.left + w, 0)
    grd.addColorStop(0, 'rgba(6,9,18,.85)'); grd.addColorStop(1, 'rgba(6,9,18,0)')
    g.fillStyle = grd
    g.fillRect(view.left, view.top, w, VH - view.top)
    grd = g.createLinearGradient(view.right, 0, view.right - w, 0)
    grd.addColorStop(0, 'rgba(6,9,18,.85)'); grd.addColorStop(1, 'rgba(6,9,18,0)')
    g.fillStyle = grd
    g.fillRect(view.right - w, view.top, w, VH - view.top)
  }

  function render() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    const sh = reduce ? S.shake * 0.35 : S.shake
    const sx = sh ? rand(-sh, sh) : 0
    const sy = sh ? rand(-sh, sh) : 0

    g.save()
    g.translate(offX + sx, offY + sy)
    g.scale(scale, scale)
    drawStreet()
    drawProps()
    drawStreaks()
    drawWarnings()
    drawCoins()
    drawObstacles()
    drawPlayer()
    drawSparks()
    drawVignette()
    g.restore()

    if (S.flash > 0) {
      g.fillStyle = `rgba(214,52,86,${S.flash * 0.42})`
      g.fillRect(0, 0, W, H)
    }
    g.save()
    g.translate(offX, offY); g.scale(scale, scale)
    drawHUD()
    g.restore()
  }

  // --- loop ----------------------------------------------------------------
  let raf = 0, last = 0
  function frame(now) {
    raf = requestAnimationFrame(frame)
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016
    last = now
    if (S.mode === 'running') update(dt)
    else idle(dt)
    render()
  }
  raf = requestAnimationFrame(frame)

  // --- input ---------------------------------------------------------------
  // Captured on window so the host page's own arrow-key navigation never fires
  // while the game has the screen.
  const KEYS_L = ['ArrowLeft', 'a', 'A']
  const KEYS_R = ['ArrowRight', 'd', 'D']
  const KEYS_U = ['ArrowUp', 'w', 'W']
  const KEYS_D = ['ArrowDown', 's', 'S']
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key
    let handled = true
    if (KEYS_L.includes(k)) moveLane(-1)
    else if (KEYS_R.includes(k)) moveLane(1)
    else if (KEYS_U.includes(k)) held.up = true
    else if (KEYS_D.includes(k)) held.down = true
    else if (k === ' ' || k === 'Enter') {
      if (S.mode === 'ready') startRun()
      else if (S.mode === 'dead' && S.deadFor > 0.7) startRun()
      else if (S.mode === 'paused') togglePause(false)
    } else if (k === 'm' || k === 'M') toggleMute()
    else if (k === 'p' || k === 'P') togglePause()
    else if (k === 'Escape') { if (S.mode === 'running') togglePause(true); else opts.onExit && opts.onExit() }
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }
  function onKeyUp(e) {
    const k = e.key
    if (KEYS_U.includes(k)) { held.up = false; e.stopPropagation() }
    else if (KEYS_D.includes(k)) { held.down = false; e.stopPropagation() }
  }
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKeyUp, true)

  // swipe, plus tap-side as a fallback for short flicks
  let tx = 0, ty = 0, tmoved = false
  function onTouchStart(e) {
    audio.unlock()
    const t = e.changedTouches[0]
    tx = t.clientX; ty = t.clientY; tmoved = false
  }
  function onTouchMove(e) {
    e.preventDefault()
    const t = e.changedTouches[0]
    const dx = t.clientX - tx, dy = t.clientY - ty
    if (Math.abs(dx) > Math.abs(dy)) {
      if (!tmoved && Math.abs(dx) > 26) { moveLane(Math.sign(dx)); tmoved = true }
    } else {
      // dragging up and down is the throttle: hold the finger where you want it
      held.up = dy < -22
      held.down = dy > 22
    }
  }
  function onTouchEnd(e) {
    held.up = held.down = false
    if (tmoved) return
    const t = e.changedTouches[0]
    if (Math.abs(t.clientX - tx) < 14 && Math.abs(t.clientY - ty) < 14 && S.mode === 'running') {
      const r = canvas.getBoundingClientRect()
      moveLane(t.clientX < r.left + r.width / 2 ? -1 : 1)
    }
  }
  canvas.addEventListener('touchstart', onTouchStart, { passive: true })
  canvas.addEventListener('touchmove', onTouchMove, { passive: false })
  canvas.addEventListener('touchend', onTouchEnd, { passive: true })

  function toggleMute() {
    const m = !audio.muted
    audio.setMuted(m)
    try { localStorage.setItem('rw-muted', m ? '1' : '0') } catch (e) {}
    syncMute()
  }

  function holdBtn(sel, dir) {
    const b = $(sel)
    if (!b) return
    const go = (e) => { e.preventDefault(); audio.unlock(); moveLane(dir) }
    b.addEventListener('pointerdown', go)
  }
  holdBtn('.rw-left', -1)
  holdBtn('.rw-right', 1)

  // throttle pads stay engaged for as long as they are pressed
  function throttleBtn(sel, key) {
    const b = $(sel)
    if (!b) return
    const on = (e) => { e.preventDefault(); audio.unlock(); held[key] = true }
    const off = (e) => { e.preventDefault(); held[key] = false }
    b.addEventListener('pointerdown', on)
    b.addEventListener('pointerup', off)
    b.addEventListener('pointercancel', off)
    b.addEventListener('pointerleave', off)
  }
  throttleBtn('.rw-up', 'up')
  throttleBtn('.rw-down', 'down')

  $('.rw-play').addEventListener('click', startRun)
  $('.rw-again').addEventListener('click', startRun)
  $('.rw-resume').addEventListener('click', () => togglePause(false))
  muteBtn.addEventListener('click', toggleMute)
  pauseBtn.addEventListener('click', () => togglePause())
  if (opts.onExit) {
    exitBtn.addEventListener('click', () => opts.onExit())
    $('.rw-quit').addEventListener('click', () => opts.onExit())
  }

  // a run should never keep going while the tab is hidden
  function onVis() { if (document.hidden && S.mode === 'running') togglePause(true) }
  document.addEventListener('visibilitychange', onVis)
  // (only tab-hiding pauses; a click on the address bar should not stop a run)

  function destroy() {
    cancelAnimationFrame(raf)
    ro.disconnect()
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('keyup', onKeyUp, true)
    document.removeEventListener('visibilitychange', onVis)
    audio.stopHum(); audio.close()
    root.remove()
  }

  return { destroy, get score() { return S.score }, get best() { return best } }
}

export default mountStreetcarRunner
