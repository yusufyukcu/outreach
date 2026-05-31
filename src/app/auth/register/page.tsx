"use client"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlayCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg mb-3">
            <PlayCircle className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Get Started Free</h1>
          <p className="text-sm text-muted-foreground">14-day free trial, no credit card required</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>Set up your agency profile to start finding leads</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" placeholder="John Smith" value={form.fullName} onChange={e => update("fullName", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgName">Agency Name</Label>
                  <Input id="orgName" placeholder="Smith Edits" value={form.orgName} onChange={e => update("orgName", e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceType">Your Service</Label>
                <Select value={form.serviceType} onValueChange={v => update("serviceType", v)}>
                  <SelectTrigger>
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
                <Input id="email" type="email" placeholder="you@agency.com" value={form.email} onChange={e => update("email", e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" minLength={8} value={form.password} onChange={e => update("password", e.target.value)} required />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Free Account
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                By creating an account, you agree to our Terms of Service
              </p>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="font-medium text-primary hover:underline">Sign in</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
