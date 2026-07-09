import { BookOpen, Clapperboard, Moon, Settings as SettingsIcon, Sun, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { useSocketStore } from "@/store/socket-store";
import { useThemeStore } from "@/store/theme-store";
import AiCleanupIndicator from "./AiCleanupIndicator";
import ProjectorControl from "./ProjectorControl";

const NAV_ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/bible", label: "Bible", icon: BookOpen },
  { to: "/songs", label: "Songs", icon: Clapperboard },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function Sidebar() {
  const connected = useSocketStore((s) => s.connected);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col justify-between px-4 py-6">
      <div className="flex flex-col gap-8">
        <div className="px-2">
          <p className="text-sidebar-foreground text-lg font-semibold tracking-tight">Harvest</p>
          <p className="text-sidebar-foreground/50 text-[11px] font-medium tracking-widest uppercase">
            Operator Console
          </p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`
              }
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex flex-col gap-3">
        <ProjectorControl />
        <AiCleanupIndicator />
        <div className="bg-sidebar-accent flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-xs">
          <span className="text-sidebar-accent-foreground flex items-center gap-2">
            {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
            {theme === "dark" ? "Dark" : "Light"}
          </span>
          <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} size="sm" />
        </div>
        <div className="bg-sidebar-accent flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs">
          {connected ? <Wifi size={15} className="text-green-400" /> : <WifiOff size={15} className="text-red-400" />}
          <span
            className={
              connected ? "text-sidebar-accent-foreground" : "text-sidebar-accent-foreground/50"
            }
          >
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
