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

/* ── The icon mark ─────────────────────────────────────────────────── */
export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(243,75%,59%)" />
          <stop offset="100%" stopColor="hsl(280,75%,60%)" />
        </linearGradient>
        <linearGradient id="lm-bolt" x1="13" y1="4" x2="19" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="lm-dot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(38,95%,65%)" />
          <stop offset="100%" stopColor="hsl(20,95%,60%)" />
        </linearGradient>
        <filter id="lm-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Rounded square background */}
      <rect width="32" height="32" rx="9" fill="url(#lm-bg)" />

      {/* Subtle inner highlight */}
      <rect width="32" height="32" rx="9" fill="url(#lm-bg)" opacity="0" />
      <path d="M0 9 Q0 0 9 0 H23 Q32 0 32 9" fill="white" opacity="0.08" />

      {/* Lightning bolt */}
      <path
        d="M18 5L10 17.5H16L14 27L22 14.5H16L18 5Z"
        fill="url(#lm-bolt)"
        filter="url(#lm-glow)"
      />

      {/* Orange accent dot */}
      <circle cx="23" cy="9" r="3.5" fill="url(#lm-dot)" />
    </svg>
  )
}

/* ── Full logo (mark + wordmark) ───────────────────────────────────── */
export function Logo({ variant = "dark", size = "md", className, markOnly = false }: LogoProps) {
  const sizes = {
    sm: { mark: 26, name: "text-sm",  sub: "text-[10px]", gap: "gap-2" },
    md: { mark: 32, name: "text-sm",  sub: "text-[11px]", gap: "gap-2.5" },
    lg: { mark: 40, name: "text-base", sub: "text-xs",    gap: "gap-3" },
  }

  const s = sizes[size]
  const nameColor  = variant === "dark" ? "text-white"                      : "text-[hsl(224,71%,4%)]"
  const subColor   = variant === "dark" ? "text-[hsl(220,9%,55%)]"          : "text-[hsl(220,9%,50%)]"

  if (markOnly) return <LogoMark size={s.mark} className={className} />

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <LogoMark size={s.mark} />
      <div className="leading-none">
        <p className={cn("font-bold leading-none tracking-tight", s.name, nameColor)}>
          YT Lead Op
        </p>
        <p className={cn("mt-0.5 font-medium leading-none", s.sub, subColor)}>
          AI Lead Platform
        </p>
      </div>
    </div>
  )
}
