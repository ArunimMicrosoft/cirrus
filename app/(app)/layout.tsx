import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AuthGate } from "@/components/layout/AuthGate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar className="hidden md:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl animate-fade-in space-y-6 px-6 py-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
