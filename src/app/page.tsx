"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Search, BarChart3, Mail, KanbanSquare, TrendingUp, Sparkles,
  Zap, ArrowRight, CheckCircle2, BadgeCheck, Ghost,
} from "lucide-react"

const NAV_LINKS = ["Home", "Features", "Pricing", "Use Cases", "About"]

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4"

const FEATURES = [
  {
    icon: Search, color: "#7c3aed",
    title: "AI Lead Discovery",
    desc: "Enter keywords and AI searches YouTube via video content — not just channel names — returning the most relevant channels sorted by frequency and fit.",
  },
  {
    icon: BarChart3, color: "#0ea5e9",
    title: "Channel Analysis",
    desc: "Instant analysis: growth velocity, editing quality gaps, revenue estimates, outsourcing signals, and upload frequency per channel.",
  },
  {
    icon: Mail, color: "#10b981",
    title: "AI Outreach Generator",
    desc: "Generate hyper-personalized cold emails referencing specific channel data. Sound human, not templated. One click per lead.",
  },
  {
    icon: KanbanSquare, color: "#f59e0b",
    title: "CRM Pipeline",
    desc: "Drag-and-drop kanban with 9 stages from New to Won. Track every lead, follow-up reminders, deal values, and activity history.",
  },
  {
    icon: TrendingUp, color: "#ef4444",
    title: "Lead Scoring (0–100)",
    desc: "8-factor algorithm weighing growth velocity, view counts, editing quality gaps, and outsourcing probability.",
  },
  {
    icon: Ghost, color: "#a855f7",
    title: "Faceless Detection",
    desc: "Automatically identify stock-footage and voiceover channels using pattern analysis — perfect for editors targeting faceless creators.",
  },
]

