import { cn } from "@/lib/utils"

interface LogoMarkProps {
  size?: number
  className?: string
}

interface LogoProps {
  variant?: "light" | "dark"
  size?: "sm" | "md" | "lg"
  className?: string
  markOnly?: boolean
}

/* ── The icon mark — double chevron ───────────────────────────────── */
export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="sl-fill" x1="8" y1="8" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(243,75%,68%)" />
          <stop offset="100%" stopColor="hsl(280,75%,58%)" />
        </linearGradient>
      </defs>

      {/* Left piece: rounded square rotated 45° (diamond) */}
      <rect
        x="14"
        y="14"
        width="34"
        height="34"
        rx="8"
        transform="rotate(45 31 31)"
        fill="url(#sl-fill)"
      />

      {/* Right piece: chevron > with rounded caps */}
      <path
        d="M54 24 L68 40 L54 56"
        stroke="url(#sl-fill)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/* ── Full logo (mark + wordmark) ───────────────────────────────────── */
export function Logo({ variant = "dark", size = "md", className, markOnly = false }: LogoProps) {
  const sizes = {
    sm: { mark: 26, name: "text-sm",   sub: "text-[10px]", gap: "gap-2" },
    md: { mark: 32, name: "text-sm",   sub: "text-[11px]", gap: "gap-2.5" },
    lg: { mark: 40, name: "text-base", sub: "text-xs",     gap: "gap-3" },
  }

  const s = sizes[size]
  const nameColor = variant === "dark" ? "text-white"             : "text-[hsl(224,71%,4%)]"
  const subColor  = variant === "dark" ? "text-[hsl(220,9%,55%)]" : "text-[hsl(220,9%,50%)]"

  if (markOnly) return <LogoMark size={s.mark} className={className} />

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <LogoMark size={s.mark} />
      <div className="leading-none">
        <p className={cn("font-bold leading-none tracking-tight", s.name, nameColor)}>
          StuckLead Operator
        </p>
        <p className={cn("mt-0.5 font-medium leading-none", s.sub, subColor)}>
          AI Lead Platform
        </p>
      </div>
    </div>
  )
}
