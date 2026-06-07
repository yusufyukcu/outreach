"use client"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface HeaderProps {
  title: string
  subtitle?: string
  children?: React.ReactNode
}

export function Header({ title, subtitle, children }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4 sticky top-0 z-10 backdrop-blur-md" style={{ background: "rgba(13,17,23,0.75)", borderColor: "rgba(255,255,255,0.07)" }}>
      <div className="animate-fade-in">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {children}
        <Button variant="ghost" size="icon" className="rounded-xl relative hover:bg-primary/8 transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500" />
        </Button>
        <Avatar className="h-8 w-8 ring-2 ring-primary/20 transition-all hover:ring-primary/40">
          <AvatarImage src="" />
          <AvatarFallback
            className="text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
          >
            YO
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
