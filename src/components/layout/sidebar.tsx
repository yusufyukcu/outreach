"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Search, Users, KanbanSquare,
  Mail, Settings, LogOut, PlayCircle, TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/discover", label: "Lead Finder", icon: Search },
  { href: "/app/leads", label: "Lead Database", icon: Users },
  { href: "/app/pipeline", label: "CRM Pipeline", icon: KanbanSquare },
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
    <aside className="flex h-screen w-60 flex-col border-r bg-white px-3 py-4">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-2 mb-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <PlayCircle className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-none">YT Lead Op</p>
          <p className="text-xs text-muted-foreground">AI Lead Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className="space-y-1 border-t pt-4">
        <Link
          href="/app/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
