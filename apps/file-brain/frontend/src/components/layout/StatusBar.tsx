import { useStatus } from "../../context/StatusContext";
import { Tag } from "primereact/tag";
import { ProgressBar } from "primereact/progressbar";
import { type ServiceInitStatus } from "../../api/client";

export function StatusBar() {
  const {
    systemInitialization,
    isInitializationComplete,
    isIndexing,
    indexingProgress,
    stats,
    typesenseNotReady,
  } = useStatus();

  // User-friendly service name mapping
  const getFriendlyName = (name: string | undefined) => {
    if (!name) return "Service";
    const mapping: Record<string, string> = {
      typesense: "Search Engine",
      tika: "File Extractor",
      docker: "Services",
      database: "Database",
      crawl_manager: "File Monitor",
    };
    return (
      mapping[name.toLowerCase()] ||
      name.charAt(0).toUpperCase() + name.slice(1)
    );
  };

  // Determine the main status message and icon
  const getMainStatus = () => {
    // Priority 1: System initialization in progress
    if (!isInitializationComplete && systemInitialization) {
      return {
        icon: "fa-spinner fa-spin",
        message: `Starting up... ${systemInitialization.initialization_progress.toFixed(
          0
        )}%`,
        severity: "info" as const,
      };
    }

    // Priority 2: Indexing in progress
    if (isIndexing && stats) {
      const indexed = stats.totals?.indexed ?? 0;
      const discovered = stats.totals?.discovered ?? 0;
      const percentage = indexingProgress.toFixed(1);
      return {
        icon: "fa-sync fa-spin",
        message: `Indexing: ${indexed.toLocaleString()}/${discovered.toLocaleString()} files (${percentage}%)`,
        severity: "info" as const,
        showProgress: true,
        progressValue: indexingProgress,
      };
    }

    // Priority 3: Typesense not ready (but system initialized)
    if (typesenseNotReady && isInitializationComplete) {
      return {
        icon: "fa-circle-notch fa-spin",
        message: "Search Engine starting...",
        severity: "warning" as const,
      };
    }

    // Priority 4: All good - show ready status
    const indexed = stats?.totals?.indexed ?? 0;
    return {
      icon: "fa-check-circle",
      message:
        indexed > 0
          ? `Ready • ${indexed.toLocaleString()} files indexed`
          : "Ready",
      severity: "success" as const,
    };
  };

  const mainStatus = getMainStatus();

  // Find services that are not ready (for service tags)
  const pendingServices = systemInitialization
    ? Object.values(systemInitialization.services ?? {}).filter((service) => {
        const s = service as unknown as ServiceInitStatus;
        return s.state && s.state !== "ready" && s.state !== "disabled";
      })
    : [];

  // Show service tags only during initialization or if there are pending services
  const showServiceTags =
    !isInitializationComplete || pendingServices.length > 0;

  return (
    <div
      className="fixed bottom-0 left-0 w-full z-5 surface-overlay surface-border px-4 py-3 shadow-2"
      style={{ backdropFilter: "blur(8px)" }}
    >
      <div className="flex align-items-center justify-content-between gap-3">
        {/* Left: Status message with icon */}
        <div className="flex align-items-center gap-2 flex-shrink-0">
          <i className={`fas ${mainStatus.icon} text-${mainStatus.severity}`} />
          <span className="font-medium text-color-secondary text-sm">
            {mainStatus.message}
          </span>
        </div>

        {/* Center: Service tags (only when relevant) */}
        {showServiceTags && (
          <div className="flex align-items-center gap-2 flex-wrap">
            {pendingServices.map((service) => {
              const s = service as unknown as ServiceInitStatus;
              const state = s.state || "unknown";
              const isFailed = state === "failed";
              const isBusy = state === "busy";

              // Special handling for Typesense - show as warning during initialization, not error
              const isTypesenseStarting =
                s.name === "typesense" && state === "initializing";

              // Determine severity and label based on state
              let severity: "warning" | "danger" | "info" = "warning";
              let label = `${getFriendlyName(s.name)}: Loading`;

              if (isBusy) {
                severity = "info";
                label = `${getFriendlyName(s.name)}: Processing`;
              } else if (isFailed && !isTypesenseStarting) {
                severity = "danger";
                label = `${getFriendlyName(s.name)}: Error`;
              } else if (isTypesenseStarting) {
                label = `${getFriendlyName(s.name)}: Starting`;
              }

              return (
                <Tag
                  key={s.name}
                  severity={severity}
                  value={label}
                  icon={
                    isFailed && !isTypesenseStarting
                      ? "fas fa-exclamation-circle"
                      : "fas fa-spinner fa-spin"
                  }
                  className="text-xs"
                />
              );
            })}
          </div>
        )}

        {/* Right: Progress bar (when applicable) */}
        {mainStatus.showProgress && (
          <div className="w-12rem hidden md:block flex-shrink-0">
            <ProgressBar
              value={mainStatus.progressValue}
              showValue={false}
              style={{ height: "8px" }}
            />
          </div>
        )}

        {/* Show initialization progress bar when not indexing */}
        {!isInitializationComplete &&
          !mainStatus.showProgress &&
          systemInitialization && (
            <div className="w-8rem hidden md:block flex-shrink-0">
              <ProgressBar
                value={systemInitialization.initialization_progress}
                showValue={false}
                style={{ height: "6px" }}
              />
            </div>
          )}
      </div>
    </div>
  );
}
