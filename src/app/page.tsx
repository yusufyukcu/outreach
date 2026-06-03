import Link from "next/link"
import {
  Search, BarChart3, KanbanSquare, Mail, TrendingUp,
  ArrowRight, Sparkles, Ghost, Target, CheckCircle2, Zap,
} from "lucide-react"
import { Logo, LogoMark } from "@/components/ui/logo"

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(220 20% 97%)" }}>

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

          {/* AutoLead card */}
          <div
            className="animate-float absolute z-10 rounded-2xl border shadow-xl p-3 w-48"
            style={{
              bottom: "8%", left: "2%", animationDuration: "5.5s", animationDelay: "1s",
              background: "linear-gradient(135deg, hsl(243 75% 12%), hsl(265 80% 10%))",
              borderColor: "hsl(243 75% 59% / 0.3)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="h-5 w-5 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}>
                  <Zap className="h-3 w-3 text-white fill-current" />
                </div>
                <span className="text-[10px] font-bold text-white/80">AutoLead</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-400">ON</span>
              </div>
            </div>
            <div className="space-y-1">
              {[
                { icon: "📧", text: "Email → FinanceHub", color: "text-indigo-300" },
                { icon: "✓", text: "Found (score 87)", color: "text-emerald-300" },
                { icon: "🔍", text: "faceless finance", color: "text-white/40" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded px-1.5 py-1" style={{ background: "hsl(0 0% 100% / 0.05)" }}>
                  <span className="text-[9px]">{item.icon}</span>
                  <span className={`text-[9px] font-medium truncate ${item.color}`}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3D floating blocks */}

          {/* Large indigo cube */}
          <div className="animate-block-1 absolute" style={{ left: "38%", top: "30%" }}>
            <div
              className="w-20 h-20 rounded-3xl"
              style={{
                background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 65%))",
                boxShadow: "0 24px 50px hsl(243 75% 59% / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.25), inset -2px -2px 8px hsl(243 75% 30% / 0.5)",
                transform: "perspective(400px) rotateX(15deg) rotateY(-15deg)",
              }}
            />
          </div>

          {/* Cyan sphere-ish */}
          <div className="animate-block-2 absolute" style={{ left: "22%", top: "52%" }}>
            <div
              className="w-12 h-12 rounded-full"
              style={{
                background: "radial-gradient(circle at 35% 35%, hsl(190 95% 75%), hsl(210 85% 45%))",
                boxShadow: "0 14px 35px hsl(190 85% 55% / 0.5), inset 0 2px 4px hsl(0 0% 100% / 0.3)",
              }}
            />
          </div>

          {/* Orange small cube */}
          <div className="animate-block-3 absolute" style={{ right: "28%", bottom: "16%" }}>
            <div
              className="w-8 h-8 rounded-xl"
              style={{
                background: "linear-gradient(135deg, hsl(38 95% 62%), hsl(20 90% 55%))",
                boxShadow: "0 10px 24px hsl(38 95% 60% / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.3), inset -1px -1px 4px hsl(20 90% 35% / 0.4)",
                transform: "perspective(300px) rotateX(20deg) rotateY(20deg)",
              }}
            />
          </div>

          {/* Pink tiny sphere */}
          <div className="animate-block-4 absolute" style={{ left: "28%", top: "12%" }}>
            <div
              className="w-7 h-7 rounded-full"
              style={{
                background: "radial-gradient(circle at 35% 30%, hsl(330 90% 80%), hsl(350 80% 50%))",
                boxShadow: "0 8px 20px hsl(330 80% 65% / 0.5), inset 0 2px 3px hsl(0 0% 100% / 0.4)",
              }}
            />
          </div>

          {/* Extra: teal pill */}
          <div className="animate-block-2 absolute" style={{ right: "8%", top: "38%", animationDelay: "1s" }}>
            <div
              className="w-5 h-12 rounded-full"
              style={{
                background: "linear-gradient(180deg, hsl(170 80% 55%), hsl(190 85% 40%))",
                boxShadow: "0 10px 24px hsl(170 80% 45% / 0.45), inset 0 1px 0 hsl(0 0% 100% / 0.3)",
              }}
            />
          </div>

          {/* Extra: violet ring/donut */}
          <div className="animate-block-1 absolute" style={{ left: "10%", bottom: "22%", animationDelay: "0.6s" }}>
            <div
              className="w-10 h-10 rounded-full"
              style={{
                background: "transparent",
                border: "4px solid hsl(270 80% 65%)",
                boxShadow: "0 0 20px hsl(270 80% 65% / 0.6), inset 0 0 10px hsl(270 80% 65% / 0.2)",
              }}
            />
          </div>

          {/* Extra: emerald diamond */}
          <div className="animate-block-3 absolute" style={{ right: "14%", top: "12%", animationDelay: "0.3s" }}>
            <div
              className="w-6 h-6"
              style={{
                background: "linear-gradient(135deg, hsl(150 80% 55%), hsl(170 85% 40%))",
                boxShadow: "0 8px 20px hsl(150 80% 45% / 0.5)",
                transform: "perspective(200px) rotateX(30deg) rotateZ(45deg)",
                borderRadius: "4px",
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

      {/* ── AutoLead Showcase ────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-8 py-24">
        <div className="rounded-3xl overflow-hidden relative" style={{
          background: "linear-gradient(135deg, hsl(243 75% 12%), hsl(265 80% 10%), hsl(280 75% 12%))",
          border: "1px solid hsl(243 75% 59% / 0.25)",
          boxShadow: "0 40px 120px hsl(243 75% 20% / 0.4)",
        }}>
          {/* Background glow orbs */}
          <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(243 75% 59% / 0.15), transparent 70%)", filter: "blur(40px)" }} />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(280 80% 60% / 0.12), transparent 70%)", filter: "blur(40px)" }} />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* Left: copy */}
            <div className="p-10 lg:p-14 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold mb-6 w-fit" style={{ background: "hsl(243 75% 59% / 0.2)", border: "1px solid hsl(243 75% 59% / 0.4)", color: "hsl(243 90% 80%)" }}>
                <Zap className="h-3.5 w-3.5 fill-current" />
                NEW — AutoLead
              </div>

              <h2 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5 text-white">
                Your agency runs<br />
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, hsl(243 90% 80%), hsl(280 85% 80%), hsl(190 85% 70%))" }}>
                  while you sleep
                </span>
              </h2>

              <p className="text-white/55 text-lg leading-relaxed mb-8 max-w-md">
                AutoLead runs 24/7 in the background — discovering new YouTube channels, scoring them, and sending personalized cold emails. Fully automatic.
              </p>

              <ul className="space-y-3 mb-10">
                {[
                  "AI generates fresh keywords every cycle",
                  "Only contacts channels scoring 60+",
                  "Personalized email per channel, not templates",
                  "Choose your pace — 10 sec to 1 hour intervals",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-white/70">
                    <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0" style={{ background: "hsl(243 75% 59% / 0.25)", border: "1px solid hsl(243 75% 59% / 0.5)" }}>
                      <svg className="h-3 w-3 text-indigo-300" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>

              <Link
                href="/auth/register"
                className="btn-glow inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-base text-white w-fit"
                style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}
              >
                <Zap className="h-4 w-4 fill-current" />
                Try AutoLead Free
              </Link>
            </div>

            {/* Right: live UI mockup */}
            <div className="p-8 lg:p-10 flex items-center justify-center border-t lg:border-t-0 lg:border-l" style={{ borderColor: "hsl(0 0% 100% / 0.07)" }}>
              <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "hsl(0 0% 0% / 0.4)", border: "1px solid hsl(0 0% 100% / 0.1)", backdropFilter: "blur(20px)" }}>
                {/* Mockup header */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid hsl(0 0% 100% / 0.07)" }}>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}>
                      <Zap className="h-3.5 w-3.5 text-white fill-current" />
                    </div>
                    <span className="text-xs font-bold text-white/80">AutoLead</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-semibold text-emerald-400">RUNNING</span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-px" style={{ background: "hsl(0 0% 100% / 0.05)" }}>
                  {[{ v: "24", l: "Found" }, { v: "18", l: "Emailed" }, { v: "18", l: "Leads" }].map((s) => (
                    <div key={s.l} className="py-3 text-center" style={{ background: "hsl(0 0% 0% / 0.3)" }}>
                      <p className="text-lg font-extrabold text-white">{s.v}</p>
                      <p className="text-[10px] text-white/40">{s.l}</p>
                    </div>
                  ))}
                </div>

                {/* Activity log */}
                <div className="p-3 space-y-1.5">
                  {[
                    { icon: "📧", text: "Email queued · FinanceHub Pro", time: "2s ago", color: "text-indigo-300" },
                    { icon: "✓", text: "Found · TechExplained (92)", time: "4s ago", color: "text-emerald-300" },
                    { icon: "✓", text: "Found · Africa Facts Daily (78)", time: "4s ago", color: "text-emerald-300" },
                    { icon: "🔍", text: "Searching · \"faceless finance\"", time: "6s ago", color: "text-white/50" },
                    { icon: "📧", text: "Email queued · Mega Projects", time: "18s ago", color: "text-indigo-300" },
                    { icon: "✓", text: "Found · Invest Simplified (85)", time: "20s ago", color: "text-emerald-300" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "hsl(0 0% 100% / 0.04)" }}>
                      <span className="text-xs shrink-0">{item.icon}</span>
                      <span className={`text-[11px] font-medium truncate flex-1 ${item.color}`}>{item.text}</span>
                      <span className="text-[10px] text-white/25 shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>

                {/* Interval badge */}
                <div className="px-3 pb-3">
                  <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: "hsl(150 70% 40% / 0.15)", border: "1px solid hsl(150 70% 40% / 0.3)" }}>
                    <span className="text-[11px] text-emerald-300 font-medium">Every 10 minutes</span>
                    <span className="text-[10px] font-bold text-emerald-400">✓ More Safe to Use</span>
                  </div>
                </div>
              </div>
            </div>
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
      <footer className="border-t bg-white py-8 px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Logo variant="light" size="sm" />
          <p className="text-xs text-muted-foreground">© 2026 StuckLead Operator. AI-powered YouTube lead generation.</p>
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
    desc: "Automatically identify stock-footage and voiceover channels using pattern analysis — perfect for editors targeting faceless content creators.",
    gradient: "from-violet-500 to-purple-500",
  },
]
