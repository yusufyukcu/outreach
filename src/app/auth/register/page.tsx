"use client"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, X } from "lucide-react"
import { GoogleButton } from "@/components/auth/google-button"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import type { ServiceType } from "@/types"

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
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
          full_name: `${form.firstName} ${form.lastName}`.trim(),
          org_name: form.orgName || `${form.firstName}'s Agency`,
          service_type: form.serviceType,
        },
      },
    })

    if (error) {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" })
      setLoading(false)
      return
    }

    toast({ title: "Account created!", description: "Welcome to StuckLead" })
    router.push("/app/dashboard")
    router.refresh()
  }

  const inputClass = "w-full rounded-[12px] px-4 py-3 text-[14px] focus:outline-none transition-colors"
  const inputStyle = {
    background: "#1A1A1A",
    border: "1px solid transparent",
    color: "white",
  }

  return (
    <div
      className="h-screen w-full overflow-hidden flex flex-col lg:flex-row"
      style={{ backgroundColor: "#000000", color: "white" }}
    >
      {/* ── Left: video hero ──────────────────────────────────────────── */}
      <div className="hidden lg:flex w-1/2 relative h-full flex-col justify-center items-center overflow-hidden m-4 rounded-[32px]">
        <video
          className="absolute inset-0 w-full h-full object-cover z-0"
          autoPlay muted loop playsInline
          src={VIDEO_URL}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/80 via-black/20 to-black/80" />
        <div className="absolute inset-0 z-0" style={{ background: "rgba(139,92,246,0.2)", mixBlendMode: "overlay" }} />

        <div className="relative z-10 flex flex-col h-full justify-center items-center text-center w-full max-w-sm px-6">
          <div className="flex items-center gap-2 mb-8 stagger-item" style={{ animationDelay: "0.2s" }}>
            <span
              className="font-bold text-xl tracking-tight text-white"
              style={{ fontFamily: "'General Sans', sans-serif" }}
            >
              StuckLead
            </span>
          </div>
          <div className="w-full">
            <h1
              className="text-4xl font-semibold mb-3 stagger-item"
              style={{ fontFamily: "'General Sans', sans-serif", color: "#e7e0ed", animationDelay: "0.35s" }}
            >
              Join StuckLead
            </h1>
            <p
              className="text-base leading-relaxed stagger-item"
              style={{ color: "rgba(255,255,255,0.6)", animationDelay: "0.45s" }}
            >
              The all-in-one platform for video editors to find leads, automate outreach, and scale their business.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right: form ───────────────────────────────────────────────── */}
      <div className="flex-1 h-full overflow-y-auto flex items-center justify-center p-4 lg:p-10 relative">
        {/* Close button */}
        <Link
          href="/"
          className="absolute top-8 right-8 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{
            background: "#1A1A1A",
            border: "1px solid rgba(255,255,255,0.05)",
            color: "rgba(203,195,215,0.7)",
          }}
        >
          <X className="h-5 w-5" />
        </Link>

        <div className="w-full max-w-[400px]">
          {/* Header */}
          <div className="mb-10 text-center stagger-item" style={{ animationDelay: "0.2s" }}>
            <h2
              className="text-3xl font-semibold mb-2"
              style={{ fontFamily: "'General Sans', sans-serif", color: "#e7e0ed" }}
            >
              Create New Profile
            </h2>
            <p className="text-sm" style={{ color: "rgba(203,195,215,0.7)" }}>
              Input your basic details to begin the journey.
            </p>
          </div>

          {/* Google login */}
          <div className="mb-6 stagger-item" style={{ animationDelay: "0.3s" }}>
            <GoogleButton next="/app/dashboard" label="Sign up with Google" />
          </div>

          {/* Divider */}
          <div className="relative flex items-center mb-6 stagger-item" style={{ animationDelay: "0.4s" }}>
            <div className="flex-grow border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }} />
            <span
              className="flex-shrink-0 mx-6 text-[11px] tracking-widest uppercase"
              style={{ color: "rgba(203,195,215,0.5)" }}
            >
              Or
            </span>
            <div className="flex-grow border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 stagger-item" style={{ animationDelay: "0.5s" }}>
            {/* First + Last Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium mb-2" style={{ color: "white" }}>First Name</label>
                <input
                  type="text"
                  placeholder="ex. Alex"
                  value={form.firstName}
                  onChange={e => update("firstName", e.target.value)}
                  required
                  className={inputClass}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "transparent")}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-2" style={{ color: "white" }}>Last Name</label>
                <input
                  type="text"
                  placeholder="ex. Sterling"
                  value={form.lastName}
                  onChange={e => update("lastName", e.target.value)}
                  required
                  className={inputClass}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "transparent")}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-[13px] font-medium mb-2" style={{ color: "white" }}>Email</label>
              <input
                type="email"
                placeholder="ex. alex.s@stucklead.io"
                value={form.email}
                onChange={e => update("email", e.target.value)}
                required
                className={inputClass}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
                onBlur={e => (e.currentTarget.style.borderColor = "transparent")}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[13px] font-medium mb-2" style={{ color: "white" }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Secure your account"
                  value={form.password}
                  onChange={e => update("password", e.target.value)}
                  minLength={8}
                  required
                  className={`${inputClass} pr-12`}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "transparent")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="mt-2 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Requires at least 8 symbols.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-black font-semibold py-3.5 rounded-[12px] transition-colors mt-8 flex items-center justify-center gap-2 hover:bg-gray-200 disabled:opacity-60"
              style={{ background: "white", fontSize: "14px" }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Account
            </button>
          </form>

          {/* Login link */}
          <div className="mt-8 text-center stagger-item" style={{ animationDelay: "0.6s" }}>
            <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              Member of the team?{" "}
              <Link
                href="/auth/login"
                className="text-white hover:text-gray-300 transition-colors font-medium"
              >
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
