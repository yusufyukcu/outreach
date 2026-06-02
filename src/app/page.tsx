import Link from "next/link"
import {
  Search, BarChart3, KanbanSquare, Mail, TrendingUp,
  ArrowRight, Sparkles, Ghost, Target, CheckCircle2,
} from "lucide-react"
import { Logo, LogoMark } from "@/components/ui/logo"
import { SplineBackground } from "@/components/ui/spline-background"

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <SplineBackground />

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="relative z-10">

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <Logo variant="light" size="md" />
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
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
              background: "hsl(243 75% 59% / 0.08)",
              borderColor: "hsl(243 75% 59% / 0.25)",
              color: "hsl(243 75% 50%)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Lead Generation for YouTube Agencies
          </div>

          <h1 className="text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.08] mb-6">
            Find & Close<br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              YouTube Clients
            </span><br />
            on Autopilot
          </h1>

          <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">
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
              className="inline-flex items-center gap-2 border bg-white px-7 py-3.5 rounded-xl font-bold text-base hover:bg-muted transition-colors"
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
              <span key={item} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Right: animated visual */}
        <div className="relative flex items-center justify-center h-80 lg:h-96 select-none">
          {/* Glow backdrop */}
          <div
            className="absolute inset-0 rounded-3xl"
            style={{
              background: "radial-gradient(ellipse at center, hsl(243 75% 59% / 0.12) 0%, transparent 70%)",
              filter: "blur(30px)",
            }}
          />

          {/* Floating UI mock card */}
          <div
            className="animate-float-slow absolute z-10 rounded-2xl bg-white border shadow-2xl p-4 w-56"
            style={{ top: "8%", left: "5%", animationDuration: "5s" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0">
                <Search className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold">Africa Facts</p>
                <p className="text-[10px] text-muted-foreground">23 channels found</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {[
                { name: "TopLux World", score: 92, color: "from-emerald-500 to-teal-400" },
                { name: "Finance Insider", score: 87, color: "from-indigo-500 to-violet-500" },
                { name: "Mega Projects", score: 81, color: "from-blue-500 to-cyan-400" },
              ].map((ch) => (
                <div key={ch.name} className="flex items-center justify-between bg-muted/40 rounded-lg px-2.5 py-1.5">
                  <span className="text-[11px] font-medium truncate">{ch.name}</span>
                  <span
                    className={`text-[11px] font-bold bg-gradient-to-r ${ch.color} bg-clip-text text-transparent`}
                  >
                    {ch.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Score card */}
          <div
            className="animate-float absolute z-10 rounded-2xl bg-white border shadow-xl p-4 w-44"
            style={{ bottom: "5%", right: "2%", animationDuration: "4s", animationDelay: "0.5s" }}
          >
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Lead Score</p>
            <div className="flex items-end gap-1 mb-2">
              <span className="text-4xl font-extrabold bg-gradient-to-br from-emerald-500 to-teal-400 bg-clip-text text-transparent">92</span>
              <span className="text-sm text-muted-foreground mb-1">/100</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" />
            </div>
            <p className="text-[10px] text-emerald-600 font-semibold mt-1.5">🔥 Hot Lead</p>
          </div>

          {/* Email draft card */}
          <div
            className="animate-float-reverse absolute z-10 rounded-2xl bg-white border shadow-xl p-3 w-52"
            style={{ top: "15%", right: "0%", animationDuration: "6s" }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Mail className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">AI Email Draft</p>
            </div>
            <div className="space-y-1">
              <div className="h-2 rounded bg-muted w-full" />
              <div className="h-2 rounded bg-muted w-4/5" />
              <div className="h-2 rounded bg-muted w-full" />
              <div className="h-2 rounded bg-muted w-3/5" />
            </div>
            <div
              className="mt-2.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-white text-center"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              Generated ✓
            </div>
          </div>

          {/* Center floating blocks */}
          <div className="animate-block-1 absolute" style={{ left: "38%", top: "30%" }}>
            <div
              className="w-20 h-20 rounded-3xl shadow-2xl"
              style={{
                background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 65%))",
                boxShadow: "0 24px 50px hsl(243 75% 59% / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.2)",
              }}
            />
          </div>
          <div className="animate-block-2 absolute" style={{ left: "22%", top: "52%" }}>
            <div
              className="w-11 h-11 rounded-2xl shadow-xl"
              style={{
                background: "linear-gradient(135deg, hsl(190 85% 55%), hsl(210 85% 55%))",
                boxShadow: "0 14px 28px hsl(190 85% 55% / 0.45)",
              }}
            />
          </div>
          <div className="animate-block-3 absolute" style={{ right: "30%", bottom: "18%" }}>
            <div
              className="w-7 h-7 rounded-xl shadow-lg"
              style={{
                background: "linear-gradient(135deg, hsl(38 95% 62%), hsl(20 90% 55%))",
                boxShadow: "0 10px 20px hsl(38 95% 60% / 0.45)",
              }}
            />
          </div>
          <div className="animate-block-4 absolute" style={{ left: "28%", top: "12%" }}>
            <div
              className="w-6 h-6 rounded-lg shadow-lg"
              style={{
                background: "linear-gradient(135deg, hsl(330 80% 65%), hsl(350 75% 60%))",
                boxShadow: "0 8px 16px hsl(330 80% 65% / 0.45)",
              }}
            />
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────── */}
      <section className="border-y bg-white py-10">
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
                style={{ backgroundImage: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
              >
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-8 py-24">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-extrabold tracking-tight mb-3">
            Everything you need to{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              close more deals
            </span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            One platform from channel discovery to signed client.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 stagger-children">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="animate-fade-in-up card-hover rounded-2xl border bg-white p-6 shadow-sm group"
            >
              <div
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl mb-5 shadow-sm bg-gradient-to-br ${f.gradient}`}
              >
                <f.icon className="h-5.5 w-5.5 text-white" />
              </div>
              <h3 className="font-bold text-base mb-2 group-hover:text-primary transition-colors">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="border-y bg-white py-20 px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-extrabold tracking-tight mb-3">How it works</h2>
            <p className="text-muted-foreground text-lg">From zero to booked call in minutes</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Type your niche",
                desc: "Enter keywords like &quot;faceless Africa top 10&quot; or pick from 15 preset templates. AI expands your search automatically.",
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
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${item.gradient} text-white font-extrabold text-sm mb-4 shadow-sm`}
                >
                  {item.step}
                </div>
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="py-24 px-8">
        <div
          className="max-w-4xl mx-auto rounded-3xl p-12 text-center text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(243 75% 45%), hsl(280 75% 50%))" }}
        >
          {/* decorative blobs */}
          <div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, white, transparent)" }}
          />
          <div
            className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, white, transparent)" }}
          />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 text-sm font-medium mb-5 border border-white/20">
              <Target className="h-3.5 w-3.5" />
              14-day free trial · No credit card
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">
              Ready to fill your pipeline?
            </h2>
            <p className="text-white/75 text-lg mb-8 max-w-lg mx-auto">
              Stop spending hours on manual YouTube research. Let AI do the heavy lifting.
            </p>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold px-8 py-4 rounded-2xl text-base hover:bg-white/90 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5"
            >
              Create Free Account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t bg-white/80 backdrop-blur py-8 px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Logo variant="light" size="sm" />
          <p className="text-xs text-muted-foreground">© 2026 StuckLead Operator. AI-powered YouTube lead generation.</p>
        </div>
      </footer>

      </div>{/* end z-10 content wrapper */}
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
