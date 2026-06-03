"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Zap, Square, Play, CheckCircle2, Mail, Search, AlertTriangle } from "lucide-react"
import type { ServiceType } from "@/types"

interface AutoLeadClientProps {
  serviceType: ServiceType
  orgName: string
  orgNiche: string
}

interface LogEntry {
  id: number
  message: string
  timestamp: Date
  type: "info" | "success" | "email" | "search" | "error"
}

interface FrequencyOption {
  label: string
  value: number
  badge: "red" | "yellow" | "green"
  badgeText: string
}

const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { label: "Every 10 seconds", value: 10_000, badge: "red", badgeText: "⚠️ Spam Warning" },
  { label: "Every 30 seconds", value: 30_000, badge: "red", badgeText: "⚠️ Spam Warning" },
  { label: "Every 2 minutes", value: 2 * 60_000, badge: "yellow", badgeText: "⚠️ Spam Warning" },
  { label: "Every 10 minutes", value: 10 * 60_000, badge: "green", badgeText: "✓ More Safe to Use" },
  { label: "Every 30 minutes", value: 30 * 60_000, badge: "green", badgeText: "✓ More Safe to Use" },
  { label: "Every 1 hour", value: 60 * 60_000, badge: "green", badgeText: "✓ More Safe to Use" },
]

const BADGE_STYLES: Record<string, string> = {
  red: "bg-red-500/15 text-red-400 border border-red-500/30",
  yellow: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  green: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
}

let logIdCounter = 0

