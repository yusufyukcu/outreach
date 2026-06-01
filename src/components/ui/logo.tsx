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
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="sl-g1" x1="2" y1="2" x2="30" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(243,75%,65%)" />
          <stop offset="100%" stopColor="hsl(280,75%,56%)" />
        </linearGradient>
        <linearGradient id="sl-g2" x1="28" y1="8" x2="44" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(280,75%,68%)" />
          <stop offset="100%" stopColor="hsl(243,75%,72%)" />
        </linearGradient>
      </defs>

      {/*
        Left piece: rounded square rotated 45° — the "filled diamond" shape.
        Center at (18,22), size ~22×22, rx=5 before rotation.
        We draw it as a path with rounded corners manually.
      */}
      <rect
        x="5"
        y="5"
        width="26"
        height="26"
        rx="6"
        transform="rotate(45 18 22)"
        fill="url(#sl-g1)"
      />

      {/* Right piece: open chevron > */}
      <path
        d="M30 13 L40 22 L30 31"
        stroke="url(#sl-g2)"
        strokeWidth="5.5"
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
