import Link from "next/link"
import {
  Search, BarChart3, KanbanSquare, Mail, TrendingUp,
  ArrowRight, Sparkles, Ghost, Target, CheckCircle2,
} from "lucide-react"
import { Logo } from "@/components/ui/logo"

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#060612] text-white">

      {/* ── Background orbs ──────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Primary orb — indigo/violet */}
        <div
          className="animate-orb-1 absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full opacity-40"
          style={{
            background: "radial-gradient(circle at center, hsl(243 75% 55%), hsl(265 80% 40%) 50%, transparent 75%)",
            filter: "blur(60px)",
          }}
        />
        {/* Secondary orb — purple/pink */}
        <div
          className="animate-orb-2 absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full opacity-35"
          style={{
            background: "radial-gradient(circle at center, hsl(285 85% 55%), hsl(310 80% 45%) 50%, transparent 75%)",
            filter: "blur(70px)",
          }}
        />
        {/* Tertiary orb — cyan/blue */}
        <div
          className="animate-orb-3 absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full opacity-25"
          style={{
            background: "radial-gradient(circle at center, hsl(190 85% 50%), hsl(210 90% 45%) 50%, transparent 75%)",
            filter: "blur(80px)",
          }}
        />
        {/* Accent orb — deep violet */}
        <div
          className="animate-orb-4 absolute top-2/3 left-1/2 h-[350px] w-[350px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle at center, hsl(260 90% 60%), transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(hsl(0 0% 100% / 0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.5) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 max-w-7xl mx-auto"
        style={{
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div
          className="absolute inset-0 rounded-none"
          style={{ background: "hsl(0 0% 0% / 0.3)", borderBottom: "1px solid hsl(0 0% 100% / 0.06)" }}
        />
        <div className="relative flex w-full items-center justify-between max-w-7xl">
          <Logo variant="dark" size="md" />
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-white/60 hover:text-white transition-colors duration-150 px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/auth/register"
              className="btn-glow inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative max-w-7xl mx-auto px-8 pt-24 pb-28 flex flex-col items-center text-center">
        {/* Badge */}
        <div
          className="animate-fade-in-up inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium mb-8"
          style={{
            background: "hsl(243 75% 59% / 0.12)",
            border: "1px solid hsl(243 75% 59% / 0.3)",
            color: "hsl(243 90% 80%)",
            animationDelay: "0ms",
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI-Powered Lead Generation for YouTube Agencies
        </div>

        {/* Headline */}
        <h1
          className="animate-fade-in-up text-6xl xl:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6 max-w-4xl"
          style={{ animationDelay: "60ms" }}
        >
          Find & Close{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, hsl(243 90% 75%), hsl(280 85% 75%), hsl(190 85% 65%))" }}
          >
            YouTube Clients
          </span>
          <br />on Autopilot
        </h1>

        {/* Sub */}
        <p
          className="animate-fade-in-up text-lg text-white/55 leading-relaxed mb-10 max-w-xl"
          style={{ animationDelay: "120ms" }}
        >
          Stop manually searching YouTube. Our AI discovers channels, scores their fit 0–100,
          and writes personalized cold emails — all automatically.
        </p>

        {/* CTAs */}
        <div
          className="animate-fade-in-up flex flex-wrap items-center justify-center gap-3 mb-12"
          style={{ animationDelay: "180ms" }}
        >
          <Link
            href="/auth/register"
            className="btn-glow inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-base text-white transition-all"
            style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}
          >
            Start Free — No Credit Card
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-base text-white/80 hover:text-white transition-colors"
            style={{ background: "hsl(0 0% 100% / 0.07)", border: "1px solid hsl(0 0% 100% / 0.12)" }}
          >
            Sign In
          </Link>
        </div>

        {/* Social proof */}
        <div
          className="animate-fade-in-up flex flex-wrap items-center justify-center gap-6"
          style={{ animationDelay: "240ms" }}
        >
          {["No credit card", "14-day free trial", "Cancel anytime"].map((item) => (
            <span key={item} className="flex items-center gap-1.5 text-sm text-white/45">
              <CheckCircle2 className="h-4 w-4 text-emerald-400/80 shrink-0" />
              {item}
            </span>
          ))}
        </div>

        {/* Hero UI mockup */}
        <div
          className="animate-fade-in-up relative mt-20 w-full max-w-3xl mx-auto rounded-2xl overflow-hidden"
          style={{
            animationDelay: "320ms",
            background: "hsl(0 0% 100% / 0.04)",
            border: "1px solid hsl(0 0% 100% / 0.1)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 40px 120px hsl(243 75% 20% / 0.6), 0 0 0 1px hsl(0 0% 100% / 0.05)",
          }}
        >
          {/* Mockup title bar */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderBottom: "1px solid hsl(0 0% 100% / 0.07)", background: "hsl(0 0% 100% / 0.03)" }}
          >
            <div className="h-3 w-3 rounded-full bg-red-400/60" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
            <div className="h-3 w-3 rounded-full bg-emerald-400/60" />
            <span className="ml-3 text-xs text-white/30 font-medium">ReachFlow — AI Discover</span>
          </div>
          {/* Mockup content */}
          <div className="p-6 grid grid-cols-3 gap-3">
            {[
              { name: "TopLux World", score: 92, subs: "284K", trend: "↑ Growing", trendColor: "text-emerald-400" },
              { name: "Finance Insider", score: 87, subs: "142K", trend: "→ Stable", trendColor: "text-blue-400" },
              { name: "Mega Projects", score: 81, subs: "98K", trend: "↑ Growing", trendColor: "text-emerald-400" },
            ].map((ch, i) => (
              <div
                key={ch.name}
                className="rounded-xl p-4"
                style={{
                  background: "hsl(0 0% 100% / 0.05)",
                  border: "1px solid hsl(0 0% 100% / 0.08)",
                  animationDelay: `${400 + i * 60}ms`,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center text-xs font-black"
                    style={{ background: "linear-gradient(135deg, hsl(243 75% 50%), hsl(280 75% 55%))" }}
                  >
                    {ch.name[0]}
                  </div>
                  <span
                    className="text-2xl font-extrabold tabular-nums bg-clip-text text-transparent"
                    style={{ backgroundImage: "linear-gradient(135deg, hsl(150 80% 55%), hsl(190 85% 55%))" }}
                  >
                    {ch.score}
                  </span>
                </div>
                <p className="text-sm font-semibold text-white/90 truncate mb-0.5">{ch.name}</p>
                <p className="text-xs text-white/40">{ch.subs} subs</p>
                <p className={`text-xs font-medium mt-1 ${ch.trendColor}`}>{ch.trend}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <section
        className="relative py-14"
        style={{ borderTop: "1px solid hsl(0 0% 100% / 0.07)", borderBottom: "1px solid hsl(0 0% 100% / 0.07)" }}
      >
        <div className="max-w-5xl mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "10,000+", label: "Channels Analyzed" },
            { value: "0–100", label: "Lead Score Precision" },
            { value: "9 Stage", label: "CRM Pipeline" },
            { value: "30s", label: "Avg Email Generation" },
          ].map((stat) => (
            <div key={stat.label}>
              <p
                className="text-3xl font-extrabold bg-clip-text text-transparent mb-1"
                style={{ backgroundImage: "linear-gradient(135deg, hsl(243 90% 75%), hsl(280 85% 75%))" }}
              >
                {stat.value}
              </p>
              <p className="text-sm text-white/40 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-8 py-28">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold tracking-tight mb-4">
            Everything you need to{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(243 90% 75%), hsl(280 85% 75%))" }}
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
              className="animate-fade-in-up group rounded-2xl p-6 transition-all duration-300"
              style={{
                background: "hsl(0 0% 100% / 0.04)",
                border: "1px solid hsl(0 0% 100% / 0.08)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "hsl(0 0% 100% / 0.07)"
                ;(e.currentTarget as HTMLDivElement).style.borderColor = "hsl(0 0% 100% / 0.14)"
                ;(e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "hsl(0 0% 100% / 0.04)"
                ;(e.currentTarget as HTMLDivElement).style.borderColor = "hsl(0 0% 100% / 0.08)"
                ;(e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"
              }}
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

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section
        className="relative py-24 px-8"
        style={{ borderTop: "1px solid hsl(0 0% 100% / 0.07)" }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold tracking-tight mb-3">How it works</h2>
            <p className="text-white/45 text-lg">From zero to booked call in minutes</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
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
            ].map((item, i) => (
              <div key={item.step} className="relative">
                {i < 2 && (
                  <div
                    className="hidden md:block absolute top-5 left-full w-full h-px"
                    style={{ background: "linear-gradient(90deg, hsl(0 0% 100% / 0.15), transparent)" }}
                  />
                )}
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${item.gradient} text-white font-extrabold text-sm mb-5`}
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

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="relative py-28 px-8">
        <div
          className="max-w-3xl mx-auto rounded-3xl p-16 text-center relative overflow-hidden"
          style={{
            background: "hsl(0 0% 100% / 0.04)",
            border: "1px solid hsl(0 0% 100% / 0.1)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Inner glow */}
          <div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, hsl(243 75% 59% / 0.2), transparent 70%)",
            }}
          />
          <div className="relative z-10">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium mb-6"
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
            <p className="text-white/45 text-lg mb-10 max-w-lg mx-auto">
              Stop spending hours on manual YouTube research. Let AI do the heavy lifting.
            </p>
            <Link
              href="/auth/register"
              className="btn-glow inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-base text-white"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}
            >
              Create Free Account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer
        className="relative py-8 px-8"
        style={{ borderTop: "1px solid hsl(0 0% 100% / 0.07)" }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Logo variant="dark" size="sm" />
          <p className="text-xs text-white/25">© 2026 ReachFlow. AI-powered YouTube lead generation.</p>
        </div>
      </footer>
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
    desc: "Automatically identify stock-footage and voiceover channels using AI Vision + transcript analysis — perfect for editors targeting faceless creators.",
    gradient: "from-violet-500 to-purple-500",
  },
]