export function AutoLeadClient({ serviceType, orgName, orgNiche }: AutoLeadClientProps) {
  const [running, setRunning] = useState(false)
  const [selectedFrequency, setSelectedFrequency] = useState(FREQUENCY_OPTIONS[3])
  const [log, setLog] = useState<LogEntry[]>([])
  const [stats, setStats] = useState({ found: 0, emailsQueued: 0, leadsAdded: 0 })
  const [usedKeywords, setUsedKeywords] = useState<string[]>([])

  const runningRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function addLog(message: string, type: LogEntry["type"] = "info") {
    setLog((prev) => [
      { id: ++logIdCounter, message, timestamp: new Date(), type },
      ...prev.slice(0, 99),
    ])
  }

  const runCycle = useCallback(async () => {
    if (!runningRef.current) return
    try {
      addLog("🔑 Generating new keywords...", "info")
      const kwRes = await fetch("/api/autolead/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_type: serviceType, org_niche: orgNiche, previous_keywords: usedKeywords.slice(-20) }),
      })
      if (!kwRes.ok) throw new Error("Failed to generate keywords")
      const { keywords, niche } = await kwRes.json()
      if (!keywords || keywords.length === 0) { addLog("No keywords generated, skipping cycle", "error"); return }
      setUsedKeywords((prev) => [...prev, ...keywords])

      for (const keyword of keywords.slice(0, 2)) {
        if (!runningRef.current) return
        addLog(`🔍 Searching: "${keyword}"`, "search")
        const discoverRes = await fetch("/api/channels/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: [keyword], niche, service_type: serviceType, min_score: 60, english_only: true }),
        })
        if (!discoverRes.ok) { addLog(`Failed to discover for "${keyword}"`, "error"); continue }
        const discoverData = await discoverRes.json()
        const channels = (discoverData.results ?? []).filter((ch: { score?: number }) => (ch.score ?? 0) >= 60).slice(0, 5)
        if (channels.length === 0) { addLog(`No qualifying channels for "${keyword}"`, "info"); continue }
        addLog(`Found ${channels.length} qualifying channels`, "success")
        setStats((prev) => ({ ...prev, found: prev.found + channels.length }))

        for (const ch of channels) {
          if (!runningRef.current) return
          const channelName = ch.channel?.name ?? ch.name ?? "Unknown Channel"
          const score = ch.score ?? ch.lead_score ?? 0
          addLog(`✓ ${channelName} (score: ${score})`, "success")

          let leadId: string | null = null
          try {
            const leadRes = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel_id: ch.channel?.id ?? ch.channel_id, score, score_breakdown: ch.score_breakdown }) })
            if (leadRes.ok) {
              const leadData = await leadRes.json()
              leadId = leadData.id
              if (!leadData.already_exists) {
                setStats((prev) => ({ ...prev, leadsAdded: prev.leadsAdded + 1 }))
                addLog(`➕ Lead added: ${channelName}`, "success")
                if (leadId) await fetch(`/api/leads/${leadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crm_stage: "contacted" }) }).catch(() => {})
              }
            }
          } catch { addLog(`Failed to add lead: ${channelName}`, "error") }

          try {
            const emailRes = await fetch("/api/outreach/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: ch.channel ?? ch, serviceType, tone: "professional", outreachChannel: "email", agencyName: orgName, agencyValueProp: "" }) })
            if (emailRes.ok && leadId) {
              const emailData = await emailRes.json()
              const saveRes = await fetch("/api/outreach/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, channel: "email", subject: emailData.subject, body: emailData.body, status: "pending" }) })
              if (saveRes.ok) { setStats((prev) => ({ ...prev, emailsQueued: prev.emailsQueued + 1 })); addLog(`📧 Email queued for ${channelName}`, "email") }
            }
          } catch { addLog(`Failed to generate email for ${channelName}`, "error") }
        }
      }
    } catch (err) {
      addLog(`Cycle error: ${err instanceof Error ? err.message : "Unknown error"}`, "error")
    }

    if (runningRef.current) {
      addLog(`⏳ Next cycle in ${selectedFrequency.label.toLowerCase().replace("every ", "")}...`, "info")
      timeoutRef.current = setTimeout(() => { if (runningRef.current) runCycle() }, selectedFrequency.value)
    }
  }, [serviceType, orgNiche, orgName, usedKeywords, selectedFrequency])

  function handleStart() { runningRef.current = true; setRunning(true); addLog("🚀 AutoLead started", "success"); runCycle() }
  function handleStop() {
    runningRef.current = false; setRunning(false)
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    addLog("⏹ AutoLead stopped", "info")
  }

  useEffect(() => () => { runningRef.current = false; if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  const logColors: Record<LogEntry["type"], string> = {
    info: "text-white/35",
    success: "text-emerald-400",
    email: "text-indigo-300",
    search: "text-sky-400",
    error: "text-red-400",
  }
  const logIcons: Record<LogEntry["type"], React.ReactNode> = {
    info: <div className="h-1.5 w-1.5 rounded-full bg-white/20 mt-1.5 shrink-0" />,
    success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />,
    email: <Mail className="h-3.5 w-3.5 text-indigo-300 shrink-0 mt-0.5" />,
    search: <Search className="h-3.5 w-3.5 text-sky-400 shrink-0 mt-0.5" />,
    error: <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />,
  }

  return (
    <div
      className="min-h-screen -m-6 p-8"
      style={{ background: "linear-gradient(135deg, hsl(243 75% 8%), hsl(265 80% 6%), hsl(280 75% 8%))" }}
    >
      {/* Background orbs */}
      <div className="fixed -top-40 -left-40 w-96 h-96 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(243 75% 59% / 0.1), transparent 70%)", filter: "blur(60px)" }} />
      <div className="fixed -bottom-40 -right-40 w-96 h-96 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(280 80% 60% / 0.08), transparent 70%)", filter: "blur(60px)" }} />

      <div className="relative z-10 max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}>
            <Zap className="h-5 w-5 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">AutoLead</h1>
            <p className="text-xs text-white/40">Automatically discovers and contacts YouTube channels</p>
          </div>
        </div>

        {/* Status + Start/Stop card */}
        <div className="rounded-2xl p-5 flex items-center justify-between" style={{ background: "hsl(0 0% 100% / 0.04)", border: "1px solid hsl(0 0% 100% / 0.08)" }}>
          <div className="flex items-center gap-4">
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all ${running ? "shadow-lg" : ""}`} style={{ background: running ? "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" : "hsl(0 0% 100% / 0.06)", boxShadow: running ? "0 0 30px hsl(243 75% 59% / 0.4)" : "none" }}>
              <Zap className={`h-6 w-6 ${running ? "text-white fill-white" : "text-white/30"}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${running ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
                <span className={`text-sm font-bold ${running ? "text-emerald-400" : "text-white/40"}`}>
                  {running ? "Running" : "Stopped"}
                </span>
              </div>
              <p className="text-xs text-white/30 mt-0.5">
                {running ? `Cycling ${selectedFrequency.label.toLowerCase()}` : "Click Start to begin"}
              </p>
            </div>
          </div>

          <button
            onClick={running ? handleStop : handleStart}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95"
            style={running
              ? { background: "hsl(0 84% 50% / 0.2)", border: "1px solid hsl(0 84% 50% / 0.4)", color: "hsl(0 84% 70%)" }
              : { background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))", boxShadow: "0 0 24px hsl(243 75% 59% / 0.35)" }
            }
          >
            {running ? <><Square className="h-4 w-4 fill-current" /> Stop</> : <><Play className="h-4 w-4 fill-current" /> Start</>}
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Found", value: stats.found, grad: "hsl(243 90% 80%), hsl(280 85% 80%)" },
            { label: "Emails Queued", value: stats.emailsQueued, grad: "hsl(199 90% 70%), hsl(180 85% 60%)" },
            { label: "Leads Added", value: stats.leadsAdded, grad: "hsl(150 80% 60%), hsl(170 85% 50%)" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl p-4 text-center" style={{ background: "hsl(0 0% 100% / 0.04)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <p className="text-3xl font-extrabold tabular-nums bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(135deg, ${stat.grad})` }}>
                {stat.value}
              </p>
              <p className="text-xs text-white/35 mt-1 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Frequency selector */}
        <div className="rounded-2xl p-5" style={{ background: "hsl(0 0% 100% / 0.04)", border: "1px solid hsl(0 0% 100% / 0.08)" }}>
          <h3 className="text-sm font-bold text-white/70 mb-3">Frequency</h3>
          <div className="space-y-1.5">
            {FREQUENCY_OPTIONS.map((opt) => {
              const isSelected = selectedFrequency.value === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => !running && setSelectedFrequency(opt)}
                  disabled={running}
                  className="w-full flex items-center justify-between rounded-xl px-4 py-2.5 text-sm transition-all duration-150"
                  style={{
                    background: isSelected ? "hsl(243 75% 59% / 0.12)" : "transparent",
                    border: isSelected ? "1px solid hsl(243 75% 59% / 0.3)" : "1px solid transparent",
                    cursor: running ? "not-allowed" : "pointer",
                    opacity: running && !isSelected ? 0.4 : 1,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: isSelected ? "hsl(243 75% 70%)" : "hsl(0 0% 100% / 0.2)" }}>
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full" style={{ background: "hsl(243 75% 70%)" }} />}
                    </div>
                    <span className={isSelected ? "text-white/90 font-semibold" : "text-white/50"}>{opt.label}</span>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${BADGE_STYLES[opt.badge]}`}>
                    {opt.badgeText}
                  </span>
                </button>
              )
            })}
          </div>
          {running && <p className="text-xs text-white/25 mt-3">Stop AutoLead to change frequency</p>}
        </div>

        {/* Activity log */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(0 0% 100% / 0.04)", border: "1px solid hsl(0 0% 100% / 0.08)" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid hsl(0 0% 100% / 0.06)" }}>
            <h3 className="text-sm font-bold text-white/70">Activity Log</h3>
            {log.length > 0 && (
              <button onClick={() => setLog([])} className="text-xs text-white/25 hover:text-white/60 transition-colors">Clear</button>
            )}
          </div>
          <div className="h-72 overflow-y-auto p-4 space-y-1.5">
            {log.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/20">
                <Zap className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No activity yet</p>
                <p className="text-xs mt-1">Start AutoLead to see live updates</p>
              </div>
            ) : (
              log.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "hsl(0 0% 100% / 0.03)" }}>
                  {logIcons[entry.type]}
                  <span className={`text-xs flex-1 min-w-0 leading-relaxed ${logColors[entry.type]}`}>{entry.message}</span>
                  <span className="text-[10px] text-white/20 shrink-0 tabular-nums mt-0.5">
                    {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
