"use client"
import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"

export function SyncRepliesButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSync() {
    setLoading(true)
    try {
      const res = await fetch("/api/gmail/sync-replies", { method: "POST" })
      const data = await res.json()

      if (!res.ok) {
        if (data.code === "not_connected") {
          toast({ title: "Gmail not connected", description: "Connect Gmail in Settings first.", variant: "destructive" })
        } else if (data.code === "insufficient_scope") {
          toast({ title: "Permission missing", description: "Reconnect Gmail in Settings to enable reply reading.", variant: "destructive" })
        } else {
          toast({ title: "Sync failed", description: data.error ?? "Unknown error", variant: "destructive" })
        }
        return
      }

      if (data.found > 0) {
        toast({ title: `${data.found} new repl${data.found === 1 ? "y" : "ies"} detected!` })
        router.refresh()
      } else {
        toast({ title: "No new replies", description: `Checked ${data.checked} message${data.checked !== 1 ? "s" : ""}` })
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--sl-fg-1)" }}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Checking…" : "Check Replies"}
    </button>
  )
}
