"use client"
import { useState } from "react"
import { Briefcase, Plus, Loader2, Trash2, Sparkles, ExternalLink, Award } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import type { WorkExperience } from "@/types"

interface Props {
  initialExperiences: WorkExperience[]
}

export function CareerClient({ initialExperiences }: Props) {
  const [experiences, setExperiences] = useState<WorkExperience[]>(initialExperiences)
  const [channelName, setChannelName] = useState("")
  const [role, setRole] = useState("")
  const [result, setResult] = useState("")
  const [channelUrl, setChannelUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleAdd() {
    if (!channelName.trim()) {
      toast({ title: "Channel name is required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/career", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_name: channelName, role, result, channel_url: channelUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setExperiences((prev) => [data as WorkExperience, ...prev])
      setChannelName(""); setRole(""); setResult(""); setChannelUrl("")
      toast({ title: "Experience added!", description: "It will be referenced in your outreach emails" })
    } catch (e) {
      toast({ title: "Failed to add", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/career?id=${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setExperiences((prev) => prev.filter((e) => e.id !== id))
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Intro / how it works */}
        <div className="animate-fade-in-up flex items-start gap-3 rounded-2xl border border-violet-200/60 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-violet-900">Your track record powers better outreach</p>
            <p className="text-xs text-violet-600 mt-0.5 leading-relaxed">
              Add channels you&apos;ve worked with. When you generate a cold email, the AI weaves in
              credible social proof like &quot;I&apos;ve previously worked with…&quot; — only if you have experience listed.
            </p>
          </div>
        </div>

        {/* Add form */}
        <div className="animate-fade-in-up rounded-2xl border bg-white p-5 shadow-sm" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
              <Plus className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold leading-none">Add Experience</h2>
              <p className="text-xs text-muted-foreground mt-1">A channel you&apos;ve worked with before</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Channel Name *</Label>
                <Input
                  placeholder="e.g. MrBeast"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  className="h-9 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Your Role</Label>
                <Input
                  placeholder="e.g. Lead Video Editor"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  className="h-9 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Result / Highlight</Label>
              <Input
                placeholder="e.g. Helped grow from 200K to 1.2M subs in 8 months"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="h-9 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Channel URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="https://youtube.com/@channel"
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="h-9 rounded-xl"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="btn-glow pressable inline-flex items-center justify-center gap-2 rounded-xl px-5 h-10 text-sm font-semibold text-white disabled:opacity-60 w-full sm:w-auto"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add to My Career
            </button>
          </div>
        </div>

        {/* Experience list */}
        <div className="animate-fade-in-up rounded-2xl border bg-white p-5 shadow-sm" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center shadow-sm">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold leading-none">Work History</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {experiences.length === 0 ? "No experience added yet" : `${experiences.length} channel${experiences.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          {experiences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <Award className="h-9 w-9 mb-3 opacity-15" />
              <p className="text-sm font-medium">Add your first channel above</p>
              <p className="text-xs mt-1 max-w-xs">Past work makes your cold emails far more convincing.</p>
            </div>
          ) : (
            <div className="space-y-2 stagger-children">
              {experiences.map((exp) => (
                <div
                  key={exp.id}
                  className="group flex items-start gap-3 rounded-xl border bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0 text-xs font-bold text-white shadow-sm">
                    {exp.channel_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{exp.channel_name}</p>
                      {exp.role && (
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          {exp.role}
                        </span>
                      )}
                      {exp.channel_url && (
                        <a
                          href={exp.channel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-indigo-600 transition-colors"
                          title="Open channel"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {exp.result && <p className="text-xs text-muted-foreground mt-0.5">{exp.result}</p>}
                  </div>
                  <button
                    onClick={() => handleDelete(exp.id)}
                    disabled={deletingId === exp.id}
                    className="pressable shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title="Remove"
                  >
                    {deletingId === exp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Toaster />
    </>
  )
}
