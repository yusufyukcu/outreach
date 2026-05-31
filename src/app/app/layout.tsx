import { Sidebar } from "@/components/layout/sidebar"
import { Toaster } from "@/components/ui/toaster"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
      <Toaster />
    </div>
  )
}
