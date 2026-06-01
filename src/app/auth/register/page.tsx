"use client"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Zap, Loader2, CheckCircle2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import type { ServiceType } from "@/types"

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    orgName: "",
    serviceType: "editing" as ServiceType,
  })

  function update(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.fullName,
          org_name: form.orgName,
          service_type: form.serviceType,
        },
      },
    })

    if (error) {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" })
      setLoading(false)
      return
    }

    toast({ title: "Account created!", description: "Welcome to YouTube Lead Operator" })
    router.push("/app/dashboard")
    router.refresh()
  }

  const features = [
    "14-day free trial",
    "No credit card required",
    "Cancel anytime",
    "Full AI feature access",
  ]

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, hsl(224 71% 4%), hsl(243 60% 20%))" }}
      >
        {/* Floating blocks */}
        <div className="animate-block-1 absolute top-1/3 left-1/3 w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 opacity-60" />
        <div className="animate-block-2 absolute top-1/2 left-1/5 w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 opacity-50" />
        <div className="animate-block-3 absolute top-1/4 right-1/4 w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 opacity-50" />

        {/* Bottom content */}
        <div className="relative z-10 mt-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">YT Lead Op</span>
          </div>
          <p className="text-white/70 text-sm mb-6">Start finding leads in minutes</p>
          <ul className="space-y-3">
            {features.map(f => (
              <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-md">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">YT Lead Op</span>
          </div>

          <h2 className="text-2xl font-bold mb-1">Create your account</h2>
          <p className="text-sm text-muted-foreground mb-6">Set up your agency profile to start finding leads</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" placeholder="John Smith" value={form.fullName} onChange={e => update("fullName", e.target.value)} className="rounded-xl" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgName">Agency Name</Label>
                <Input id="orgName" placeholder="Smith Edits" value={form.orgName} onChange={e => update("orgName", e.target.value)} className="rounded-xl" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceType">Your Service</Label>
              <Select value={form.serviceType} onValueChange={v => update("serviceType", v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editing">Video Editing</SelectItem>
                  <SelectItem value="thumbnails">Thumbnail Design</SelectItem>
                  <SelectItem value="scripting">Scriptwriting</SelectItem>
                  <SelectItem value="growth">Channel Growth</SelectItem>
                  <SelectItem value="custom">Custom / Multiple</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">This personalizes lead scoring for your service</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input id="email" type="email" placeholder="you@agency.com" value={form.email} onChange={e => update("email", e.target.value)} className="rounded-xl" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" minLength={8} value={form.password} onChange={e => update("password", e.target.value)} className="rounded-xl" required />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold btn-glow disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Free Account
            </button>

            <p className="text-center text-xs text-muted-foreground">
              By creating an account, you agree to our Terms of Service
            </p>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-medium text-primary hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
