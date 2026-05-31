import Link from "next/link"
import { PlayCircle, Search, BarChart3, KanbanSquare, Mail, TrendingUp, ArrowRight } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <PlayCircle className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg">YouTube Lead Operator</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link href="/auth/register" className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            Start Free Trial
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
          <TrendingUp className="h-4 w-4" />
          AI-Powered Lead Generation for YouTube Agencies
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-6 leading-tight">
          Find, Score, and Close<br />
          <span className="text-primary">YouTube Channel Clients</span><br />
          on Autopilot
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Stop manually searching YouTube for clients. Our AI discovers channels, analyzes their needs, scores their fit, and generates personalized outreach — automatically.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/auth/register" className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors">
            Start Free — No Credit Card
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/auth/login" className="inline-flex items-center gap-2 border border-input bg-white px-6 py-3 rounded-xl font-semibold hover:bg-muted transition-colors">
            Sign In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-8 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Search,
              title: "AI Lead Discovery",
              description: "Enter keywords and our AI searches YouTube, returning channels scored 0–100 for fit with your specific service.",
              color: "bg-blue-50 text-blue-600",
            },
            {
              icon: BarChart3,
              title: "Channel Analysis",
              description: "Get instant analysis of growth trends, editing quality, revenue estimates, outsourcing signals, and budget potential.",
              color: "bg-purple-50 text-purple-600",
            },
            {
              icon: Mail,
              title: "AI Outreach Generator",
              description: "Generate hyper-personalized cold emails that reference specific channel data. Sound human, not like a template.",
              color: "bg-emerald-50 text-emerald-600",
            },
            {
              icon: KanbanSquare,
              title: "CRM Pipeline",
              description: "Drag-and-drop kanban pipeline with 9 stages from New to Won. Track every lead from discovery to closed deal.",
              color: "bg-orange-50 text-orange-600",
            },
            {
              icon: TrendingUp,
              title: "Lead Scoring (0–100)",
              description: "8-factor scoring algorithm weighing growth velocity, revenue potential, quality gaps, and outsourcing signals.",
              color: "bg-pink-50 text-pink-600",
            },
            {
              icon: PlayCircle,
              title: "YouTube-Native",
              description: "Built specifically for YouTube agencies — thumbnail shops, editors, scriptwriters, and growth consultants.",
              color: "bg-red-50 text-red-600",
            },
          ].map(feature => (
            <div key={feature.title} className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4 ${feature.color}`}>
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-white py-16 text-center px-8">
        <h2 className="text-3xl font-bold mb-3">Ready to fill your pipeline?</h2>
        <p className="text-muted-foreground mb-6">14-day free trial. No credit card required. Full access from day one.</p>
        <Link href="/auth/register" className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors">
          Create Free Account
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  )
}
