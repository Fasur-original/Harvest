import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import BiblePage from "./BiblePage";
import LivePreview from "./LivePreview";
import Sidebar from "./Sidebar";
import SettingsPage from "./SettingsPage";
import SongsPage from "./SongsPage";

// All live-service and cross-page state now lives in zustand stores
// (src/store/) rather than being lifted and prop-drilled through this
// component -- it's just the sidebar + route shell now.
function OperatorConsole() {
  return (
    <div className="bg-background flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
          <Routes>
            <Route path="/" element={<Navigate to="/bible" replace />} />
            <Route path="/bible" element={<BiblePage />} />
            <Route path="/songs" element={<SongsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/bible" replace />} />
          </Routes>
        </div>
      </main>
      <LivePreview />
      <Toaster position="top-right" />
    </div>
  );
}

export default OperatorConsole;
