import { useEffect, useState } from "react";
import {
  FiFolder,
  FiFolderPlus,
  FiChevronRight,
  FiX,
  FiHardDrive,
} from "react-icons/fi";
import { getFsRoots, listFs, type FsRoot, type FsEntry } from "../api/client";

type FolderSelectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (path: string) => void;
};

/**
 * Native-like folder picker:
 * - Left: roots (Home, /, drives on Windows).
 * - Top: breadcrumb-style address bar for current path.
 * - Main: current folder subdirectories (no files).
 * - Single-selection, click-through navigation.
 */
export function FolderSelectModal({
  isOpen,
  onClose,
  onConfirm,
}: FolderSelectModalProps) {
  const [roots, setRoots] = useState<FsRoot[]>([]);
  const [activeRoot, setActiveRoot] = useState<FsRoot | null>(null);

  const [currentPath, setCurrentPath] = useState<string>("");
  const [entries, setEntries] = useState<FsEntry[]>([]);

  const [selectedPath, setSelectedPath] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setActiveRoot(null);
      setCurrentPath("");
      setEntries([]);
      setSelectedPath("");
      setLoading(false);
      setInitializing(false);
      setError(null);
    }
  }, [isOpen]);

  // Initialize roots and default view when opened
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function init() {
      setInitializing(true);
      setError(null);
      try {
        const rootsResp = await getFsRoots();
        if (cancelled) return;

        if (!rootsResp || rootsResp.length === 0) {
          setRoots([]);
          setError(
            "No filesystem roots available. Please type the path manually."
          );
          return;
        }

        setRoots(rootsResp);

        const defaultRoot =
          rootsResp.find((r) => r.isDefault) ?? rootsResp[0];

        setActiveRoot(defaultRoot);
        setCurrentPath(defaultRoot.path);
        setSelectedPath(defaultRoot.path);

        await loadEntries(defaultRoot.path, cancelled);
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load filesystem roots", e);
          setError(
            "Unable to browse filesystem. Please type the path manually."
          );
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function loadEntries(path: string, cancelledFlag?: boolean) {
    setLoading(true);
    setError(null);
    try {
      const children = await listFs(path);
      if (cancelledFlag) return;
      setEntries(children);
    } catch (e) {
      console.error("Failed to list directory", e);
      if (!cancelledFlag) {
        setEntries([]);
        setError(
          "Unable to list this folder. Check permissions or choose another location."
        );
      }
    } finally {
      if (!cancelledFlag) {
        setLoading(false);
      }
    }
  }

  // Switch active root (left column)
  async function handleSelectRoot(root: FsRoot) {
    setActiveRoot(root);
    setCurrentPath(root.path);
    setSelectedPath(root.path);
    await loadEntries(root.path);
  }

  // Navigate into a subdirectory (main pane)
  async function handleEnterDirectory(entry: FsEntry) {
    const newPath = entry.path;
    setCurrentPath(newPath);
    setSelectedPath(newPath);
    await loadEntries(newPath);
  }

  // Breadcrumb helpers
  function getBreadcrumbSegments(path: string): string[] {
    if (!path) return [];
    if (path.includes("\\") && !path.includes("/")) {
      // Windows-style path, e.g. C:\Users\You
      const norm = path.replace(/\\/g, "\\");
      const parts = norm.split("\\").filter((p) => p.length > 0);
      if (parts.length === 0) return [path];
      // First segment is drive like "C:"
      const [drive, ...rest] = parts;
      const segments = [`${drive}:`];
      let current = `${drive}:`;
      for (const seg of rest) {
        current = `${current}\\${seg}`;
        segments.push(current);
      }
      return segments;
    }

    // POSIX-style path
    if (path === "/") return ["/"];
    const parts = path.split("/").filter((p) => p.length > 0);
    const segments: string[] = ["/"];
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : `/${part}`;
      segments.push(current);
    }
    return segments;
  }

  function getBreadcrumbLabel(
    segmentPath: string,
    index: number
  ): string {
    if (segmentPath === "/") return "/";
    if (index === 0 && segmentPath.endsWith(":")) return segmentPath; // drive root
    // For others, show only the last part
    const normalized = segmentPath.replace(/\\/g, "/");
    const parts = normalized.split("/").filter((p) => p.length > 0);
    return parts[parts.length - 1] || segmentPath;
  }

  async function handleBreadcrumbClick(targetPath: string) {
    if (!targetPath) return;
    setCurrentPath(targetPath);
    setSelectedPath(targetPath);
    await loadEntries(targetPath);
  }

  if (!isOpen) {
    return null;
  }

  const breadcrumbSegments = getBreadcrumbSegments(currentPath);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
      <div className="bg-slate-950 border border-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-200">
            <FiFolderPlus className="w-3 h-3 text-sky-400" />
            <span>Select folder to watch</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200"
          >
            <FiX className="w-3 h-3" />
          </button>
        </div>

        {/* Address bar */}
        <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-1 text-[9px] text-slate-300 flex-wrap">
            {breadcrumbSegments.length === 0 ? (
              <span className="text-slate-500">No location</span>
            ) : (
              breadcrumbSegments.map((segPath, idx) => {
            const label = getBreadcrumbLabel(segPath, idx);
                const isLast = idx === breadcrumbSegments.length - 1;
                return (
                  <span key={segPath} className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isLast}
                      onClick={() =>
                        !isLast && void handleBreadcrumbClick(segPath)
                      }
                      className={
                        isLast
                          ? "font-semibold text-sky-300 cursor-default"
                          : "hover:text-sky-400"
                      }
                    >
                      {label}
                    </button>
                    {!isLast && (
                      <FiChevronRight className="w-2 h-2 text-slate-500" />
                    )}
                  </span>
                );
              })
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Roots (left) */}
          <div className="w-36 border-r border-slate-800 p-2 space-y-1 overflow-y-auto">
            {initializing && (
              <div className="text-[9px] text-slate-400">Loading roots…</div>
            )}
            {!initializing && roots.length === 0 && (
              <div className="text-[9px] text-slate-500">
                No roots. Use manual input.
              </div>
            )}
            {roots.map((root) => {
              const isActive = activeRoot?.path === root.path;
              return (
                <button
                  key={root.path}
                  type="button"
                  onClick={() => void handleSelectRoot(root)}
                  className={`w-full flex items-center gap-1 px-2 py-1 rounded text-[9px] text-left ${
                    isActive
                      ? "bg-sky-600/30 text-sky-200"
                      : "bg-transparent text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  <FiHardDrive className="w-3 h-3 text-sky-400" />
                  <span className="truncate">
                    {root.name === root.path ? root.name : root.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Main folder list */}
          <div className="flex-1 p-2 flex flex-col">
            {loading && (
              <div className="text-[9px] text-slate-400 mb-1">
                Loading folders…
              </div>
            )}
            {error && (
              <div className="text-[9px] text-rose-400 mb-1">{error}</div>
            )}
            {!loading && !error && entries.length === 0 && (
              <div className="text-[9px] text-slate-500">
                This folder has no subdirectories.
              </div>
            )}
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {entries.map((entry) => {
                const isSelected = selectedPath === entry.path;
                return (
                  <div
                    key={entry.path}
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-[10px] ${
                      isSelected
                        ? "bg-sky-600/40 text-sky-100"
                        : "bg-slate-950/40 text-slate-200 hover:bg-slate-900"
                    }`}
                    onClick={() => setSelectedPath(entry.path)}
                    onDoubleClick={() => void handleEnterDirectory(entry)}
                  >
                    <FiFolder className="w-3 h-3 text-sky-400" />
                    <span className="truncate">{entry.name}</span>
                  </div>
                );
              })}
            </div>

            {/* Selected + actions */}
            <div className="mt-2 flex flex-col gap-1 border-t border-slate-800 pt-2">
              <div className="text-[9px] text-slate-400">Selected folder</div>
              <div className="text-[9px] text-sky-300 break-all bg-slate-950/80 border border-slate-800 rounded px-2 py-1 min-h-[32px]">
                {selectedPath || "None selected"}
              </div>
              <div className="flex justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[9px] text-slate-300 hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedPath}
                  onClick={() => {
                    if (!selectedPath) return;
                    onConfirm(selectedPath);
                  }}
                  className={`inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[9px] font-medium ${
                    !selectedPath
                      ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                      : "bg-sky-600 hover:bg-sky-500 text-white"
                  }`}
                >
                  <FiFolderPlus className="w-3 h-3" />
                  Use this folder
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}