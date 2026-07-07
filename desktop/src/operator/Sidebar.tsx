import { Library, Radio, Settings as SettingsIcon, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import ProjectorControl from "./ProjectorControl";

const NAV_ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/console", label: "Console", icon: Radio },
  { to: "/library", label: "Library", icon: Library },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function Sidebar({ connected }: { connected: boolean }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col justify-between bg-neutral-950 px-4 py-6">
      <div className="flex flex-col gap-8">
        <div className="px-2">
          <p className="text-lg font-semibold tracking-tight text-white">Harvest</p>
          <p className="text-[11px] font-medium tracking-widest text-neutral-500 uppercase">Operator Console</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-orange-500/15 text-orange-400"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
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
        <div className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2.5 text-xs">
          {connected ? (
            <Wifi size={15} className="text-green-400" />
          ) : (
            <WifiOff size={15} className="text-red-400" />
          )}
          <span className={connected ? "text-neutral-300" : "text-neutral-500"}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
