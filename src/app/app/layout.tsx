import { Sidebar } from "@/components/layout/sidebar"
import { Toaster } from "@/components/ui/toaster"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden relative" style={{ background: "var(--sl-bg-0)", color: "var(--sl-fg-1)" }}>
      {/* Ambient background */}
      <div className="sl-app-bg" aria-hidden="true">
        <div className="sl-orb sl-orb-1" />
        <div className="sl-orb sl-orb-2" />
        <div className="sl-orb sl-orb-3" />
        <div className="sl-orb sl-orb-4" />
        <div className="sl-grid-overlay" />
      </div>
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden relative z-10">
        {children}
      </main>
      <Toaster />
    </div>
  )
}