const USERS = ["Alex Riv", "Jordan M.", "Sarah K.", "Liam Chen", "Mia Soto", "David Ross"]

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-x-hidden antialiased"
      style={{ backgroundColor: "#0b0812", color: "#e7e0ed" }}
    >
      {/* ── Video background (hero) ──────────────────────────────────── */}
      <div className="absolute top-0 left-0 w-full h-screen z-0 pointer-events-none overflow-hidden">
        <video
          className="w-full h-full object-cover"
          autoPlay muted loop playsInline
          src={VIDEO_URL}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0b0812]/80 to-[#0b0812]" />
      </div>

      {/* Blurred glow orb */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[984px] h-[527px] opacity-60 pointer-events-none z-0"
        style={{ background: "#1e1b4b", filter: "blur(120px)" }}
      />

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col min-h-screen w-full">
        <div className="w-full max-w-[1280px] mx-auto flex flex-col min-h-screen">

          {/* ── Nav ───────────────────────────────────────────────────── */}
          <nav
            className="w-full py-5 px-8 flex justify-between items-center relative transition-all duration-500"
            style={{
              background: scrolled ? "rgba(11,8,18,0.85)" : "transparent",
              backdropFilter: scrolled ? "blur(20px)" : "none",
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            {/* Logo */}
            <span
              className="font-bold text-lg tracking-tight select-none text-white"
              style={{ fontFamily: "'General Sans', sans-serif" }}
            >
              StuckLead
            </span>

            {/* Nav links */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map((item, i) => (
                <a
                  key={item}
                  href="#"
                  className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150"
                  style={{ color: i === 0 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.95)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = i === 0 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)")}
                >
                  {item}
                </a>
              ))}
            </div>

            {/* CTA */}
            <div className="flex items-center gap-3">
              <Link
                href="/auth/login"
                className="text-sm font-semibold transition-colors duration-150"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                className="inline-flex items-center rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
                style={{ background: "linear-gradient(135deg, #8b5cf6, #d946ef)", boxShadow: "0 0 20px rgba(139,92,246,0.4)" }}
              >
                Start Free Trial
              </Link>
            </div>

            {/* Divider */}
            <div
              className="absolute bottom-0 left-0 w-full h-px"
              style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)" }}
            />
          </nav>

          {/* ── Hero ──────────────────────────────────────────────────── */}
          <main className="flex-grow flex flex-col items-center justify-center text-center px-4 pt-20 pb-20">
            <h1
              className="text-4xl md:text-7xl lg:text-[96px] leading-[1.05] tracking-tight font-bold flex flex-wrap justify-center items-center gap-x-4 gap-y-2 mb-6"
              style={{ fontFamily: "'General Sans', sans-serif", color: "#e7e0ed" }}
            >
              Find More Clients Without Spending Hours on{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(to left, #6366f1, #a855f7, #fcd34d)" }}
              >
                Outreach.
              </span>
            </h1>

            <p
              className="text-base md:text-lg leading-relaxed mb-8 max-w-md mx-auto"
              style={{ color: "rgba(203,195,215,0.8)" }}
            >
              Stop manually searching for clients. StuckLead finds leads, writes outreach emails,
              and helps you grow your editing business automatically.
            </p>

            <div className="flex flex-col items-center gap-8">
              <div className="flex flex-wrap justify-center items-center gap-4">
                <Link
                  href="/auth/register"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-bold text-lg transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, #8b5cf6, #d946ef)",
                    boxShadow: "0 0 20px rgba(139,92,246,0.4)",
                    borderTop: "1px solid rgba(255,255,255,0.2)",
                  }}
                >
                  Start Free — No Credit Card
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/auth/login"
                  className="liquid-glass px-8 py-4 rounded-xl text-white font-bold text-lg hover:bg-white/10 transition-all hover:scale-105"
                >
                  Sign In
                </Link>
              </div>

              <div className="flex flex-wrap justify-center items-center gap-6" style={{ color: "rgba(203,195,215,0.8)" }}>
                {["No credit card", "14-day free trial", "Cancel anytime"].map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-5 w-5 text-[#10b981] shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </main>

          {/* ── Marquee ───────────────────────────────────────────────── */}
          <div
            className="w-full pb-12 overflow-hidden pt-6 flex flex-col md:flex-row items-center justify-between px-10 gap-6"
            style={{ borderTop: "1px solid rgba(73,68,84,0.3)" }}
          >
            <div
              className="text-xs font-semibold shrink-0 uppercase tracking-widest text-center md:text-left"
              style={{ color: "rgba(203,195,215,0.5)" }}
            >
              Trusted by<br />editors
            </div>
            <div
              className="w-full overflow-hidden flex relative"
              style={{ maskImage: "linear-gradient(to right, transparent 0, black 128px, black calc(100% - 128px), transparent 100%)" }}
            >
              <div className="flex items-center gap-12 w-max animate-marquee shrink-0">
                {[...USERS, ...USERS].map((name, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="liquid-glass w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                      style={{ color: "#d0bcff" }}
                    >
                      {name[0]}
                    </div>
                    <span className="font-semibold text-sm whitespace-nowrap" style={{ color: "#e7e0ed" }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── How It Works ──────────────────────────────────────────── */}
        <section className="w-full max-w-[1280px] mx-auto py-24 px-6 md:px-10">
          <div className="text-center mb-16">
            <h2
              className="text-4xl md:text-5xl font-bold mb-4"
              style={{ fontFamily: "'General Sans', sans-serif", color: "#e7e0ed", letterSpacing: "-0.02em" }}
            >
              How it works
            </h2>
            <p className="text-lg" style={{ color: "rgba(203,195,215,0.8)" }}>From zero to booked call in minutes</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            {[
              {
                n: "01", color: "#7c3aed", shadow: "rgba(124,58,237,0.3)",
                title: "Type your niche",
                desc: 'Enter keywords like "faceless Africa top 10" or pick from 15 preset templates. AI expands your search automatically.',
              },
              {
                n: "02", color: "#0ea5e9", shadow: "rgba(14,165,233,0.3)",
                title: "AI scores every channel",
                desc: "8-factor algorithm: growth, view velocity, editing quality gaps, outsourcing signals, revenue potential — scored 0–100.",
              },
              {
                n: "03", color: "#10b981", shadow: "rgba(16,185,129,0.3)",
                title: "Send & track outreach",
                desc: "One-click personalized email per channel. Track opens, replies, and deals in the built-in CRM pipeline.",
              },
            ].map(step => (
              <div key={step.n} className="flex flex-col gap-6">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl"
                  style={{ background: step.color, boxShadow: `0 0 30px ${step.shadow}` }}
                >
                  {step.n}
                </div>
                <div>
                  <h3
                    className="text-2xl font-semibold mb-3"
                    style={{ fontFamily: "'General Sans', sans-serif", color: "#e7e0ed" }}
                  >
                    {step.title}
                  </h3>
                  <p className="leading-relaxed" style={{ color: "rgba(203,195,215,0.8)" }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────── */}
        <section className="w-full max-w-[1280px] mx-auto py-24 px-6 md:px-10">
          <div className="text-center mb-16">
            <h2
              className="text-4xl md:text-5xl font-bold mb-4"
              style={{ fontFamily: "'General Sans', sans-serif", color: "#e7e0ed", letterSpacing: "-0.02em" }}
            >
              Everything you need to{" "}
              <span style={{ color: "#a855f7" }}>close more deals</span>
            </h2>
            <p className="text-lg" style={{ color: "rgba(203,195,215,0.8)" }}>One platform from channel discovery to signed client.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="liquid-glass p-8 rounded-2xl flex flex-col gap-6 hover:bg-[#2c2832] transition-colors duration-300"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: f.color }}
                >
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3
                    className="text-lg font-semibold mb-3"
                    style={{ color: "#e7e0ed" }}
                  >
                    {f.title}
                  </h3>
                  <p className="leading-relaxed text-sm" style={{ color: "rgba(203,195,215,0.7)" }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── AutoLead ──────────────────────────────────────────────── */}
        <section className="w-full max-w-[1280px] mx-auto py-24 px-6 md:px-10">
          <div className="liquid-glass rounded-[2rem] p-8 md:p-16 flex flex-col lg:flex-row gap-12 items-center relative overflow-hidden">
            <div
              className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
              style={{ background: "linear-gradient(135deg, rgba(30,27,75,0.5), transparent)" }}
            />

            {/* Left */}
            <div className="flex-1 relative z-10 flex flex-col gap-8">
              <div>
                <div
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-6"
                  style={{
                    border: "1px solid rgba(124,58,237,0.3)",
                    background: "rgba(124,58,237,0.1)",
                    color: "#d0bcff",
                  }}
                >
                  <Zap className="h-4 w-4 fill-current" />
                  NEW — AutoLead
                </div>
                <h2
                  className="text-4xl md:text-5xl font-bold mb-6 leading-tight"
                  style={{ fontFamily: "'General Sans', sans-serif", color: "#e7e0ed" }}
                >
                  Your agency runs<br />
                  <span style={{ color: "#a855f7" }}>while you sleep</span>
                </h2>
                <p className="text-lg leading-relaxed max-w-md" style={{ color: "rgba(203,195,215,0.9)" }}>
                  AutoLead runs 24/7 in the background — discovering new YouTube channels, scoring them,
                  and sending personalized cold emails. Fully automatic.
                </p>
              </div>
              <ul className="flex flex-col gap-4">
                {[
                  "AI generates fresh keywords every cycle",
                  "Only contacts channels scoring 60+",
                  "Personalized email per channel, not templates",
                  "Choose your pace — 10 sec to 1 hour intervals",
                ].map(item => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#d0bcff] mt-0.5 shrink-0" />
                    <span style={{ color: "rgba(203,195,215,0.8)" }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-base text-white w-fit transition-all hover:scale-105 active:scale-95"
                style={{ background: "linear-gradient(135deg, #7c3aed, #d946ef)", boxShadow: "0 0 20px rgba(139,92,246,0.4)" }}
              >
                <Zap className="h-4 w-4 fill-current" />
                Try AutoLead Free
              </Link>
            </div>

            {/* Right — Dashboard mockup */}
            <div className="flex-1 w-full relative z-10">
              <div
                className="rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: "#0f0f13", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                {/* Header */}
                <div
                  className="p-6 flex justify-between items-center"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#7c3aed] flex items-center justify-center">
                      <Zap className="h-4 w-4 text-white fill-current" />
                    </div>
                    <span className="font-semibold text-white">AutoLead</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#10b981] text-xs font-bold tracking-wider">
                    <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                    RUNNING
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {[{ v: "24", l: "Found" }, { v: "18", l: "Emailed" }, { v: "18", l: "Leads" }].map((s, i) => (
                    <div
                      key={s.l}
                      className="p-6 text-center"
                      style={{ borderRight: i < 2 ? "1px solid rgba(255,255,255,0.05)" : undefined }}
                    >
                      <div className="text-3xl font-bold text-white mb-1">{s.v}</div>
                      <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Activity log */}
                <div className="p-4 flex flex-col gap-2">
                  {[
                    { icon: <Mail className="h-4 w-4 text-[#7c3aed]" />, text: "Email queued · FinanceHub Pro", time: "2s", color: "rgba(255,255,255,0.8)" },
                    { icon: <CheckCircle2 className="h-4 w-4 text-[#10b981]" />, text: "Found · TechExplained (92)", time: "4s", color: "#10b981" },
                    { icon: <CheckCircle2 className="h-4 w-4 text-[#10b981]" />, text: "Found · Africa Facts Daily (78)", time: "4s", color: "#10b981" },
                    { icon: <Search className="h-4 w-4 text-[#0ea5e9]" />, text: 'Searching · "faceless finance"', time: "6s", color: "rgba(255,255,255,0.8)" },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg flex justify-between items-center text-sm"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <span style={{ color: item.color }}>{item.text}</span>
                      </div>
                      <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{item.time}</span>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="p-4">
                  <div
                    className="rounded-lg p-3 flex justify-between items-center text-sm"
                    style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}
                  >
                    <span className="text-[#10b981]">Every 10 minutes</span>
                    <div className="flex items-center gap-1 text-[#10b981] font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      More Safe to Use
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────── */}
        <section className="w-full max-w-[1280px] mx-auto py-24 px-6 md:px-10">
          <div
            className="rounded-[2rem] p-12 md:p-24 text-center relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed, #c026d3)" }}
          >
            <div className="relative z-10 flex flex-col items-center">
              <div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-sm font-semibold mb-8"
                style={{ border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(4px)" }}
              >
                <BadgeCheck className="h-4 w-4" />
                14-day free trial · No credit card
              </div>
              <h2
                className="text-4xl md:text-6xl text-white font-bold mb-6"
                style={{ fontFamily: "'General Sans', sans-serif" }}
              >
                Ready to fill your pipeline?
              </h2>
              <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: "rgba(255,255,255,0.9)" }}>
                Stop spending hours on manual YouTube research. Let AI do the heavy lifting.
              </p>
              <Link
                href="/auth/register"
                className="inline-flex items-center gap-2 bg-white text-[#4f46e5] px-8 py-4 rounded-xl font-bold hover:bg-white/90 transition-all hover:scale-105 active:scale-95"
                style={{ boxShadow: "0 0 20px rgba(139,92,246,0.4)" }}
              >
                Create Free Account
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <footer
          className="w-full py-12 px-8 mt-auto"
          style={{ borderTop: "1px solid rgba(73,68,84,0.3)" }}
        >
          <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <span
              className="font-bold text-base tracking-tight"
              style={{ fontFamily: "'General Sans', sans-serif", color: "rgba(231,224,237,0.7)" }}
            >
              StuckLead
            </span>
            <p className="text-xs" style={{ color: "rgba(203,195,215,0.5)" }}>
              © 2026 StuckLead. AI-powered YouTube lead generation.
            </p>
            <div className="flex items-center gap-6">
              {["Privacy", "Terms", "Contact"].map(l => (
                <a
                  key={l}
                  href="#"
                  className="text-xs transition-colors hover:text-white"
                  style={{ color: "rgba(203,195,215,0.5)" }}
                >
                  {l}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
