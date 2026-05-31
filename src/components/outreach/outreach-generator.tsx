"use client"
import { useState } from "react"
import { Loader2, Sparkles, Copy, Send, Check, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import type { Lead, ServiceType, OutreachChannel } from "@/types"

interface OutreachGeneratorProps {
  lead: Lead
  serviceType: ServiceType
  orgId: string
}

export function OutreachGenerator({ lead, serviceType, orgId }: OutreachGeneratorProps) {
  const [config, setConfig] = useState({
    agencyName: "",
    agencyValueProp: "",
    tone: "professional" as "professional" | "casual" | "direct",
    outreachChannel: "email" as OutreachChannel,
    selectedService: serviceType,
  })
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generated, setGenerated] = useState<{ subject: string; body: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function update<K extends keyof typeof config>(key: K, value: typeof config[K]) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  async function handleGenerate() {
    if (!lead.channel) return
    setGenerating(true)
    try {
      const res = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: lead.channel,
          serviceType: config.selectedService,
          tone: config.tone,
          outreachChannel: config.outreachChannel,
          agencyName: config.agencyName || "Your Agency",
          agencyValueProp: config.agencyValueProp || "We help YouTube channels grow with professional services",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGenerated(data)
      toast({ title: "Message generated!" })
    } catch (err) {
      toast({ title: "Generation failed", description: err instanceof Error ? err.message : "Please try again", variant: "destructive" })
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    if (!generated) return
    const text = config.outreachChannel === "email"
      ? `Subject: ${generated.subject}\n\n${generated.body}`
      : generated.body
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: "Copied to clipboard!" })
  }

  async function handleSaveDraft() {
    if (!generated) return
    setSaving(true)
    try {
      await fetch("/api/outreach/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          channel: config.outreachChannel,
          subject: generated.subject,
          body: generated.body,
          status: "pending",
        }),
      })
      toast({ title: "Draft saved" })
    } catch {
      toast({ title: "Failed to save draft", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkSent() {
    if (!generated) return
    setSaving(true)
    try {
      await fetch("/api/outreach/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          channel: config.outreachChannel,
          subject: generated.subject,
          body: generated.body,
          status: "sent",
        }),
      })
      toast({ title: "Marked as sent", description: "Lead moved to Contacted stage" })
    } catch {
      toast({ title: "Failed", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Outreach Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Agency Name</Label>
              <Input
                placeholder="Your Agency"
                value={config.agencyName}
                onChange={e => update("agencyName", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Service</Label>
              <Select value={config.selectedService} onValueChange={v => update("selectedService", v as ServiceType)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editing">Video Editing</SelectItem>
                  <SelectItem value="thumbnails">Thumbnails</SelectItem>
                  <SelectItem value="scripting">Scriptwriting</SelectItem>
                  <SelectItem value="growth">Channel Growth</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Your Value Proposition</Label>
            <Input
              placeholder="e.g. We increased retention by 40% for 20+ channels in your niche"
              value={config.agencyValueProp}
              onChange={e => update("agencyValueProp", e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tone</Label>
              <Select value={config.tone} onValueChange={v => update("tone", v as typeof config.tone)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual & Friendly</SelectItem>
                  <SelectItem value="direct">Direct & Concise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Outreach Channel</Label>
              <Select value={config.outreachChannel} onValueChange={v => update("outreachChannel", v as OutreachChannel)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="twitter">Twitter DM</SelectItem>
                  <SelectItem value="instagram">Instagram DM</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating with AI...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Generate Personalized Message</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Message */}
      {generated && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Generated Message</CardTitle>
              <div className="flex items-center gap-1">
                <Badge variant="info" className="text-xs">AI Generated</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleGenerate} disabled={generating}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.outreachChannel === "email" && generated.subject && (
              <div>
                <Label className="text-xs text-muted-foreground">SUBJECT</Label>
                <p className="text-sm font-semibold mt-1 p-2 bg-muted rounded">{generated.subject}</p>
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">MESSAGE</Label>
              <Textarea
                value={generated.body}
                onChange={e => setGenerated(prev => prev ? { ...prev, body: e.target.value } : null)}
                rows={10}
                className="mt-1 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1">
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving} className="flex-1">
                Save Draft
              </Button>
              <Button size="sm" onClick={handleMarkSent} disabled={saving} className="flex-1">
                <Send className="mr-2 h-4 w-4" />
                Mark as Sent
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
