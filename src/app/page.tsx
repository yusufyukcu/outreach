"use client"
import { useEffect, useRef } from "react"
import Link from "next/link"
import {
  Search, BarChart3, KanbanSquare, Mail, TrendingUp,
  ArrowRight, Sparkles, Ghost, Target, CheckCircle2,
} from "lucide-react"
import { Logo } from "@/components/ui/logo"

function FlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const ctx = canvas.getContext("2d")!

    let raf: number
    let W = 0, H = 0

    function resize() {
      W = canvas!.width  = window.innerWidth
      H = canvas!.height = window.innerHeight
      // Repaint solid bg on resize to avoid white flash
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)
    }
    resize()
    window.addEventListener("resize", resize)

    // ── Deep navy background matching the reference image ──────────────
    const BG = "rgb(2, 8, 28)"

    // ── Wave band definition ────────────────────────────────────────────
    // Each band is a filled polygon drawn as a closed sine-wave path.
    // Multiple harmonics are summed per band to produce the organic silk look.
    type Band = {
      // Vertical centre of the band (0-1 of H)
      centerY:  number
      // Amplitude of each harmonic [px at full H]
      amps:     number[]
      // Frequency of each harmonic [cycles across W]
      freqs:    number[]
      // Phase offset of each harmonic [rad]
      phases:   number[]
      // Drift speed of each harmonic [rad/frame]
      speeds:   number[]
      // Band half-height (fill thickness) as fraction of H
      halfH:    number
      // Color stops: [hue, sat%, lig%, alpha] from left to right
      colorA:   [number, number, number, number]
      colorB:   [number, number, number, number]
      // Thickness of the bright stroke on the wave crest
      strokeAlpha: number
    }

    // 18 bands — blues, cyans, indigo, and a few teal accents
    const BAND_DEFS: Omit<Band, "phases" | "speeds">[] = [
      // deep background swells — wide, slow, low contrast
      { centerY:0.12, amps:[60,30,15], freqs:[0.6,1.3,2.1], halfH:0.10, colorA:[215,90,22,0.00], colorB:[220,80,38,0.18], strokeAlpha:0.06 },
      { centerY:0.28, amps:[80,40,20], freqs:[0.5,1.1,2.4], halfH:0.14, colorA:[210,85,18,0.00], colorB:[218,90,42,0.22], strokeAlpha:0.08 },
      { centerY:0.45, amps:[90,45,22], freqs:[0.4,0.9,1.8], halfH:0.16, colorA:[205,80,15,0.00], colorB:[215,88,48,0.28], strokeAlpha:0.10 },
      { centerY:0.60, amps:[85,40,18], freqs:[0.55,1.2,2.2], halfH:0.14, colorA:[210,85,16,0.00], colorB:[220,85,44,0.24], strokeAlpha:0.09 },
      { centerY:0.75, amps:[70,35,16], freqs:[0.5,1.0,2.0], halfH:0.12, colorA:[215,88,18,0.00], colorB:[222,82,40,0.20], strokeAlpha:0.07 },
      { centerY:0.88, amps:[55,28,12], freqs:[0.65,1.4,2.3], halfH:0.10, colorA:[218,85,20,0.00], colorB:[224,80,36,0.16], strokeAlpha:0.05 },
      // mid-layer — medium brightness, crest highlight
      { centerY:0.20, amps:[50,25,12], freqs:[0.7,1.5,2.8], halfH:0.07, colorA:[205,90,30,0.00], colorB:[195,95,62,0.35], strokeAlpha:0.22 },
      { centerY:0.35, amps:[55,28,14], freqs:[0.6,1.2,2.5], halfH:0.07, colorA:[210,88,28,0.00], colorB:[200,92,58,0.38], strokeAlpha:0.25 },
      { centerY:0.52, amps:[60,30,15], freqs:[0.5,1.1,2.2], halfH:0.08, colorA:[208,85,26,0.00], colorB:[198,95,60,0.40], strokeAlpha:0.28 },
      { centerY:0.67, amps:[52,26,13], freqs:[0.6,1.3,2.4], halfH:0.07, colorA:[212,88,28,0.00], colorB:[202,90,56,0.36], strokeAlpha:0.22 },
      { centerY:0.82, amps:[48,24,11], freqs:[0.7,1.4,2.6], halfH:0.06, colorA:[215,86,26,0.00], colorB:[205,88,54,0.32], strokeAlpha:0.18 },
      // bright crest lines — narrow, high contrast, pure cyan-white
      { centerY:0.18, amps:[45,22,10], freqs:[0.8,1.7,3.0], halfH:0.025, colorA:[190,100,70,0.00], colorB:[185,100,88,0.55], strokeAlpha:0.60 },
      { centerY:0.32, amps:[50,25,12], freqs:[0.7,1.5,2.8], halfH:0.025, colorA:[195,100,68,0.00], colorB:[188,100,86,0.60], strokeAlpha:0.65 },
      { centerY:0.50, amps:[55,27,13], freqs:[0.6,1.3,2.5], halfH:0.025, colorA:[192,100,72,0.00], colorB:[185,100,90,0.58], strokeAlpha:0.62 },
      { centerY:0.65, amps:[48,24,11], freqs:[0.7,1.4,2.7], halfH:0.025, colorA:[196,100,68,0.00], colorB:[190,100,86,0.55], strokeAlpha:0.58 },
      { centerY:0.79, amps:[42,21,10], freqs:[0.8,1.6,2.9], halfH:0.022, colorA:[198,100,66,0.00], colorB:[192,100,84,0.50], strokeAlpha:0.52 },
      // deep indigo accent swells
      { centerY:0.40, amps:[100,50,24], freqs:[0.35,0.8,1.6], halfH:0.18, colorA:[235,75,12,0.00], colorB:[240,80,35,0.20], strokeAlpha:0.05 },
      { centerY:0.58, amps:[95,48,22],  freqs:[0.38,0.85,1.7], halfH:0.16, colorA:[230,78,12,0.00], colorB:[238,82,36,0.18], strokeAlpha:0.05 },
    ]

    // Randomise per-band phases and speeds
    const bands: Band[] = BAND_DEFS.map((def) => ({
      ...def,
      phases: def.amps.map(() => Math.random() * Math.PI * 2),
      speeds: def.amps.map((_, i) => (0.0003 + i * 0.00015 + Math.random() * 0.0002) * (Math.random() < 0.5 ? 1 : -1)),
    }))

    // ── Helpers ─────────────────────────────────────────────────────────
    // Evaluate the summed wave Y offset at position x for a band
    function waveY(band: Band, x: number, t: number): number {
      let y = 0
      for (let i = 0; i < band.amps.length; i++) {
        const a = band.amps[i] * (H / 900) // scale with screen height
        const f = band.freqs[i]
        y += a * Math.sin(f * (x / W) * Math.PI * 2 + band.phases[i] + t * band.speeds[i] * 60)
      }
      return y
    }

    // Build a closed polygon path for the filled band
    function bandPath(band: Band, t: number) {
      const cy  = band.centerY * H
      const hh  = band.halfH   * H
      const steps = Math.ceil(W / 4) // 1 point per 4px — enough smoothness

      ctx.beginPath()
      // Top edge (wave + halfH above centre)
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * W
        const y = cy + waveY(band, x, t) - hh
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      // Bottom edge (wave - halfH, reversed)
      for (let i = steps; i >= 0; i--) {
        const x = (i / steps) * W
        const y = cy + waveY(band, x, t) + hh
        ctx.lineTo(x, y)
      }
      ctx.closePath()
    }

    // Build only the crest stroke path (centre line of the wave)
    function crestPath(band: Band, t: number) {
      const cy    = band.centerY * H
      const steps = Math.ceil(W / 4)
      ctx.beginPath()
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * W
        const y = cy + waveY(band, x, t)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
    }

    // ── Render loop ─────────────────────────────────────────────────────
    let t = 0
    function draw() {
      // Hard clear — no trail, bands are fully re-drawn each frame
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)

      for (const band of bands) {
        const [hA, sA, lA, aA] = band.colorA
        const [hB, sB, lB, aB] = band.colorB

        // Horizontal gradient across the band fill
        const grad = ctx.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0,    `hsla(${hA},${sA}%,${lA}%,${aA})`)
        grad.addColorStop(0.35, `hsla(${hB},${sB}%,${lB}%,${aB * 0.7})`)
        grad.addColorStop(0.65, `hsla(${hB},${sB}%,${lB}%,${aB})`)
        grad.addColorStop(1,    `hsla(${hA},${sA}%,${lA}%,${aA})`)

        // Filled band
        bandPath(band, t)
        ctx.fillStyle = grad
        ctx.fill()

        // Bright crest stroke
        if (band.strokeAlpha > 0.1) {
          crestPath(band, t)
          const sg = ctx.createLinearGradient(0, 0, W, 0)
          sg.addColorStop(0,    `hsla(${hB},${sB}%,${lB + 10}%,0)`)
          sg.addColorStop(0.3,  `hsla(${hB},${sB}%,${lB + 10}%,${band.strokeAlpha * 0.6})`)
          sg.addColorStop(0.6,  `hsla(${hB},${sB}%,${lB + 10}%,${band.strokeAlpha})`)
          sg.addColorStop(1,    `hsla(${hB},${sB}%,${lB + 10}%,0)`)
          ctx.strokeStyle = sg
          ctx.lineWidth   = Math.max(1, band.halfH * H * 0.18)
          ctx.lineCap     = "round"
          ctx.shadowColor = `hsla(${hB},100%,80%,0.35)`
          ctx.shadowBlur  = 8
          ctx.stroke()
          ctx.shadowBlur  = 0
        }
      }

      // Speed: ~0.008 rad/frame → one full wave cycle ≈ 785 frames ≈ 13s at 60fps
      t += 0.008
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden relative" style={{ background: "rgb(2,8,28)" }}>
      <FlowBackground />

      {/* dim overlay so content stays readable */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 90% 80% at 65% 45%, transparent 20%, rgba(2,8,28,0.55) 100%)",
          zIndex: 1,
        }}
      />

      {/* all content sits above canvas + overlay */}
      <div className="relative" style={{ zIndex: 2 }}>

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav
        className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto"
      >
        <Logo variant="dark" size="md" />
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="text-sm font-medium text-white/60 hover:text-white transition-colors px-3 py-2">
            Sign In
          </Link>
          <Link
            href="/auth/register"
            className="btn-glow inline-flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
          >
            Start Free Trial
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-8 pt-16 pb-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left: copy */}
        <div className="animate-fade-in-up">
          <div
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium mb-6"
            style={{
              background: "hsl(243 75% 59% / 0.15)",
              borderColor: "hsl(243 75% 59% / 0.35)",
              color: "hsl(243 75% 80%)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Lead Generation for YouTube Agencies
          </div>

          <h1 className="text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.08] mb-6 text-white">
            Find & Close<br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(243 75% 70%), hsl(280 75% 75%))" }}
            >
              YouTube Clients
            </span><br />
            on Autopilot
          </h1>

          <p className="text-lg leading-relaxed mb-8 max-w-lg" style={{ color: "rgba(255,255,255,0.6)" }}>
            Stop manually searching YouTube. Our AI discovers channels, scores their fit 0–100,
            and writes personalized cold emails — all automatically.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-10">
            <Link
              href="/auth/register"
              className="btn-glow inline-flex items-center gap-2 text-white px-7 py-3.5 rounded-xl font-bold text-base transition-all"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              Start Free — No Credit Card
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 border px-7 py-3.5 rounded-xl font-bold text-base transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)" }}
            >
              Sign In
            </Link>
          </div>

          {/* Social proof row */}
          <div className="flex flex-wrap items-center gap-5">
            {[
              "No credit card",
              "14-day free trial",
              "Cancel anytime",
            ].map((item) => (
              <span key={item} className="flex items-center gap-1.5 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Right: animated visual */}
        <div className="relative flex items-center justify-center h-80 lg:h-96 select-none">
          <div
            className="absolute inset-0 rounded-3xl"
            style={{
              background: "radial-gradient(ellipse at center, hsl(243 75% 59% / 0.12) 0%, transparent 70%)",
              filter: "blur(30px)",
            }}
          />

          <div
            className="animate-float-slow absolute z-10 rounded-2xl border shadow-2xl p-4 w-56"
            style={{ top: "8%", left: "5%", animationDuration: "5s", background: "rgba(15,18,40,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0">
                <Search className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Africa Facts</p>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>23 channels found</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {[
                { name: "TopLux World", score: 92, color: "from-emerald-500 to-teal-400" },
                { name: "Finance Insider", score: 87, color: "from-indigo-500 to-violet-500" },
                { name: "Mega Projects", score: 81, color: "from-blue-500 to-cyan-400" },
              ].map((ch) => (
                <div key={ch.name} className="flex items-center justify-between rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <span className="text-[11px] font-medium text-white/80 truncate">{ch.name}</span>
                  <span className={`text-[11px] font-bold bg-gradient-to-r ${ch.color} bg-clip-text text-transparent`}>{ch.score}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="animate-float absolute z-10 rounded-2xl border shadow-xl p-4 w-44"
            style={{ bottom: "5%", right: "2%", animationDuration: "4s", animationDelay: "0.5s", background: "rgba(15,18,40,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.1)" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Lead Score</p>
            <div className="flex items-end gap-1 mb-2">
              <span className="text-4xl font-extrabold bg-gradient-to-br from-emerald-400 to-teal-300 bg-clip-text text-transparent">92</span>
              <span className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>/100</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" />
            </div>
            <p className="text-[10px] text-emerald-400 font-semibold mt-1.5">🔥 Hot Lead</p>
          </div>

          <div
            className="animate-float-reverse absolute z-10 rounded-2xl border shadow-xl p-3 w-52"
            style={{ top: "15%", right: "0%", animationDuration: "6s", background: "rgba(15,18,40,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Mail className="h-3.5 w-3.5 text-indigo-400" />
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>AI Email Draft</p>
            </div>
            <div className="space-y-1">
              {[1, 0.8, 1, 0.6].map((w, i) => (
                <div key={i} className="h-2 rounded" style={{ width: `${w * 100}%`, background: "rgba(255,255,255,0.1)" }} />
              ))}
            </div>
            <div className="mt-2.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-white text-center" style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}>
              Generated ✓
            </div>
          </div>

          <div className="animate-block-1 absolute" style={{ left: "38%", top: "30%" }}>
            <div className="w-20 h-20 rounded-3xl shadow-2xl" style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 65%))", boxShadow: "0 24px 50px hsl(243 75% 59% / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.2)" }} />
          </div>
          <div className="animate-block-2 absolute" style={{ left: "22%", top: "52%" }}>
            <div className="w-11 h-11 rounded-2xl shadow-xl" style={{ background: "linear-gradient(135deg, hsl(190 85% 55%), hsl(210 85% 55%))", boxShadow: "0 14px 28px hsl(190 85% 55% / 0.45)" }} />
          </div>
          <div className="animate-block-3 absolute" style={{ right: "30%", bottom: "18%" }}>
            <div className="w-7 h-7 rounded-xl shadow-lg" style={{ background: "linear-gradient(135deg, hsl(38 95% 62%), hsl(20 90% 55%))", boxShadow: "0 10px 20px hsl(38 95% 60% / 0.45)" }} />
          </div>
          <div className="animate-block-4 absolute" style={{ left: "28%", top: "12%" }}>
            <div className="w-6 h-6 rounded-lg shadow-lg" style={{ background: "linear-gradient(135deg, hsl(330 80% 65%), hsl(350 75% 60%))", boxShadow: "0 8px 16px hsl(330 80% 65% / 0.45)" }} />
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────── */}
      <section className="border-y py-10" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
        <div className="max-w-5xl mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "10,000+", label: "Channels Analyzed" },
            { value: "0–100",   label: "Lead Score Precision" },
            { value: "9 Stage", label: "CRM Pipeline" },
            { value: "30s",     label: "Avg Email Generation" },
          ].map((stat) => (
            <div key={stat.label} className="animate-fade-in-up">
              <p className="text-3xl font-extrabold bg-clip-text text-transparent mb-1" style={{ backgroundImage: "linear-gradient(135deg, hsl(243 75% 70%), hsl(280 75% 75%))" }}>
                {stat.value}
              </p>
              <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-8 py-24">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-extrabold tracking-tight mb-3 text-white">
            Everything you need to{" "}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, hsl(243 75% 70%), hsl(280 75% 75%))" }}>
              close more deals
            </span>
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
            One platform from channel discovery to signed client.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 stagger-children">
          {FEATURES.map((f) => (
            <div key={f.title} className="animate-fade-in-up rounded-2xl border p-6 shadow-sm group transition-all hover:border-white/20" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl mb-5 shadow-sm bg-gradient-to-br ${f.gradient}`}>
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-bold text-base mb-2 text-white group-hover:text-indigo-300 transition-colors">{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="border-y py-20 px-8" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-extrabold tracking-tight mb-3 text-white">How it works</h2>
            <p className="text-lg" style={{ color: "rgba(255,255,255,0.5)" }}>From zero to booked call in minutes</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Type your niche", desc: "Enter keywords like \"faceless Africa top 10\" or pick from 15 preset templates. AI expands your search automatically.", gradient: "from-indigo-500 to-violet-500" },
              { step: "02", title: "AI scores every channel", desc: "8-factor algorithm: growth, view velocity, editing quality gaps, outsourcing signals, revenue potential — scored 0–100.", gradient: "from-blue-500 to-cyan-400" },
              { step: "03", title: "Send & track outreach", desc: "One-click personalized email per channel. Track opens, replies, and deals in the built-in CRM pipeline.", gradient: "from-emerald-500 to-teal-400" },
            ].map((item) => (
              <div key={item.step} className="relative animate-fade-in-up">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${item.gradient} text-white font-extrabold text-sm mb-4 shadow-sm`}>{item.step}</div>
                <h3 className="font-bold text-lg mb-2 text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="py-24 px-8">
        <div className="max-w-4xl mx-auto rounded-3xl p-12 text-center text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(243 75% 35%), hsl(280 75% 40%))", boxShadow: "0 0 80px hsl(243 75% 40% / 0.4)" }}>
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20" style={{ background: "radial-gradient(circle, white, transparent)" }} />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-10" style={{ background: "radial-gradient(circle, white, transparent)" }} />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 text-sm font-medium mb-5 border border-white/20">
              <Target className="h-3.5 w-3.5" />
              14-day free trial · No credit card
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">Ready to fill your pipeline?</h2>
            <p className="text-white/75 text-lg mb-8 max-w-lg mx-auto">Stop spending hours on manual YouTube research. Let AI do the heavy lifting.</p>
            <Link href="/auth/register" className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold px-8 py-4 rounded-2xl text-base hover:bg-white/90 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5">
              Create Free Account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t py-8 px-8" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Logo variant="dark" size="sm" />
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>© 2026 StuckLead Operator. AI-powered YouTube lead generation.</p>
        </div>
      </footer>

      </div>{/* /relative z-2 */}
    </div>
  )
}

const FEATURES = [
  { icon: Search,       title: "AI Lead Discovery",       desc: "Enter keywords and AI searches YouTube via video content — not just channel names — returning the most relevant channels sorted by frequency and fit.",           gradient: "from-indigo-500 to-violet-500" },
  { icon: BarChart3,    title: "Channel Analysis",         desc: "Instant analysis: growth velocity, editing quality gaps, revenue estimates, outsourcing signals, and upload frequency per channel.",                              gradient: "from-blue-500 to-cyan-400" },
  { icon: Mail,         title: "AI Outreach Generator",    desc: "Generate hyper-personalized cold emails referencing specific channel data. Sound human, not templated. One click per lead.",                                     gradient: "from-emerald-500 to-teal-400" },
  { icon: KanbanSquare, title: "CRM Pipeline",             desc: "Drag-and-drop kanban with 9 stages from New to Won. Track every lead, follow-up reminders, deal values, and activity history.",                                  gradient: "from-amber-400 to-orange-400" },
  { icon: TrendingUp,   title: "Lead Scoring (0–100)",     desc: "8-factor algorithm weighing growth velocity, view counts, editing quality gaps, and outsourcing probability. Always know who to contact first.",                  gradient: "from-rose-500 to-pink-500" },
  { icon: Ghost,        title: "Faceless Detection",       desc: "Automatically identify stock-footage and voiceover channels using pattern analysis — perfect for editors targeting faceless content creators.",                   gradient: "from-violet-500 to-purple-500" },
]
