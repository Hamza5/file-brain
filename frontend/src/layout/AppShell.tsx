import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink } from "react-router";
import { Sidebar } from "primereact/sidebar";
import { Button } from "primereact/button";
import { useStatus } from "../context/StatusContext";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { status, isLive, lastUpdate } = useStatus();
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const running = status?.running ?? false;
  const jobType = status?.job_type ?? null;

  const statusLabel = running
    ? jobType === "crawl+monitor"
      ? "Crawling + Monitoring"
      : jobType || "Crawling"
    : "Idle";

  const sseLabel = isLive ? "Live (SSE)" : "Polling";
  const lastUpdateLabel = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString()
    : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--surface-border)",
          backgroundColor: "var(--surface-card)",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Button
            icon="fas fa-bars"
            className="p-button-text p-button-rounded"
            onClick={() => setSidebarVisible(true)}
            aria-label="Toggle sidebar"
            style={{
              color: "var(--text-color)",
              width: "2.5rem",
              height: "2.5rem",
            }}
          />
          <div style={{ fontSize: "0.85rem", color: "var(--text-color-secondary)" }}>
            {running
              ? "Crawler is running"
              : "Crawler is idle. Start a crawl from Settings."}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.75rem" }}>
          <span
            className="p-tag"
            style={{
              backgroundColor: running
                ? "var(--green-500)"
                : "var(--surface-border)",
              color: running ? "white" : "var(--text-color)",
            }}
          >
            {statusLabel}
          </span>
          <span
            className="p-tag"
            style={{
              backgroundColor: isLive
                ? "var(--blue-500)"
                : "var(--orange-300)",
              color: "white",
            }}
          >
            {sseLabel}
          </span>
          <span style={{ color: "var(--text-color-secondary)" }}>
            Updated: <span>{lastUpdateLabel}</span>
          </span>
        </div>
      </header>

      {/* Sidebar */}
      <Sidebar
        visible={sidebarVisible}
        onHide={() => setSidebarVisible(false)}
        style={{ width: "250px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1rem",
            borderBottom: "1px solid var(--surface-border)",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              backgroundColor: "var(--primary-color)",
            }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Smart File Finder</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-color-secondary)" }}>
              Crawler & Search Console
            </div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <NavItem
            to="/search"
            icon="fas fa-search"
            label="Search"
            onClick={() => setSidebarVisible(false)}
          />
          <NavItem
            to="/stats"
            icon="fas fa-chart-pie"
            label="Stats"
            onClick={() => setSidebarVisible(false)}
          />
          <NavItem
            to="/settings"
            icon="fas fa-cog"
            label="Settings"
            onClick={() => setSidebarVisible(false)}
          />
        </nav>
      </Sidebar>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          backgroundColor: "var(--surface-ground)",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {children}
        </div>
      </main>
    </div>
  );
}

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
  onClick?: () => void;
}

function NavItem({ to, icon, label, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        isActive ? "p-menuitem-link-active" : "p-menuitem-link"
      }
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        textDecoration: "none",
        color: isActive ? "var(--primary-color)" : "var(--text-color)",
        borderRadius: "6px",
        backgroundColor: isActive ? "var(--primary-color-emphasis)" : "transparent",
        transition: "all 0.2s ease",
        cursor: "pointer",
      })}
    >
      <i className={icon} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}
