import { useEffect, useState } from "react";
import {
  FiPlay,
  FiStopCircle,
  FiTrash2,
  FiPlus,
  FiRefreshCw,
} from "react-icons/fi";
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
  const [busyAction, setBusyAction] = useState<"start" | "stop" | "clear" | "addPath" | "replace" | "clearPaths" | null>(null);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const running = status?.running ?? false;

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        // /api/crawler/settings returns a flat dict with keys like 'start_monitoring'
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
    } catch (e) {
      console.error(e);
      setActionError("Failed to save settings.");
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
    } catch (e) {
      console.error(e);
      setActionError("Failed to start crawl. Check watch paths and logs.");
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
    } catch (e) {
      console.error(e);
      setActionError("Failed to stop crawl.");
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
    } catch (e) {
      console.error(e);
      setActionError(
        "Failed to clear indexes. Ensure crawler is not running and try again."
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Settings</h1>
          <p className="text-xs text-slate-400">
            Control crawler behavior and manage crawl lifecycle actions.
          </p>
        </div>
      </div>

      {/* Crawler actions */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-3">
        <div className="text-xs text-slate-300 mb-1">Crawler controls</div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleStart}
            disabled={running || busyAction !== null}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${
              running || busyAction
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            <FiPlay className="w-3 h-3" />
            Start crawl
          </button>
          <button
            onClick={handleStop}
            disabled={!running || busyAction !== null}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${
              !running || busyAction
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
          >
            <FiStopCircle className="w-3 h-3" />
            Stop crawl
          </button>
          <button
            onClick={handleClear}
            disabled={running || busyAction !== null}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${
              running || busyAction
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-rose-600 hover:bg-rose-500 text-white"
            }`}
          >
            <FiTrash2 className="w-3 h-3" />
            Clear indexes
          </button>
        </div>
        {busyAction && (
          <div className="text-[10px] text-slate-400">
            {busyAction === "start" && "Starting crawl…"}
            {busyAction === "stop" && "Stopping crawl…"}
            {busyAction === "clear" && "Clearing indexes…"}
          </div>
        )}
      </div>

      {/* Crawler settings */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-3">
        <div className="text-xs text-slate-300 mb-1">Crawler options</div>
        {loadingSettings && (
          <div className="text-[10px] text-slate-400">Loading settings…</div>
        )}
        {settings && (
          <div className="space-y-2 text-xs text-slate-200">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="w-3 h-3 accent-sky-500"
                checked={settings.start_monitoring}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev
                      ? { ...prev, start_monitoring: e.target.checked }
                      : prev
                  )
                }
              />
              <span>
                Start monitoring for file changes automatically after crawl
                starts
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="w-3 h-3 accent-sky-500"
                checked={settings.include_subdirectories}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev
                      ? {
                          ...prev,
                          include_subdirectories: e.target.checked,
                        }
                      : prev
                  )
                }
              />
              <span>
                Include subdirectories when discovering files in watch paths
              </span>
            </label>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`mt-2 inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium ${
                saving
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-sky-600 hover:bg-sky-500 text-white"
              }`}
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        )}
      </div>

      {/* Watch paths management */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-300">Watch paths</div>
          <div className="flex items-center gap-2 text-[9px] text-slate-500">
            <button
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
                } catch (e) {
                  console.error(e);
                  setActionError("Failed to replace watch paths.");
                } finally {
                  setBusyAction(null);
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
            >
              <FiRefreshCw className="w-3 h-3" />
              Sync
            </button>
            <button
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
                } catch (e) {
                  console.error(e);
                  setActionError("Failed to clear watch paths.");
                } finally {
                  setBusyAction(null);
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 disabled:opacity-40"
            >
              <FiTrash2 className="w-3 h-3" />
              Clear all
            </button>
          </div>
        </div>

        {watchPathsLoading ? (
          <div className="text-[10px] text-slate-400">
            Loading watch paths…
          </div>
        ) : (
          <>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/absolute/path/to/index"
                className="flex-1 bg-slate-950 text-slate-50 text-xs px-2 py-1 rounded border border-slate-700 focus:border-sky-500 outline-none"
              />
              <button
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
                  } catch (e) {
                    console.error(e);
                    setActionError(
                      "Failed to add watch path. Ensure it exists and is a directory."
                    );
                  } finally {
                    setBusyAction(null);
                  }
                }}
                disabled={busyAction === "addPath"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium ${
                  busyAction === "addPath"
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-sky-600 hover:bg-sky-500 text-white"
                }`}
              >
                <FiPlus className="w-3 h-3" />
                Add
              </button>
            </div>

            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto text-[10px]">
              {watchPaths.length === 0 && (
                <div className="text-slate-500">
                  No watch paths configured. Add at least one directory to start
                  crawling.
                </div>
              )}
              {watchPaths.map((wp) => (
                <div
                  key={wp.id}
                  className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-slate-950/60 border border-slate-800"
                >
                  <div className="flex-1 truncate text-slate-200">
                    {wp.path}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {wp.enabled ? "enabled" : "disabled"}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      {actionMessage && (
        <div className="text-[10px] text-emerald-400">{actionMessage}</div>
      )}
      {actionError && (
        <div className="text-[10px] text-rose-400">{actionError}</div>
      )}
    </div>
  );
}