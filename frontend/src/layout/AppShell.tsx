import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink } from "react-router";
import { FiMenu, FiSearch, FiBarChart2, FiSettings } from "react-icons/fi";
import { useStatus } from "../context/StatusContext";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { status, isLive, lastUpdate } = useStatus();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const running = status?.running ?? false;
  const jobType = status?.job_type ?? null;

  const statusLabel = running
    ? jobType === "crawl+monitor"
      ? "Crawling + Monitoring"
      : jobType || "Crawling"
    : "Idle";

  const statusColor = running ? "bg-emerald-500" : "bg-slate-500";

  const sseLabel = isLive ? "Live" : "Polling";
  const sseColor = isLive ? "bg-sky-500" : "bg-amber-500";

  const lastUpdateLabel = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString()
    : "—";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed z-30 inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-200 ease-out
                   md:translate-x-0 md:static md:flex-shrink-0`}
      >
        <div className="h-16 px-4 flex items-center border-b border-slate-800">
          <div className="w-8 h-8 rounded bg-sky-500 mr-3" />
          <div>
            <div className="font-semibold tracking-tight">
              Smart File Finder
            </div>
            <div className="text-xs text-slate-400">
              Crawler & Search Console
            </div>
          </div>
        </div>

        <nav className="mt-4 px-2 space-y-1">
          <NavItem
            to="/search"
            icon={<FiSearch />}
            label="Search"
            onClick={() => setSidebarOpen(false)}
          />
          <NavItem
            to="/stats"
            icon={<FiBarChart2 />}
            label="Stats"
            onClick={() => setSidebarOpen(false)}
          />
          <NavItem
            to="/settings"
            icon={<FiSettings />}
            label="Settings"
            onClick={() => setSidebarOpen(false)}
          />
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded hover:bg-slate-800"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <FiMenu className="w-5 h-5" />
            </button>
            <div className="hidden md:block text-sm text-slate-400">
              {running
                ? "Crawler is running"
                : "Crawler is idle. Start a crawl from Settings or controls."}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full ${statusColor} text-slate-50 text-[10px] font-semibold`}
              >
                {statusLabel}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full ${sseColor} text-slate-50 text-[10px] font-semibold`}
              >
                {sseLabel}
              </span>
            </div>
            <div className="text-slate-500">
              Updated:
              <span className="ml-1 text-slate-300">{lastUpdateLabel}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-4 overflow-auto bg-slate-950">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

interface NavItemProps {
  to: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}

function NavItem({ to, icon, label, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
          isActive
            ? "bg-sky-600 text-white"
            : "text-slate-300 hover:bg-slate-800 hover:text-white",
        ].join(" ")
      }
    >
      <span className="w-4 h-4">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}