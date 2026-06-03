import Link from "next/link"
import {
  Search, BarChart3, KanbanSquare, Mail, TrendingUp,
  ArrowRight, Sparkles, Ghost, Target, CheckCircle2,
} from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { SplineBackground } from "@/components/ui/spline-background"

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <SplineBackground />

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="relative z-10">

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
      <section className="max-w-7xl mx-auto px-8 pt-16 pb-20 flex flex-col items-start">
        <div className="animate-fade-in-up max-w-2xl">
          <div
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium mb-6"
            style={{
              background: "hsl(243 75% 59% / 0.12)",
              borderColor: "hsl(243 75% 59% / 0.3)",
              color: "hsl(243 90% 80%)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Lead Generation for YouTube Agencies
          </div>

          <h1 className="text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.08] mb-6 text-white">
            Find & Close<br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(243 90% 80%), hsl(280 85% 80%))" }}
            >
              YouTube Clients
            </span><br />
            on Autopilot
          </h1>

          <p className="text-lg text-white/55 leading-relaxed mb-8 max-w-lg">
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
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-base text-white/80 hover:text-white transition-colors"
              style={{ background: "hsl(0 0% 100% / 0.08)", border: "1px solid hsl(0 0% 100% / 0.15)" }}
            >
              Sign In
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            {["No credit card", "14-day free trial", "Cancel anytime"].map((item) => (
              <span key={item} className="flex items-center gap-1.5 text-sm text-white/40">
                <CheckCircle2 className="h-4 w-4 text-emerald-400/70 shrink-0" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid hsl(0 0% 100% / 0.08)", borderBottom: "1px solid hsl(0 0% 100% / 0.08)", background: "hsl(0 0% 0% / 0.35)", backdropFilter: "blur(20px)" }} className="py-10">
        <div className="max-w-5xl mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "10,000+", label: "Channels Analyzed" },
            { value: "0–100", label: "Lead Score Precision" },
            { value: "9 Stage", label: "CRM Pipeline" },
            { value: "30s", label: "Avg Email Generation" },
          ].map((stat) => (
            <div key={stat.label} className="animate-fade-in-up">
              <p
                className="text-3xl font-extrabold bg-clip-text text-transparent mb-1"
                style={{ backgroundImage: "linear-gradient(135deg, hsl(243 90% 80%), hsl(280 85% 80%))" }}
              >
                {stat.value}
              </p>
              <p className="text-sm text-white/40 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-8 py-24">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-extrabold tracking-tight mb-3 text-white">
            Everything you need to{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(243 90% 80%), hsl(280 85% 80%))" }}
            >
              close more deals
            </span>
          </h2>
          <p className="text-white/45 text-lg max-w-xl mx-auto">
            One platform from channel discovery to signed client.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="animate-fade-in-up feature-card rounded-2xl p-6"
            >
              <div
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl mb-5 bg-gradient-to-br ${f.gradient}`}
              >
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-bold text-base mb-2 text-white/90">{f.title}</h3>
              <p className="text-sm text-white/45 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid hsl(0 0% 100% / 0.08)", borderBottom: "1px solid hsl(0 0% 100% / 0.08)", background: "hsl(0 0% 0% / 0.35)", backdropFilter: "blur(20px)" }} className="py-20 px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-extrabold tracking-tight mb-3 text-white">How it works</h2>
            <p className="text-white/45 text-lg">From zero to booked call in minutes</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Type your niche",
                desc: "Enter keywords like \"faceless Africa top 10\" or pick from 15 preset templates. AI expands your search automatically.",
                gradient: "from-indigo-500 to-violet-500",
              },
              {
                step: "02",
                title: "AI scores every channel",
                desc: "8-factor algorithm: growth, view velocity, editing quality gaps, outsourcing signals, revenue potential — scored 0–100.",
                gradient: "from-blue-500 to-cyan-400",
              },
              {
                step: "03",
                title: "Send & track outreach",
                desc: "One-click personalized email per channel. Track opens, replies, and deals in the built-in CRM pipeline.",
                gradient: "from-emerald-500 to-teal-400",
              },
            ].map((item) => (
              <div key={item.step} className="relative animate-fade-in-up">
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${item.gradient} text-white font-extrabold text-sm mb-4`}
                >
                  {item.step}
                </div>
                <h3 className="font-bold text-lg mb-2 text-white/90">{item.title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="py-24 px-8">
        <div
          className="max-w-4xl mx-auto rounded-3xl p-12 text-center text-white relative overflow-hidden"
          style={{
            background: "hsl(0 0% 0% / 0.5)",
            border: "1px solid hsl(0 0% 100% / 0.1)",
            backdropFilter: "blur(24px)",
          }}
        >
          <div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(243 75% 59% / 0.15), transparent 70%)" }}
          />
          <div className="relative z-10">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium mb-5"
              style={{
                background: "hsl(243 75% 59% / 0.15)",
                border: "1px solid hsl(243 75% 59% / 0.3)",
                color: "hsl(243 90% 80%)",
              }}
            >
              <Target className="h-3.5 w-3.5" />
              14-day free trial · No credit card
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">
              Ready to fill your pipeline?
            </h2>
            <p className="text-white/50 text-lg mb-8 max-w-lg mx-auto">
              Stop spending hours on manual YouTube research. Let AI do the heavy lifting.
            </p>
            <Link
              href="/auth/register"
              className="btn-glow inline-flex items-center gap-2 text-white font-bold px-8 py-4 rounded-2xl text-base"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              Create Free Account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid hsl(0 0% 100% / 0.08)", background: "hsl(0 0% 0% / 0.4)", backdropFilter: "blur(20px)" }} className="py-8 px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Logo variant="dark" size="sm" />
          <p className="text-xs text-white/25">© 2026 StuckLead Operator. AI-powered YouTube lead generation.</p>
        </div>
      </footer>

      </div>
    </div>
  )
}

const FEATURES = [
  {
    icon: Search,
    title: "AI Lead Discovery",
    desc: "Enter keywords and AI searches YouTube via video content — not just channel names — returning the most relevant channels sorted by frequency and fit.",
    gradient: "from-indigo-500 to-violet-500",
  },
  {
    icon: BarChart3,
    title: "Channel Analysis",
    desc: "Instant analysis: growth velocity, editing quality gaps, revenue estimates, outsourcing signals, and upload frequency per channel.",
    gradient: "from-blue-500 to-cyan-400",
  },
  {
    icon: Mail,
    title: "AI Outreach Generator",
    desc: "Generate hyper-personalized cold emails referencing specific channel data. Sound human, not templated. One click per lead.",
    gradient: "from-emerald-500 to-teal-400",
  },
  {
    icon: KanbanSquare,
    title: "CRM Pipeline",
    desc: "Drag-and-drop kanban with 9 stages from New to Won. Track every lead, follow-up reminders, deal values, and activity history.",
    gradient: "from-amber-400 to-orange-400",
  },
  {
    icon: TrendingUp,
    title: "Lead Scoring (0–100)",
    desc: "8-factor algorithm weighing growth velocity, view counts, editing quality gaps, and outsourcing probability. Always know who to contact first.",
    gradient: "from-rose-500 to-pink-500",
  },
  {
    icon: Ghost,
    title: "Faceless Detection",
    desc: "Automatically identify stock-footage and voiceover channels using pattern analysis — perfect for editors targeting faceless content creators.",
    gradient: "from-violet-500 to-purple-500",
  },
]
