"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Search, Users, KanbanSquare,
  Mail, Settings, LogOut, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/discover", label: "Lead Finder", icon: Search },
  { href: "/app/leads", label: "Leads", icon: Users },
  { href: "/app/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/app/outreach", label: "Outreach", icon: Mail },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <aside className="flex h-screen w-56 flex-col px-3 py-5"
      style={{ background: "hsl(224 71% 4%)" }}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-2 mb-8">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}>
          <Zap className="h-4 w-4 text-white" fill="white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">YT Lead Op</p>
          <p className="text-[11px] mt-0.5" style={{ color: "hsl(220 9% 55%)" }}>AI Lead Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "text-white"
                  : "hover:text-white"
              )}
              style={active ? {
                background: "linear-gradient(135deg, hsl(243 75% 59% / 0.25), hsl(280 75% 60% / 0.15))",
                boxShadow: "inset 0 0 0 1px hsl(243 75% 59% / 0.3)",
                color: "white",
              } : { color: "hsl(220 9% 55%)" }}
            >
              <Icon className={cn("h-4 w-4 shrink-0 transition-all duration-200", active ? "text-indigo-400" : "")} />
              {label}
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="space-y-0.5 border-t pt-4" style={{ borderColor: "hsl(220 9% 15%)" }}>
        <Link
          href="/app/settings"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:text-white"
          style={{ color: "hsl(220 9% 55%)" }}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200"
          style={{ color: "hsl(220 9% 55%)" }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = "hsl(0 84% 70%)"
            ;(e.currentTarget as HTMLElement).style.background = "hsl(0 84% 60% / 0.08)"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = "hsl(220 9% 55%)"
            ;(e.currentTarget as HTMLElement).style.background = "transparent"
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
