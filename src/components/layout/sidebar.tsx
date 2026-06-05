"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Search, Users, KanbanSquare, Mail, Settings, LogOut, Briefcase, Zap, LayoutDashboard } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { href: "/app/autolead",  label: "AutoLead",   icon: Zap },
  { href: "/app/discover",  label: "Discover",   icon: Search },
  { href: "/app/leads",     label: "Leads",      icon: Users },
  { href: "/app/pipeline",  label: "Pipeline",   icon: KanbanSquare },
  { href: "/app/outreach",  label: "Outreach",   icon: Mail },
  { href: "/app/career",    label: "My Career",  icon: Briefcase },
]

function LogoMark() {
  return (
    <svg width={32} height={32} viewBox="0 0 80 80" fill="none">
      <defs>
        <linearGradient id="slk-fill" x1="8" y1="8" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(243,75%,68%)" />
          <stop offset="100%" stopColor="hsl(280,75%,58%)" />
        </linearGradient>
      </defs>
      <rect x="14" y="14" width="34" height="34" rx="8" transform="rotate(45 31 31)" fill="url(#slk-fill)" />
      <path d="M54 24 L68 40 L54 56" stroke="url(#slk-fill)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <aside
      className="flex h-screen w-[232px] flex-shrink-0 flex-col py-[18px] px-[14px] relative z-10"
      style={{
        background: "hsl(224 60% 4% / 0.72)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRight: "1px solid var(--sl-border)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-[11px] px-2 pb-[22px] pt-[6px]">
        <LogoMark />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--sl-fg-1)" }}>StuckLead Operator</div>
          <div style={{ fontSize: 11, color: "var(--sl-fg-3)", marginTop: 2 }}>AI Lead Platform</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-[3px]">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className="flex items-center gap-3 w-full rounded-xl px-[11px] py-[9px] text-[13.5px] font-medium transition-all duration-200"
              style={active ? {
                color: "#fff",
                background: "linear-gradient(135deg, hsl(243 75% 59% / 0.28), hsl(280 75% 60% / 0.16))",
                boxShadow: "inset 0 0 0 1px hsl(243 75% 59% / 0.3)",
              } : { color: "hsl(220 9% 56%)" }}
            >
              <Icon className="h-[17px] w-[17px] shrink-0" style={active ? { color: "hsl(243 75% 68%)" } : {}} />
              <span>{label}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: "hsl(243 75% 68%)", boxShadow: "0 0 8px hsl(243 75% 68%)" }} />}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="flex flex-col gap-[3px] pt-3" style={{ borderTop: "1px solid var(--sl-border)" }}>
        <Link
          href="/app/settings"
          className="flex items-center gap-3 w-full rounded-xl px-[11px] py-[9px] text-[13.5px] font-medium transition-all duration-200"
          style={pathname.startsWith("/app/settings") ? {
            color: "#fff",
            background: "linear-gradient(135deg, hsl(243 75% 59% / 0.28), hsl(280 75% 60% / 0.16))",
            boxShadow: "inset 0 0 0 1px hsl(243 75% 59% / 0.3)",
          } : { color: "hsl(220 9% 56%)" }}
        >
          <Settings className="h-[17px] w-[17px] shrink-0" />
          <span>Settings</span>
        </Link>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full rounded-xl px-[11px] py-[9px] text-[13.5px] font-medium transition-all duration-200 hover:text-white"
          style={{ color: "hsl(220 9% 56%)" }}
        >
          <LogOut className="h-[17px] w-[17px] shrink-0" />
          <span>Sign Out</span>
        </button>

        {/* User */}
        <div className="flex items-center gap-[10px] px-2 py-[9px] mt-[6px] rounded-xl">
          <div
            className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-[12px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, hsl(243 75% 62%), hsl(280 75% 62%))", boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.08)" }}
          >
            YY
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--sl-fg-1)" }}>Yusuf Y.</div>
            <div style={{ fontSize: 10.5, color: "var(--sl-fg-3)", marginTop: 1 }}>Pro · Agency</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
