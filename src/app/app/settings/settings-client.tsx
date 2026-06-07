"use client"
import { useState, useEffect } from "react"
import {
  User, Building2, Zap, Shield, Bell, ChevronRight,
  Check, Loader2, Mail, Key, Trash2, Send,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import type { ServiceType } from "@/types"

const SERVICE_LABELS: Record<ServiceType, string> = {
  editing: "Video Editing",
  thumbnails: "Thumbnail Design",
  scripting: "Scriptwriting",
  growth: "Channel Growth",
  custom: "Custom / Multiple",
}

const PLAN_STYLES: Record<string, { label: string; gradient: string; glow: string }> = {
  free:       { label: "Free",       gradient: "linear-gradient(135deg, hsl(220 9% 42%), hsl(220 9% 34%))",    glow: "hsl(220 9% 50% / 0.3)" },
  starter:    { label: "Starter",    gradient: "linear-gradient(135deg, hsl(213 90% 60%), hsl(189 90% 50%))",  glow: "hsl(199 90% 55% / 0.3)" },
  growth:     { label: "Growth",     gradient: "linear-gradient(135deg, hsl(243 75% 62%), hsl(280 75% 62%))",  glow: "hsl(243 75% 59% / 0.3)" },
  agency:     { label: "Agency",     gradient: "linear-gradient(135deg, hsl(0 84% 60%), hsl(25 95% 58%))",     glow: "hsl(350 80% 60% / 0.3)" },
  enterprise: { label: "Enterprise", gradient: "linear-gradient(135deg, hsl(43 96% 56%), hsl(25 95% 58%))",    glow: "hsl(38 90% 55% / 0.3)" },
}

const CARD_STYLE = {
  background: "#0d1117",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  boxShadow: "0 4px 16px hsl(225 40% 2% / 0.45)",
}

const INPUT_STYLE = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--sl-fg-1)",
}

interface Props {
  userId: string
  email: string
  fullName: string
  orgId: string
  orgName: string
  serviceType: ServiceType
  planTier: string
}

