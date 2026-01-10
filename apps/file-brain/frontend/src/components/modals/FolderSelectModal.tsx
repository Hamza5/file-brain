import { useEffect, useState } from "react";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Message } from "primereact/message";
import { getFsRoots, listFs, type FsRoot, type FsEntry } from "../../api/client";

type FolderSelectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (path: string, includeSubdirectories: boolean, isExcluded: boolean) => void;
  includeSubdirectories: boolean;
  onIncludeSubdirectoriesChange: (checked: boolean) => void;
  isExcludedMode: boolean;
};

export function FolderSelectModal({
  isOpen,
  onClose,
  onConfirm,
  includeSubdirectories,
  onIncludeSubdirectoriesChange,
  isExcludedMode,
}: FolderSelectModalProps) {
  const [roots, setRoots] = useState<FsRoot[]>([]);
  const [activeRoot, setActiveRoot] = useState<FsRoot | null>(null);

  const [currentPath, setCurrentPath] = useState<string>("");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [filter, setFilter] = useState<string>("");

  const [selectedPath, setSelectedPath] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter entries based on the filter text
  const filteredEntries = filter.trim() === ""
    ? entries
    : entries.filter(entry =>
      entry.name.toLowerCase().includes(filter.toLowerCase())
    );

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setActiveRoot(null);
      setCurrentPath("");
      setEntries([]);
      setFilter("");
      setSelectedPath("");
      setLoading(false);
      setInitializing(false);
      setError(null);
    }
  }, [isOpen]);

  // Reset filter when navigation location changes
  useEffect(() => {
    setFilter("");
  }, [currentPath]);

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
            "No filesystem roots available. Please type the path manually in the Settings page."
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
      } catch {
        if (!cancelled) {
          setError(
            "Unable to browse filesystem. Please type the path manually in the Settings page."
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
  }, [isOpen]);

  async function loadEntries(path: string, cancelledFlag?: boolean) {
    setLoading(true);
    setError(null);
    try {
      const children = await listFs(path);
      if (cancelledFlag) return;
      setEntries(children);
    } catch {
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
    if (entry.type && entry.type !== "directory") return;
    const newPath = entry.path;
    setCurrentPath(newPath);
    setSelectedPath(newPath);
    await loadEntries(newPath);
  }

  // Breadcrumb helpers
  function getBreadcrumbSegments(path: string): string[] {
    if (!path) return [];
    if (path.includes("\\") && !path.includes("/")) {
      const parts = path.split("\\").filter((p) => p.length > 0);
      if (parts.length === 0) return [path];
      const [drive, ...rest] = parts;
      const segments = [`${drive}:`];
      let current = `${drive}:`;
      for (const seg of rest) {
        current = `${current}\\${seg}`;
        segments.push(current);
      }
      return segments;
    }

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

  function getBreadcrumbLabel(segmentPath: string, index: number): string {
    if (segmentPath === "/") return "/";
    if (index === 0 && segmentPath.endsWith(":")) return segmentPath;
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

  function handleConfirm() {
    if (!selectedPath) return;
    onConfirm(selectedPath, includeSubdirectories, isExcludedMode);
  }

  const breadcrumbSegments = getBreadcrumbSegments(currentPath);

  return (
    <Dialog
      header={isExcludedMode ? "Exclude Folder from Indexing" : "Select Folder to Watch"}
      visible={isOpen}
      style={{ width: "90vw", maxWidth: "800px", height: "80vh" }}
      onHide={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "500px" }}>
        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
            fontSize: "0.9rem",
            padding: "0.75rem",
            backgroundColor: "var(--surface-50)",
            borderRadius: "6px",
            border: "1px solid var(--surface-border)",
          }}
        >
          {breadcrumbSegments.length === 0 ? (
            <span style={{ color: "var(--text-color-secondary)" }}>No location</span>
          ) : (
            breadcrumbSegments.map((segPath, idx) => {
              const label = getBreadcrumbLabel(segPath, idx);
              const isLast = idx === breadcrumbSegments.length - 1;
              return (
                <span key={segPath} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() =>
                      !isLast && void handleBreadcrumbClick(segPath)
                    }
                    style={{
                      border: "none",
                      padding: "0.25rem 0.5rem",
                      margin: 0,
                      background: "none",
                      cursor: isLast ? "default" : "pointer",
                      fontSize: "0.9rem",
                      fontWeight: isLast ? 600 : 400,
                      color: isLast
                        ? "var(--primary-color)"
                        : "var(--text-color)",
                      borderRadius: "4px",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isLast) {
                        (e.target as HTMLButtonElement).style.backgroundColor = "var(--surface-100)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLButtonElement).style.backgroundColor = "transparent";
                    }}
                  >
                    {label}
                  </button>
                  {!isLast && (
                    <i
                      className="fas fa-chevron-right"
                      aria-hidden="true"
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-color-secondary)",
                      }}
                    />
                  )}
                </span>
              );
            })
          )}
        </div>

        {/* Main content */}
        <div style={{ display: "flex", gap: "1rem", flex: 1, overflow: "hidden" }}>
          {/* Roots (left sidebar) */}
          <div
            style={{
              width: "150px",
              borderRight: "1px solid var(--surface-border)",
              padding: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              overflowY: "auto",
            }}
          >
            {initializing && (
              <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
                Loading roots…
              </div>
            )}
            {!initializing && roots.length === 0 && (
              <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
                No roots available
              </div>
            )}
            {roots.map((root) => {
              const isActive = activeRoot?.path === root.path;
              return (
                <button
                  key={root.path}
                  type="button"
                  onClick={() => void handleSelectRoot(root)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    border: isActive
                      ? "2px solid var(--primary-color)"
                      : "1px solid var(--surface-border)",
                    backgroundColor: isActive
                      ? "var(--primary-color-emphasis)"
                      : "var(--surface-card)",
                    color: isActive
                      ? "var(--primary-color)"
                      : "var(--text-color)",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    fontWeight: isActive ? 600 : 400,
                    transition: "all 0.2s ease",
                  }}
                >
                  <i
                    className={`fas ${root.icon || "fa-hdd"}`}
                    aria-hidden="true"
                    style={{ fontSize: "1rem" }}
                  />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {root.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Main folder list */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              overflow: "hidden",
            }}
          >
            {error && (
              <Message severity="error" text={error} style={{ margin: 0 }} />
            )}

            {/* Filter Input */}
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <i
                className="fas fa-filter"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  fontSize: "0.9rem",
                  color: "var(--text-color-secondary)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter folders in current location..."
                style={{
                  width: "100%",
                  padding: "0.65rem 2.5rem 0.65rem 2.5rem",
                  borderRadius: "6px",
                  border: "1px solid var(--surface-border)",
                  backgroundColor: "var(--surface-card)",
                  color: "var(--text-color)",
                  fontSize: "0.85rem",
                  outline: "none",
                  transition: "all 0.2s ease",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--primary-color)";
                  e.target.style.boxShadow = "0 0 0 2px var(--primary-color-emphasis)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--surface-border)";
                  e.target.style.boxShadow = "none";
                }}
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  style={{
                    position: "absolute",
                    right: "0.5rem",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: "0.25rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "4px",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--surface-100)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                  }}
                >
                  <i
                    className="fas fa-times"
                    aria-hidden="true"
                    style={{
                      fontSize: "0.9rem",
                      color: "var(--text-color-secondary)",
                    }}
                  />
                </button>
              )}
            </div>


            {loading && (
              <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
                Loading folders…
              </div>
            )}

            {!loading && !error && entries.length === 0 && (
              <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
                This folder has no subdirectories.
              </div>
            )}

            {!loading && !error && entries.length > 0 && filteredEntries.length === 0 && (
              <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
                No folders match the filter "{filter}".
              </div>
            )}

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {filteredEntries.map((entry) => {
                const isSelected = selectedPath === entry.path;
                return (
                  <div
                    key={entry.path}
                    onClick={() => setSelectedPath(entry.path)}
                    onDoubleClick={() => void handleEnterDirectory(entry)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "0.95rem",
                      backgroundColor: isSelected
                        ? "var(--primary-color-emphasis)"
                        : "var(--surface-card)",
                      border: isSelected
                        ? "2px solid var(--primary-color)"
                        : "1px solid var(--surface-border)",
                      color: isSelected
                        ? "var(--primary-color)"
                        : "var(--text-color)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <i
                      className="fas fa-folder"
                      aria-hidden="true"
                      style={{
                        fontSize: "1.1rem",
                        color: isSelected
                          ? "var(--primary-color)"
                          : "var(--blue-400)",
                      }}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Selected path display */}
            <div
              style={{
                borderTop: "1px solid var(--surface-border)",
                paddingTop: "0.75rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-color-secondary)",
                  marginBottom: "0.5rem",
                }}
              >
                Selected Folder
              </div>
              <div
                style={{
                  minHeight: "2.5rem",
                  padding: "0.75rem",
                  borderRadius: "6px",
                  border: "1px solid var(--surface-border)",
                  backgroundColor: "var(--surface-50)",
                  color: selectedPath
                    ? "var(--primary-color)"
                    : "var(--text-color-secondary)",
                  wordBreak: "break-all",
                  fontSize: "0.9rem",
                  fontFamily: "monospace",
                }}
              >
                {selectedPath || "None selected"}
              </div>
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            borderTop: "1px solid var(--surface-border)",
            paddingTop: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Checkbox
              inputId="modalIncludeSubdirectories"
              checked={includeSubdirectories}
              onChange={(e) => onIncludeSubdirectoriesChange(e.checked ?? true)}
            />
            <label htmlFor="modalIncludeSubdirectories" style={{ cursor: "pointer", fontSize: "0.85rem" }}>
              Include Subdirectories
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Button
              label="Cancel"
              severity="danger"
              onClick={onClose}
              outlined
              icon="fa-solid fa-xmark"
            />
            <Button
              label={isExcludedMode ? "Exclude Folder" : "Add Folder"}
              icon={isExcludedMode ? "fa-solid fa-ban" : "fa-solid fa-check"}
              onClick={handleConfirm}
              disabled={!selectedPath}
              className={isExcludedMode ? "p-button-danger" : ""}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
