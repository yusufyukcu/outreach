"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

const NAV_LINKS = ["Home", "Features", "Pricing", "Use Cases", "About"]

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scrolled, setScrolled] = useState(false)

  // ── Glass nav scroll effect ─────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // ── Canvas: flowing light-streak background ─────────────────────────────
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
    }
    resize()
    window.addEventListener("resize", resize)

    // Each streak: a bezier path that drifts slowly
    type Streak = {
      x: number; y: number
      cx1: number; cy1: number
      cx2: number; cy2: number
      ex: number; ey: number
      hue: number        // 200-230 blue, 30-45 amber
      alpha: number
      width: number
      speed: number
      phase: number
    }

    function randStreak(): Streak {
      const isAmber = Math.random() < 0.25
      const startX  = Math.random() * W * 0.6
      const startY  = Math.random() * H
      return {
        x: startX,
        y: startY,
        cx1: startX + (Math.random() - 0.3) * W * 0.5,
        cy1: startY + (Math.random() - 0.5) * H * 0.4,
        cx2: startX + W * (0.4 + Math.random() * 0.4),
        cy2: startY + (Math.random() - 0.5) * H * 0.4,
        ex: startX + W * (0.5 + Math.random() * 0.5),
        ey: startY + (Math.random() - 0.5) * H * 0.5,
        hue: isAmber ? 30 + Math.random() * 20 : 195 + Math.random() * 35,
        alpha: 0.18 + Math.random() * 0.32,
        width: 2 + Math.random() * 6,
        speed: 0.0003 + Math.random() * 0.0005,
        phase: Math.random() * Math.PI * 2,
      }
    }

    const COUNT = 18
    const streaks: Streak[] = Array.from({ length: COUNT }, randStreak)

    let t = 0
    function draw() {
      ctx.fillStyle = "rgba(4,6,18,0.35)"
      ctx.fillRect(0, 0, W, H)

      for (const s of streaks) {
        const wave = Math.sin(t * s.speed * 1000 + s.phase)
        const offY = wave * 60

        const grad = ctx.createLinearGradient(s.x, s.y, s.ex, s.ey + offY)
        grad.addColorStop(0,   `hsla(${s.hue},90%,65%,0)`)
        grad.addColorStop(0.3, `hsla(${s.hue},90%,65%,${s.alpha})`)
        grad.addColorStop(0.7, `hsla(${s.hue},90%,65%,${s.alpha * 0.6})`)
        grad.addColorStop(1,   `hsla(${s.hue},90%,65%,0)`)

        ctx.beginPath()
        ctx.moveTo(s.x, s.y + offY * 0.3)
        ctx.bezierCurveTo(
          s.cx1, s.cy1 + offY,
          s.cx2, s.cy2 - offY * 0.5,
          s.ex,  s.ey  + offY * 0.2,
        )
        ctx.strokeStyle = grad
        ctx.lineWidth   = s.width + Math.sin(t * s.speed * 800 + s.phase) * 1.5
        ctx.lineCap     = "round"

        // soft glow pass
        ctx.shadowColor = `hsla(${s.hue},90%,65%,0.5)`
        ctx.shadowBlur  = 18
        ctx.stroke()
        ctx.shadowBlur  = 0
      }
      t++
      raf = requestAnimationFrame(draw)
    }

    // Prime the black background
    ctx.fillStyle = "rgb(4,6,18)"
    ctx.fillRect(0, 0, W, H)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[rgb(4,6,18)]">

      {/* ── Background canvas ──────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: "block" }}
      />

      {/* ── Radial vignette overlay ────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 80% at 60% 50%, transparent 30%, rgba(4,6,18,0.7) 100%)",
        }}
      />

      {/* ── Glassmorphic navigation ────────────────────────────────────── */}
      <header
        className="fixed top-0 inset-x-0 z-50 transition-all duration-500"
        style={{
          background: scrolled
            ? "rgba(8,10,28,0.65)"
            : "rgba(8,10,28,0.35)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: scrolled
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <span className="text-white font-bold text-lg tracking-tight select-none">
            Visura
          </span>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((item, i) => (
              <a
                key={item}
                href="#"
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150"
                style={{
                  color: i === 0 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.95)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.color =
                    i === 0 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)")
                }
              >
                {item}
              </a>
            ))}
          </nav>

          {/* CTA buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-sm font-semibold text-white/70 hover:text-white transition-colors duration-150"
            >
              Login
            </Link>
            <a
              href="#"
              className="inline-flex items-center rounded-lg px-4 py-1.5 text-sm font-semibold text-black transition-all duration-150 hover:opacity-90 active:scale-95"
              style={{ background: "rgba(255,255,255,0.95)" }}
            >
              Book a live demo
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero content — bottom-left ─────────────────────────────────── */}
      <div className="relative z-10 flex min-h-screen flex-col justify-end pb-20 px-10 md:px-16 lg:px-20 pointer-events-none">
        <div
          className="max-w-lg"
          style={{ animation: "hero-rise 1s cubic-bezier(0.23,1,0.32,1) both" }}
        >
          <h1
            className="text-5xl md:text-6xl font-extrabold leading-[1.06] tracking-tight text-white mb-5"
            style={{ textShadow: "0 2px 40px rgba(0,0,0,0.5)" }}
          >
            Design Smarter.<br />
            Create Faster.
          </h1>

          <p
            className="text-sm md:text-base leading-relaxed mb-8 max-w-sm"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            Unleash your visual potential with real-time AI insights,
            smart content generation, and futuristic design tools, all
            in one platform.
          </p>

          <div className="flex items-center gap-3 pointer-events-auto">
            <a
              href="#"
              className="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-black bg-white hover:bg-white/90 active:scale-95 transition-all duration-150 shadow-lg"
            >
              Book a live demo
            </a>
          </div>
        </div>
      </div>

      {/* ── hero-rise keyframe injected inline ────────────────────────── */}
      <style>{`
        @keyframes hero-rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