export function SettingsClient({ userId, email, fullName, orgId, orgName, serviceType, planTier }: Props) {
  const [name, setName]             = useState(fullName)
  const [agency, setAgency]         = useState(orgName)
  const [service, setService]       = useState<ServiceType>(serviceType)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savedProfile, setSavedProfile]   = useState(false)

  const [newPassword, setNewPassword]     = useState("")
  const [savingPw, setSavingPw]           = useState(false)

  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null; configured: boolean }>({ connected: false, email: null, configured: true })
  const [gmailLoading, setGmailLoading]   = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    fetch("/api/gmail/status").then(r => r.json()).then(setGmail).catch(() => {}).finally(() => setGmailLoading(false))

    // Feedback when returning from the Google OAuth flow.
    const status = new URLSearchParams(window.location.search).get("gmail")
    if (status === "connected") toast({ title: "Gmail connected!", description: "You can now send emails directly from the app." })
    else if (status === "denied") toast({ title: "Connection cancelled", variant: "destructive" })
    else if (status === "not_configured") toast({ title: "Gmail isn't set up", description: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment.", variant: "destructive" })
    else if (status === "retry") toast({ title: "Please reconnect", description: "Google didn't return a refresh token. Remove app access in your Google account, then try again.", variant: "destructive" })
    else if (status === "error") toast({ title: "Gmail connection failed", variant: "destructive" })
    if (status) window.history.replaceState({}, "", "/app/settings")
  }, [])

  function handleConnectGmail() {
    window.location.href = "/api/gmail/connect"
  }

  async function handleDisconnectGmail() {
    setDisconnecting(true)
    try {
      const res = await fetch("/api/gmail/disconnect", { method: "POST" })
      if (!res.ok) throw new Error()
      setGmail(g => ({ ...g, connected: false, email: null }))
      toast({ title: "Gmail disconnected" })
    } catch {
      toast({ title: "Failed to disconnect", variant: "destructive" })
    } finally {
      setDisconnecting(false)
    }
  }

  const plan = PLAN_STYLES[planTier] ?? PLAN_STYLES.free

  async function handleSaveProfile() {
    setSavingProfile(true)
    try {
      const supabase = createClient()
      const [profileRes, orgRes] = await Promise.all([
        supabase.from("profiles").update({ full_name: name }).eq("id", userId),
        supabase.from("organizations").update({ name: agency, service_type: service }).eq("id", orgId),
      ])
      if (profileRes.error) throw profileRes.error
      if (orgRes.error) throw orgRes.error
      setSavedProfile(true)
      setTimeout(() => setSavedProfile(false), 2500)
      toast({ title: "Profile saved!" })
    } catch {
      toast({ title: "Failed to save", variant: "destructive" })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" })
      return
    }
    setSavingPw(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword("")
      toast({ title: "Password updated!" })
    } catch (e: unknown) {
      toast({ title: "Failed to update password", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Plan badge */}
        <div className="animate-fade-in-up flex items-center gap-4 p-5" style={CARD_STYLE}>
          <div
            className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: plan.gradient, boxShadow: `0 8px 24px ${plan.glow}` }}
          >
            <Zap className="h-5 w-5 text-white" fill="white" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--sl-fg-3)" }}>Current Plan</p>
            <p className="text-xl font-extrabold mt-0.5" style={{ color: "var(--sl-fg-1)" }}>{plan.label}</p>
          </div>
          <button
            className="pressable flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--sl-fg-2)", background: "rgba(255,255,255,0.04)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)" }}
          >
            Upgrade <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Profile & Agency */}
        <div className="animate-fade-in-up p-5" style={{ ...CARD_STYLE, animationDelay: "60ms" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, hsl(243 75% 62%), hsl(280 75% 62%))" }}>
              <User className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm" style={{ color: "var(--sl-fg-1)" }}>Profile & Agency</h2>
              <p className="text-xs" style={{ color: "var(--sl-fg-3)" }}>Your personal and agency details</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--sl-fg-3)" }}>Full Name</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="John Smith"
                  className="rounded-xl"
                  style={INPUT_STYLE}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--sl-fg-3)" }}>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--sl-fg-3)" }} />
                  <Input value={email} disabled className="rounded-xl pl-9" style={{ ...INPUT_STYLE, opacity: 0.5 }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--sl-fg-3)" }}>
                  <Building2 className="inline h-3 w-3 mr-1" />Agency Name
                </Label>
                <Input
                  value={agency}
                  onChange={e => setAgency(e.target.value)}
                  placeholder="Apex Edits"
                  className="rounded-xl"
                  style={INPUT_STYLE}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--sl-fg-3)" }}>Service Type</Label>
                <Select value={service} onValueChange={v => setService(v as ServiceType)}>
                  <SelectTrigger className="rounded-xl" style={INPUT_STYLE}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SERVICE_LABELS) as [ServiceType, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="btn-glow w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              {savingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedProfile ? (
                <><Check className="h-4 w-4" /> Saved!</>
              ) : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Email sending (Gmail) */}
        <div className="animate-fade-in-up p-5" style={{ ...CARD_STYLE, animationDelay: "90ms" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, hsl(0 84% 60%), hsl(25 95% 58%))" }}>
              <Send className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-sm" style={{ color: "var(--sl-fg-1)" }}>Email Sending</h2>
              <p className="text-xs" style={{ color: "var(--sl-fg-3)" }}>Connect Gmail to send outreach directly from the app</p>
            </div>
          </div>

          {gmailLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm" style={{ color: "var(--sl-fg-3)" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
            </div>
          ) : !gmail.configured ? (
            <div className="rounded-xl px-4 py-3 text-xs leading-relaxed" style={{ border: "1px solid rgba(251,191,36,0.2)", background: "rgba(251,191,36,0.08)", color: "hsl(43 96% 68%)" }}>
              Gmail sending isn&apos;t set up on the server yet. Enable the Google provider in Supabase (Auth → Providers) and add the same <code className="font-mono font-semibold">GOOGLE_CLIENT_ID</code> / <code className="font-mono font-semibold">GOOGLE_CLIENT_SECRET</code> to your environment, then reload.
            </div>
          ) : gmail.connected ? (
            <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: "#34d399", boxShadow: "0 0 0 3px rgba(52,211,153,0.15)" }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--sl-fg-1)" }}>{gmail.email}</p>
                  <p className="text-xs" style={{ color: "var(--sl-fg-3)" }}>Connected — ready to send</p>
                </div>
              </div>
              <button
                onClick={handleDisconnectGmail}
                disabled={disconnecting}
                className="pressable shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--sl-fg-2)", background: "rgba(255,255,255,0.04)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)" }}
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disconnect"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleConnectGmail}
                className="pressable inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--sl-fg-2)", background: "rgba(255,255,255,0.04)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)" }}
              >
                <Send className="h-4 w-4" />
                Connect Gmail
              </button>
              <p className="text-xs" style={{ color: "var(--sl-fg-3)" }}>
                Reconnects via Google and grants permission to send. Tip: signing in with Google connects this automatically.
              </p>
            </div>
          )}
        </div>

        {/* Security */}
        <div className="animate-fade-in-up p-5" style={{ ...CARD_STYLE, animationDelay: "120ms" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, hsl(43 96% 56%), hsl(25 95% 58%))" }}>
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm" style={{ color: "var(--sl-fg-1)" }}>Security</h2>
              <p className="text-xs" style={{ color: "var(--sl-fg-3)" }}>Update your password</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--sl-fg-3)" }}>
                <Key className="inline h-3 w-3 mr-1" />New Password
              </Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="rounded-xl"
                style={INPUT_STYLE}
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={savingPw || newPassword.length < 8}
              className="pressable flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--sl-fg-2)", background: "rgba(255,255,255,0.04)" }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)" }}
            >
              {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Update Password
            </button>
          </div>
        </div>

        {/* Notifications placeholder */}
        <div className="animate-fade-in-up p-5" style={{ ...CARD_STYLE, animationDelay: "180ms" }}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, hsl(213 90% 60%), hsl(189 90% 50%))" }}>
              <Bell className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-sm" style={{ color: "var(--sl-fg-1)" }}>Notifications</h2>
              <p className="text-xs" style={{ color: "var(--sl-fg-3)" }}>Email alerts and follow-up reminders</p>
            </div>
            <span className="text-xs font-medium rounded-full px-2.5 py-1" style={{ color: "var(--sl-fg-3)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>Coming soon</span>
          </div>
        </div>

        {/* Danger zone */}
        <div className="animate-fade-in-up p-5" style={{ ...CARD_STYLE, animationDelay: "240ms", border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.04)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, hsl(0 84% 60%), hsl(340 80% 55%))" }}>
              <Trash2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm" style={{ color: "#f87171" }}>Danger Zone</h2>
              <p className="text-xs" style={{ color: "rgba(248,113,113,0.7)" }}>Irreversible actions</p>
            </div>
          </div>
          <button
            className="pressable flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{ border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", background: "rgba(248,113,113,0.08)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.14)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.08)" }}
            onClick={() => toast({ title: "Contact support to delete your account", variant: "destructive" })}
          >
            <Trash2 className="h-4 w-4" />
            Delete Account
          </button>
        </div>

      </div>
      <Toaster />
    </>
  )
}
