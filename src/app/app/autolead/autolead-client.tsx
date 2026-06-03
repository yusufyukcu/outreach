"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Zap, Square, Play, CheckCircle2, Mail, Search, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
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
  red: "bg-red-100 text-red-700 border border-red-200",
  yellow: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  green: "bg-emerald-100 text-emerald-700 border border-emerald-200",
}

let logIdCounter = 0

export function AutoLeadClient({ serviceType, orgName, orgNiche }: AutoLeadClientProps) {
  const [running, setRunning] = useState(false)
  const [selectedFrequency, setSelectedFrequency] = useState(FREQUENCY_OPTIONS[3]) // 10 min default
  const [log, setLog] = useState<LogEntry[]>([])
  const [stats, setStats] = useState({ found: 0, emailsQueued: 0, leadsAdded: 0 })
  const [usedKeywords, setUsedKeywords] = useState<string[]>([])

  const runningRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

  function addLog(message: string, type: LogEntry["type"] = "info") {
    setLog((prev) => [
      { id: ++logIdCounter, message, timestamp: new Date(), type },
      ...prev.slice(0, 99), // keep last 100
    ])
  }

  const runCycle = useCallback(async () => {
    if (!runningRef.current) return

    try {
      // 1. Generate keywords
      addLog("🔑 Generating new keywords...", "info")
      const kwRes = await fetch("/api/autolead/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_type: serviceType,
          org_niche: orgNiche,
          previous_keywords: usedKeywords.slice(-20),
        }),
      })

      if (!kwRes.ok) throw new Error("Failed to generate keywords")
      const { keywords, niche } = await kwRes.json()

      if (!keywords || keywords.length === 0) {
        addLog("No keywords generated, skipping cycle", "error")
      } else {
        setUsedKeywords((prev) => [...prev, ...keywords])

        // 2. Discover channels
        for (const keyword of keywords.slice(0, 2)) {
          if (!runningRef.current) return
          addLog(`🔍 Searching keyword: '${keyword}'`, "search")

          const discoverRes = await fetch("/api/channels/discover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keywords: [keyword],
              niche,
              service_type: serviceType,
              min_score: 60,
              english_only: true,
            }),
          })

          if (!discoverRes.ok) {
            addLog(`Failed to discover channels for '${keyword}'`, "error")
            continue
          }

          const discoverData = await discoverRes.json()
          const channels = (discoverData.results ?? []).filter(
            (ch: { score?: number }) => (ch.score ?? 0) >= 60
          ).slice(0, 5)

          if (channels.length === 0) {
            addLog(`No qualifying channels found for '${keyword}'`, "info")
            continue
          }

          addLog(`Found ${channels.length} qualifying channels`, "success")
          setStats((prev) => ({ ...prev, found: prev.found + channels.length }))

          // 3. Process each channel
          for (const ch of channels) {
            if (!runningRef.current) return

            const channelName = ch.channel?.name ?? ch.name ?? "Unknown Channel"
            const score = ch.score ?? ch.lead_score ?? 0

            addLog(`✓ Found channel ${channelName} (score: ${score})`, "success")

            // 3a. Add as lead
            let leadId: string | null = null
            try {
              const leadRes = await fetch("/api/leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  channel_id: ch.channel?.id ?? ch.channel_id,
                  score,
                  score_breakdown: ch.score_breakdown,
                }),
              })

              if (leadRes.ok) {
                const leadData = await leadRes.json()
                leadId = leadData.id
                if (!leadData.already_exists) {
                  setStats((prev) => ({ ...prev, leadsAdded: prev.leadsAdded + 1 }))
                  addLog(`➕ Lead added: ${channelName}`, "success")

                  // Update stage to "contacted"
                  if (leadId) {
                    await fetch(`/api/leads/${leadId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ crm_stage: "contacted" }),
                    }).catch(() => {})
                  }
                } else {
                  addLog(`Lead already exists: ${channelName}`, "info")
                }
              }
            } catch {
              addLog(`Failed to add lead: ${channelName}`, "error")
            }

            // 3b. Generate outreach email
            try {
              const emailRes = await fetch("/api/outreach/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  channel: ch.channel ?? ch,
                  serviceType,
                  tone: "professional",
                  outreachChannel: "email",
                  agencyName: orgName,
                  agencyValueProp: "",
                }),
              })

              if (emailRes.ok) {
                const emailData = await emailRes.json()

                // 3c. Save email to outreach_messages
                if (leadId) {
                  const saveRes = await fetch("/api/outreach/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      lead_id: leadId,
                      channel: "email",
                      subject: emailData.subject,
                      body: emailData.body,
                      status: "pending",
                    }),
                  })

                  if (saveRes.ok) {
                    setStats((prev) => ({ ...prev, emailsQueued: prev.emailsQueued + 1 }))
                    addLog(`📧 Email queued for ${channelName}`, "email")
                  }
                }
              }
            } catch {
              addLog(`Failed to generate email for ${channelName}`, "error")
            }
          }
        }
      }
    } catch (err) {
      addLog(`Cycle error: ${err instanceof Error ? err.message : "Unknown error"}`, "error")
    }

    // Schedule next cycle
    if (runningRef.current) {
      addLog(`⏳ Waiting ${selectedFrequency.label.toLowerCase()} before next cycle...`, "info")
      timeoutRef.current = setTimeout(() => {
        if (runningRef.current) runCycle()
      }, selectedFrequency.value)
    }
  }, [serviceType, orgNiche, orgName, usedKeywords, selectedFrequency])

  function handleStart() {
    runningRef.current = true
    setRunning(true)
    addLog("🚀 AutoLead started", "success")
    runCycle()
  }

  function handleStop() {
    runningRef.current = false
    setRunning(false)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    addLog("⏹ AutoLead stopped", "info")
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const logIcons: Record<LogEntry["type"], React.ReactNode> = {
    info: <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />,
    success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />,
    email: <Mail className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />,
    search: <Search className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />,
    error: <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />,
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Status card */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-md"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              <Zap className="h-7 w-7 text-white" fill="white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30"}`} />
                <span className={`text-sm font-semibold ${running ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {running ? "Running" : "Stopped"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {running ? `Running ${selectedFrequency.label.toLowerCase()}` : "Click Start to begin"}
              </p>
            </div>
          </div>

          <Button
            onClick={running ? handleStop : handleStart}
            size="lg"
            className="rounded-2xl px-8 font-bold text-base"
            style={running
              ? { background: "hsl(0 84% 60%)" }
              : { background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }
            }
          >
            {running ? (
              <><Square className="h-5 w-5 mr-2" fill="white" />Stop</>
            ) : (
              <><Play className="h-5 w-5 mr-2" fill="white" />Start</>
            )}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Found", value: stats.found, color: "from-indigo-500 to-violet-500", glow: "hsl(243 75% 59% / 0.25)" },
          { label: "Emails Queued", value: stats.emailsQueued, color: "from-sky-500 to-cyan-400", glow: "hsl(199 90% 55% / 0.25)" },
          { label: "Leads Added", value: stats.leadsAdded, color: "from-emerald-500 to-teal-400", glow: "hsl(160 80% 45% / 0.25)" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border bg-white p-4 shadow-sm text-center">
            <p
              className="text-3xl font-extrabold tabular-nums"
              style={{ background: `linear-gradient(135deg, ${stat.color.replace("from-", "").replace(" to-", ", ")})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >
              {stat.value}
            </p>
            <p className="text-xs font-medium text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Frequency selector */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold mb-3">Frequency</h3>
        <div className="space-y-2">
          {FREQUENCY_OPTIONS.map((opt) => {
            const isSelected = selectedFrequency.value === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => !running && setSelectedFrequency(opt)}
                disabled={running}
                className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-150 ${
                  isSelected
                    ? "bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold"
                    : "border border-transparent hover:bg-muted/50 text-foreground"
                } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-indigo-500" : "border-muted-foreground/40"}`}>
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                  </div>
                  {opt.label}
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${BADGE_STYLES[opt.badge]}`}>
                  {opt.badgeText}
                </span>
              </button>
            )
          })}
        </div>
        {running && (
          <p className="text-xs text-muted-foreground mt-3">Stop AutoLead to change frequency</p>
        )}
      </div>

      {/* Activity log */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
          <h3 className="text-sm font-bold">Activity Log</h3>
          {log.length > 0 && (
            <button
              onClick={() => setLog([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div
          ref={logContainerRef}
          className="h-72 overflow-y-auto p-4 space-y-1.5"
        >
          {log.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Zap className="h-8 w-8 mb-2 opacity-10" />
              <p className="text-sm">No activity yet</p>
              <p className="text-xs mt-1">Start AutoLead to see live updates</p>
            </div>
          ) : (
            log.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2">
                {logIcons[entry.type]}
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-foreground/80 leading-relaxed">{entry.message}</span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums mt-0.5">
                  {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  )
}
