"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Zap, Square, Play, CheckCircle2, Mail, Search, AlertTriangle, Ghost } from "lucide-react"
import type { ServiceType } from "@/types"

const NICHES = [
  "Any Niche", "Technology", "Personal Finance", "Health & Fitness", "Food & Cooking",
  "Gaming", "Travel & Vlogging", "Beauty & Fashion", "Business", "Education",
  "Music", "Comedy", "News & Politics", "Sports", "Real Estate", "Lifestyle",
]

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
  red: "bg-red-50 text-red-500 border border-red-200",
  yellow: "bg-yellow-50 text-yellow-600 border border-yellow-200",
  green: "bg-emerald-50 text-emerald-600 border border-emerald-200",
}

let logIdCounter = 0

export function AutoLeadClient({ serviceType, orgName, orgNiche }: AutoLeadClientProps) {
  const [running, setRunning] = useState(false)
  const [selectedFrequency, setSelectedFrequency] = useState(FREQUENCY_OPTIONS[3])
  const [log, setLog] = useState<LogEntry[]>([])
  const [stats, setStats] = useState({ found: 0, emailsQueued: 0, leadsAdded: 0 })
  const [usedKeywords, setUsedKeywords] = useState<string[]>([])
  const [facelessMode, setFacelessMode] = useState(false)
  const [successfulPatterns, setSuccessfulPatterns] = useState<string[]>([])
  const [minSubs, setMinSubs] = useState(1000)
  const [maxSubs, setMaxSubs] = useState(500000)
  const [selectedNiche, setSelectedNiche] = useState("Any Niche")
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null) // ms, null = unlimited
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const seenChannelIds = useRef<Set<string>>(new Set())

  const runningRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const DURATION_OPTIONS = [
    { label: "1 hour", value: 60 * 60_000 },
    { label: "3 hours", value: 3 * 60 * 60_000 },
    { label: "8 hours", value: 8 * 60 * 60_000 },
    { label: "24 hours", value: 24 * 60 * 60_000 },
  ]

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
        body: JSON.stringify({ service_type: serviceType, org_niche: selectedNiche === "Any Niche" ? orgNiche : selectedNiche, previous_keywords: usedKeywords.slice(-20), successful_patterns: successfulPatterns.slice(-10) }),
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
          body: JSON.stringify({ keywords: [keyword], niche: selectedNiche === "Any Niche" ? (niche || "") : selectedNiche, service_type: serviceType, min_score: 60, min_subscribers: minSubs, max_subscribers: maxSubs, english_only: true, ...(facelessMode ? { faceless_mode: true, min_faceless_score: 50 } : {}) }),
        })
        if (!discoverRes.ok) { addLog(`Failed to discover for "${keyword}"`, "error"); continue }
        const discoverData = await discoverRes.json()
        const channels = (discoverData.channels ?? [])
          .filter((ch: { score?: number; youtube_channel_id?: string; id?: string }) => {
            if ((ch.score ?? 0) < 60) return false
            if (ch.id && seenChannelIds.current.has(ch.id)) return false
            if (ch.youtube_channel_id && seenChannelIds.current.has(ch.youtube_channel_id)) return false
            return true
          })
          .slice(0, 5)
        if (channels.length === 0) { addLog(`No qualifying channels for "${keyword}"`, "info"); continue }
        for (const ch of channels) {
          if (ch.id) seenChannelIds.current.add(ch.id)
          if (ch.youtube_channel_id) seenChannelIds.current.add(ch.youtube_channel_id)
        }
        addLog(`Found ${channels.length} qualifying channels`, "success")
        setStats((prev) => ({ ...prev, found: prev.found + channels.length }))
        if (channels.some((ch: { score?: number }) => (ch.score ?? 0) >= 75)) {
          setSuccessfulPatterns((prev) => [...prev, keyword])
        }

        for (const ch of channels) {
          if (!runningRef.current) return
          const channelName = ch.name ?? "Unknown Channel"
          const channelDbId: string | undefined = ch.id
          const score = ch.score ?? 0
          addLog(`✓ ${channelName} (score: ${score})`, "success")

          let leadId: string | null = null
          try {
            const leadRes = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel_id: channelDbId, score, score_breakdown: ch.quality_breakdown, source: "autolead" }) })
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
            const emailRes = await fetch("/api/outreach/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: ch, serviceType, tone: "professional", outreachChannel: "email", agencyName: orgName, agencyValueProp: "" }) })
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
  }, [serviceType, orgNiche, orgName, usedKeywords, selectedFrequency, facelessMode, successfulPatterns, minSubs, maxSubs, selectedNiche])

  function handleStart() {
    runningRef.current = true
    setRunning(true)
    addLog("🚀 AutoLead started", "success")
    if (selectedDuration) {
      setRemainingMs(selectedDuration)
      tickRef.current = setInterval(() => {
        setRemainingMs((prev) => {
          if (prev === null || prev <= 1000) return null
          return prev - 1000
        })
      }, 1000)
      durationTimerRef.current = setTimeout(() => {
        handleStop(true)
      }, selectedDuration)
    }
    runCycle()
  }
  function handleStop(timedOut = false) {
    runningRef.current = false
    setRunning(false)
    setRemainingMs(null)
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    if (durationTimerRef.current) { clearTimeout(durationTimerRef.current); durationTimerRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    addLog(timedOut ? "⏱ Duration reached — AutoLead stopped" : "⏹ AutoLead stopped", "info")
  }

  useEffect(() => () => {
    runningRef.current = false
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (durationTimerRef.current) clearTimeout(durationTimerRef.current)
    if (tickRef.current) clearInterval(tickRef.current)
  }, [])

  function formatRemaining(ms: number) {
    const h = Math.floor(ms / 3_600_000)
    const m = Math.floor((ms % 3_600_000) / 60_000)
    const s = Math.floor((ms % 60_000) / 1000)
    if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`
    return `${m}m ${s.toString().padStart(2, "0")}s`
  }

  const logColors: Record<LogEntry["type"], string> = {
    info: "text-muted-foreground",
    success: "text-emerald-600",
    email: "text-indigo-600",
    search: "text-sky-600",
    error: "text-red-500",
  }
  const logIcons: Record<LogEntry["type"], React.ReactNode> = {
    info: <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 mt-1.5 shrink-0" />,
    success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />,
    email: <Mail className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />,
    search: <Search className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />,
    error: <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />,
  }

  return (
    <div className="min-h-screen -m-6 p-8 bg-background">

      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}>
            <Zap className="h-5 w-5 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-foreground">AutoLead</h1>
            <p className="text-xs text-muted-foreground">Automatically discovers and contacts YouTube channels</p>
          </div>
        </div>

        {/* Status + Start/Stop card */}
        <div className="bg-white rounded-2xl p-5 flex items-center justify-between border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all ${running ? "shadow-lg" : ""}`} style={{ background: running ? "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" : "hsl(243 75% 59% / 0.08)", boxShadow: running ? "0 0 30px hsl(243 75% 59% / 0.35)" : "none" }}>
              <Zap className={`h-6 w-6 ${running ? "text-white fill-white" : "text-primary/40"}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30"}`} />
                <span className={`text-sm font-bold ${running ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {running ? "Running" : "Stopped"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {running
                  ? remainingMs !== null
                    ? `Stops in ${formatRemaining(remainingMs)}`
                    : `Cycling ${selectedFrequency.label.toLowerCase()}`
                  : "Click Start to begin"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFacelessMode(!facelessMode)}
              disabled={running}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
              style={facelessMode
                ? { background: "hsl(270 75% 55% / 0.1)", border: "1px solid hsl(270 75% 55% / 0.3)", color: "hsl(270 75% 45%)" }
                : { background: "hsl(220 14% 96%)", border: "1px solid hsl(220 13% 91%)", color: "hsl(220 9% 46%)" }
              }
            >
              <Ghost className="h-4 w-4" />
              Faceless
            </button>
            <button
              onClick={running ? () => handleStop() : handleStart}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
              style={running
                ? { background: "hsl(0 84% 50% / 0.08)", border: "1px solid hsl(0 84% 50% / 0.3)", color: "hsl(0 84% 50%)" }
                : { background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))", color: "white", boxShadow: "0 0 24px hsl(243 75% 59% / 0.3)" }
              }
            >
              {running ? <><Square className="h-4 w-4 fill-current" /> Stop</> : <><Play className="h-4 w-4 fill-current" /> Start</>}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Found", value: stats.found, grad: "hsl(243 75% 55%), hsl(280 80% 58%)" },
            { label: "Emails Queued", value: stats.emailsQueued, grad: "hsl(199 80% 45%), hsl(180 75% 40%)" },
            { label: "Leads Added", value: stats.leadsAdded, grad: "hsl(150 60% 40%), hsl(170 70% 35%)" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl p-4 text-center border border-border shadow-sm">
              <p className="text-3xl font-extrabold tabular-nums bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(135deg, ${stat.grad})` }}>
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Niche selector */}
        <div className="bg-white rounded-2xl p-5 border border-border shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3">Target Niche</h3>
          <div className="flex flex-wrap gap-2">
            {NICHES.map((n) => {
              const active = selectedNiche === n
              return (
                <button
                  key={n}
                  onClick={() => !running && setSelectedNiche(n)}
                  disabled={running}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={active
                    ? { background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))", color: "white" }
                    : { background: "hsl(220 14% 96%)", border: "1px solid hsl(220 13% 91%)", color: "hsl(220 9% 46%)" }
                  }
                >
                  {n}
                </button>
              )
            })}
          </div>
          {running && <p className="text-xs text-muted-foreground/50 mt-3">Stop AutoLead to change niche</p>}
        </div>

        {/* Frequency selector */}
        <div className="bg-white rounded-2xl p-5 border border-border shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3">Frequency</h3>
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
                    background: isSelected ? "hsl(243 75% 59% / 0.06)" : "transparent",
                    border: isSelected ? "1px solid hsl(243 75% 59% / 0.25)" : "1px solid transparent",
                    cursor: running ? "not-allowed" : "pointer",
                    opacity: running && !isSelected ? 0.4 : 1,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: isSelected ? "hsl(243 75% 59%)" : "hsl(220 9% 70%)" }}>
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full" style={{ background: "hsl(243 75% 59%)" }} />}
                    </div>
                    <span className={isSelected ? "text-foreground font-semibold" : "text-muted-foreground"}>{opt.label}</span>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${BADGE_STYLES[opt.badge]}`}>
                    {opt.badgeText}
                  </span>
                </button>
              )
            })}
          </div>
          {running && <p className="text-xs text-muted-foreground/50 mt-3">Stop AutoLead to change frequency</p>}
        </div>

        {/* Duration selector */}
        <div className="bg-white rounded-2xl p-5 border border-border shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3">Run Duration</h3>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => !running && setSelectedDuration(null)}
              disabled={running}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={selectedDuration === null
                ? { background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))", color: "white" }
                : { background: "hsl(220 14% 96%)", border: "1px solid hsl(220 13% 91%)", color: "hsl(220 9% 46%)" }
              }
            >
              Unlimited
            </button>
            {DURATION_OPTIONS.map((opt) => {
              const active = selectedDuration === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => !running && setSelectedDuration(opt.value)}
                  disabled={running}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={active
                    ? { background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))", color: "white" }
                    : { background: "hsl(220 14% 96%)", border: "1px solid hsl(220 13% 91%)", color: "hsl(220 9% 46%)" }
                  }
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          {running && remainingMs !== null && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground/60">Time remaining</span>
                <span className="font-mono font-semibold text-foreground">{formatRemaining(remainingMs)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${(remainingMs / selectedDuration!) * 100}%`,
                    background: "linear-gradient(90deg, hsl(243 75% 55%), hsl(280 80% 58%))",
                  }}
                />
              </div>
            </div>
          )}
          {running && <p className="text-xs text-muted-foreground/50 mt-3">Stop AutoLead to change duration</p>}
        </div>

        {/* Subscriber range */}
        <div className="bg-white rounded-2xl p-5 border border-border shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-3">Subscriber Range</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Min subscribers", value: minSubs, set: setMinSubs },
              { label: "Max subscribers", value: maxSubs, set: setMaxSubs },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
                <input
                  type="number"
                  min={0}
                  value={value}
                  disabled={running}
                  onChange={(e) => set(Math.max(0, Number(e.target.value)))}
                  className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {[
              { label: "Nano (1K–10K)", min: 1000, max: 10000 },
              { label: "Micro (10K–100K)", min: 10000, max: 100000 },
              { label: "Mid (100K–500K)", min: 100000, max: 500000 },
              { label: "Any", min: 1000, max: 500000 },
            ].map((preset) => {
              const active = minSubs === preset.min && maxSubs === preset.max
              return (
                <button
                  key={preset.label}
                  onClick={() => { if (!running) { setMinSubs(preset.min); setMaxSubs(preset.max) } }}
                  disabled={running}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={active
                    ? { background: "hsl(243 75% 59% / 0.1)", border: "1px solid hsl(243 75% 59% / 0.3)", color: "hsl(243 75% 50%)" }
                    : { background: "hsl(220 14% 96%)", border: "1px solid hsl(220 13% 91%)", color: "hsl(220 9% 46%)" }
                  }
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          {running && <p className="text-xs text-muted-foreground/50 mt-3">Stop AutoLead to change range</p>}
        </div>

        {/* Activity log */}
        <div className="bg-white rounded-2xl overflow-hidden border border-border shadow-sm">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Activity Log</h3>
            {log.length > 0 && (
              <button onClick={() => setLog([])} className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">Clear</button>
            )}
          </div>
          <div className="h-72 overflow-y-auto p-4 space-y-1.5">
            {log.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40">
                <Zap className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No activity yet</p>
                <p className="text-xs mt-1">Start AutoLead to see live updates</p>
              </div>
            ) : (
              log.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 bg-muted/40">
                  {logIcons[entry.type]}
                  <span className={`text-xs flex-1 min-w-0 leading-relaxed ${logColors[entry.type]}`}>{entry.message}</span>
                  <span className="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums mt-0.5">
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
