import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { InputText } from "primereact/inputtext";
import { Card } from "primereact/card";
import { Message } from "primereact/message";
import {
  getCrawlerSettings,
  updateCrawlerSettings,
  startCrawler,
  stopCrawler,
  clearIndexes,
  listWatchPaths,
  addWatchPath,
  replaceWatchPaths,
  clearWatchPaths,
  type WatchPath,
} from "../api/client";
import { useStatus } from "../context/StatusContext";
import { useNotification } from "../context/NotificationContext";
import { FolderSelectModal } from "../components/FolderSelectModal";

type SettingsState = {
  start_monitoring: boolean;
  include_subdirectories: boolean;
};

export function SettingsPage() {
  const { status } = useStatus();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);

  const [watchPaths, setWatchPaths] = useState<WatchPath[]>([]);
  const [watchPathsLoading, setWatchPathsLoading] = useState(true);
  const [newPath, setNewPath] = useState("");
  const [busyAction, setBusyAction] = useState<
    "start" | "stop" | "clear" | "addPath" | "replace" | "clearPaths" | null
  >(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const running = status?.running ?? false;
  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const raw = await getCrawlerSettings();
        if (!mounted) return;
        setSettings({
          start_monitoring:
            (raw.start_monitoring as boolean | undefined) ?? true,
          include_subdirectories:
            (raw.include_subdirectories as boolean | undefined) ?? true,
        });
      } catch (e) {
        console.error("Failed to load crawler settings", e);
        if (mounted) {
          setActionError("Failed to load crawler settings");
        }
      } finally {
        if (mounted) setLoadingSettings(false);
      }
    }

    async function loadWatchPaths() {
      try {
        const paths = await listWatchPaths(false);
        if (!mounted) return;
        setWatchPaths(paths);
      } catch (e) {
        console.error("Failed to load watch paths", e);
        if (mounted) {
          setActionError("Failed to load watch paths");
        }
      } finally {
        if (mounted) setWatchPathsLoading(false);
      }
    }

    loadSettings();
    loadWatchPaths();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setActionMessage(null);
    setActionError(null);
    try {
      await updateCrawlerSettings({
        start_monitoring: settings.start_monitoring,
        include_subdirectories: settings.include_subdirectories,
      });
      setActionMessage("Settings saved successfully.");
      showSuccess("Settings saved");
    } catch (e) {
      console.error(e);
      setActionError("Failed to save settings.");
      showError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleStart() {
    setBusyAction("start");
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await startCrawler();
      setActionMessage(res.message || "Crawl started.");
      showSuccess("Crawl started");
    } catch (e) {
      console.error(e);
      setActionError("Failed to start crawl. Check watch paths and logs.");
      showError("Failed to start crawl", "Check watch paths and backend logs.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStop() {
    setBusyAction("stop");
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await stopCrawler();
      setActionMessage(res.message || "Crawl stop requested.");
      showSuccess("Crawl stop requested");
    } catch (e) {
      console.error(e);
      setActionError("Failed to stop crawl.");
      showError("Failed to stop crawl");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClear() {
    if (!window.confirm("Clear all indexes? This cannot be undone.")) {
      return;
    }
    setBusyAction("clear");
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await clearIndexes();
      setActionMessage(res.message || "Indexes cleared.");
      showSuccess("Indexes cleared");
    } catch (e) {
      console.error(e);
      const msg =
        "Failed to clear indexes. Ensure crawler is not running and try again.";
      setActionError(msg);
      showError("Failed to clear indexes", msg);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 600,
            color: "var(--text-color)",
          }}
        >
          Settings
        </h1>
        <p
          style={{
            margin: "0.5rem 0 0 0",
            fontSize: "0.9rem",
            color: "var(--text-color-secondary)",
          }}
        >
          Control crawler behavior and manage crawl lifecycle actions.
        </p>
      </div>

      {/* Crawler Controls */}
      <Card style={{ border: "1px solid var(--surface-border)" }}>
        <div style={{ marginBottom: "1rem" }}>
          <h3
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--text-color)",
            }}
          >
            Crawler Controls
          </h3>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Button
            label="Start Crawl"
            icon="fas fa-play"
            onClick={handleStart}
            disabled={running || busyAction !== null}
            loading={busyAction === "start"}
          />
          <Button
            label="Stop Crawl"
            icon="fas fa-stop"
            severity="warning"
            onClick={handleStop}
            disabled={!running || busyAction !== null}
            loading={busyAction === "stop"}
          />
          <Button
            label="Clear Indexes"
            icon="fas fa-trash"
            severity="danger"
            onClick={handleClear}
            disabled={running || busyAction !== null}
            loading={busyAction === "clear"}
          />
        </div>
      </Card>

      {/* Crawler Options */}
      <Card style={{ border: "1px solid var(--surface-border)" }}>
        <div style={{ marginBottom: "1rem" }}>
          <h3
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--text-color)",
            }}
          >
            Crawler Options
          </h3>
        </div>
        {loadingSettings ? (
          <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
            Loading settings…
          </div>
        ) : settings ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Checkbox
                inputId="startMonitoring"
                checked={settings.start_monitoring}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev
                      ? { ...prev, start_monitoring: e.checked ?? false }
                      : prev
                  )
                }
              />
              <label htmlFor="startMonitoring" style={{ cursor: "pointer" }}>
                Start monitoring for file changes automatically after crawl starts
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Checkbox
                inputId="includeSubdirectories"
                checked={settings.include_subdirectories}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev
                      ? {
                          ...prev,
                          include_subdirectories: e.checked ?? false,
                        }
                      : prev
                  )
                }
              />
              <label htmlFor="includeSubdirectories" style={{ cursor: "pointer" }}>
                Include subdirectories when discovering files in watch paths
              </label>
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              <Button
                label={saving ? "Saving…" : "Save Settings"}
                icon="fas fa-save"
                onClick={handleSave}
                disabled={saving}
                loading={saving}
              />
            </div>
          </div>
        ) : null}
      </Card>

      {/* Watch Paths Management */}
      <Card style={{ border: "1px solid var(--surface-border)" }}>
        <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--text-color)",
            }}
          >
            Watch Paths
          </h3>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              label="Sync"
              icon="fas fa-sync"
              size="small"
              outlined
              disabled={busyAction === "replace" || busyAction === "clearPaths"}
              onClick={async () => {
                if (!watchPaths.length) return;
                if (
                  !window.confirm(
                    "Replace all watch paths with the current list as-is?"
                  )
                ) {
                  return;
                }
                try {
                  setBusyAction("replace");
                  setActionError(null);
                  setActionMessage(null);
                  await replaceWatchPaths(watchPaths.map((w) => w.path));
                  setActionMessage("Watch paths replaced.");
                  showSuccess("Watch paths replaced");
                } catch (e) {
                  console.error(e);
                  setActionError("Failed to replace watch paths.");
                  showError("Failed to replace watch paths");
                } finally {
                  setBusyAction(null);
                }
              }}
            />
            <Button
              label="Clear All"
              icon="fas fa-trash"
              size="small"
              severity="danger"
              outlined
              disabled={busyAction === "clearPaths"}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Clear all configured watch paths? This will stop future crawls from using them until new paths are added."
                  )
                ) {
                  return;
                }
                try {
                  setBusyAction("clearPaths");
                  setActionError(null);
                  setActionMessage(null);
                  await clearWatchPaths();
                  setWatchPaths([]);
                  setActionMessage("All watch paths cleared.");
                  showSuccess("All watch paths cleared");
                } catch (e) {
                  console.error(e);
                  setActionError("Failed to clear watch paths.");
                  showError("Failed to clear watch paths");
                } finally {
                  setBusyAction(null);
                }
              }}
            />
          </div>
        </div>

        {watchPathsLoading ? (
          <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
            Loading watch paths…
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <InputText
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/absolute/path/to/index"
                style={{ flex: 1 }}
              />
              <Button
                label="Add"
                icon="fas fa-plus"
                onClick={async () => {
                  if (!newPath.trim()) return;
                  setBusyAction("addPath");
                  setActionError(null);
                  setActionMessage(null);
                  try {
                    const added = await addWatchPath(newPath.trim());
                    setWatchPaths((prev) => [...prev, added]);
                    setNewPath("");
                    setActionMessage("Watch path added.");
                    showSuccess("Watch path added");
                  } catch (e) {
                    console.error(e);
                    const msg =
                      "Failed to add watch path. Ensure it exists and is a directory.";
                    setActionError(msg);
                    showError("Failed to add watch path", msg);
                  } finally {
                    setBusyAction(null);
                  }
                }}
                disabled={busyAction === "addPath"}
              />
              <Button
                label="Browse…"
                icon="fas fa-folder-open"
                outlined
                onClick={() => {
                  setActionError(null);
                  setActionMessage(null);
                  setFolderModalOpen(true);
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                maxHeight: "12rem",
                overflowY: "auto",
              }}
            >
              {watchPaths.length === 0 ? (
                <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
                  No watch paths configured. Add at least one directory to start crawling.
                </div>
              ) : (
                watchPaths.map((wp) => (
                  <div
                    key={wp.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: "1px solid var(--surface-border)",
                      backgroundColor: "var(--surface-50)",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--text-color)",
                        fontSize: "0.9rem",
                      }}
                      title={wp.path}
                    >
                      {wp.path}
                    </div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: wp.enabled ? "var(--green-500)" : "var(--orange-500)",
                        fontWeight: 600,
                        marginLeft: "0.5rem",
                      }}
                    >
                      {wp.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Card>

      {/* Messages */}
      {actionMessage && (
        <Message severity="success" text={actionMessage} />
      )}
      {actionError && (
        <Message severity="error" text={actionError} />
      )}

      {/* Folder picker modal */}
      <FolderSelectModal
        isOpen={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        onConfirm={async (path) => {
          setFolderModalOpen(false);
          setBusyAction("addPath");
          setActionError(null);
          setActionMessage(null);
          try {
            const added = await addWatchPath(path);
            setWatchPaths((prev) => [...prev, added]);
            setActionMessage(`Watch path added: ${path}`);
          } catch (e) {
            console.error(e);
            setActionError(
              "Failed to add watch path from selection. Ensure it exists and is a directory."
            );
          } finally {
            setBusyAction(null);
          }
        }}
      />
    </div>
  );
}
