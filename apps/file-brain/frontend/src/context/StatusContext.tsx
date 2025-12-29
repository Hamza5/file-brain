import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type CrawlStats,
  type CrawlStatus,
  type SystemInitialization,
  type WatchPath,
  type InitializationStatus,
  connectStatusStream,
  connectInitializationStream,
  getCrawlerStats,
  getCrawlerStatus,
  getSystemInitialization,
  listWatchPaths,
} from "../api/client";

interface StatusContextValue {
  status: CrawlStatus["status"] | null;
  stats: CrawlStats | null;
  systemInitialization: SystemInitialization | null;
  watchPaths: WatchPath[];
  lastUpdate: number | null;
  isLive: boolean; // true when SSE connected
  isLoading: boolean;
  error: string | null;
  // Convenience getters
  isInitializationComplete: boolean;
  isSystemHealthy: boolean;
  canUseSearch: boolean;
  canUseCrawler: boolean;
}

const StatusContext = createContext<StatusContextValue | undefined>(undefined);

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CrawlStatus["status"] | null>(null);
  const [stats, setStats] = useState<CrawlStats | null>(null);
  const [systemInitialization, setSystemInitialization] = useState<SystemInitialization | null>(null);
  const [watchPaths, setWatchPaths] = useState<WatchPath[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback(
    (nextStatus: CrawlStatus["status"] | null, nextStats: CrawlStats | null, nextWatchPaths?: WatchPath[], nextSystemInit?: SystemInitialization | null) => {
      if (nextStatus) {
        setStatus(nextStatus);
      }
      if (nextStats) {
        setStats(nextStats);
      }
      if (nextWatchPaths !== undefined) {
        setWatchPaths(nextWatchPaths);
      }
      if (nextSystemInit !== undefined) {
        setSystemInitialization(nextSystemInit);
      }
      setLastUpdate(Date.now());
      setError(null);
    },
    []
  );

  // Initial snapshot + SSE subscription with polling fallback
  useEffect(() => {
    let stopStream: (() => void) | null = null;
    let stopInitStream: (() => void) | null = null;
    let pollTimer: number | null = null;

    async function loadInitial() {
      try {
        const [statusRes, statsRes, watchPathsRes, systemInitRes] = await Promise.allSettled([
          getCrawlerStatus(),
          getCrawlerStats(),
          listWatchPaths(false),
          getSystemInitialization(),
        ]);

        const initialStatus =
          statusRes.status === "fulfilled" ? statusRes.value.status : null;
        const initialStats =
          statsRes.status === "fulfilled" ? statsRes.value : null;
        const initialWatchPaths =
          watchPathsRes.status === "fulfilled" ? watchPathsRes.value : [];
        const initialSystemInit =
          systemInitRes.status === "fulfilled" ? systemInitRes.value : null;

        applySnapshot(initialStatus, initialStats, initialWatchPaths, initialSystemInit);
      } catch (e) {
        console.error("Failed to load initial crawler state", e);
        setError(
          "Failed to load crawler status. Some features may be temporarily unavailable."
        );
      } finally {
        setIsLoading(false);
      }
    }

    function startPolling() {
      if (pollTimer !== null) return;
      const intervalMs = 5000;
      pollTimer = window.setInterval(async () => {
        try {
          const [statusRes, statsRes, watchPathsRes, systemInitRes] = await Promise.allSettled([
            getCrawlerStatus(),
            getCrawlerStats(),
            listWatchPaths(false),
            getSystemInitialization(),
          ]);

          const nextStatus =
            statusRes.status === "fulfilled" ? statusRes.value.status : null;
          const nextStats =
            statsRes.status === "fulfilled" ? statsRes.value : null;
          const nextWatchPaths =
            watchPathsRes.status === "fulfilled" ? watchPathsRes.value : [];
          const nextSystemInit =
            systemInitRes.status === "fulfilled" ? systemInitRes.value : null;

          applySnapshot(nextStatus, nextStats, nextWatchPaths, nextSystemInit);
        } catch (e) {
          console.error("Polling error", e);
          setError(
            "Lost connection to crawler status. Some information may be out of date."
          );
        }
      }, intervalMs);
    }

    function stopPolling() {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function startStream() {
      try {
        // Connect to crawler status stream
        stopStream = connectStatusStream(
          (payload: { status: CrawlStatus["status"]; stats?: CrawlStats | undefined; watch_paths?: WatchPath[]; timestamp: number }) => {
            setIsLive(true);
            applySnapshot(payload.status, payload.stats ?? null, payload.watch_paths, undefined);
          },
          () => {
            setIsLive(false);
            if (!pollTimer) startPolling();
            console.debug("SSE status stream disconnected");
          }
        );
        
        // Connect to system initialization stream
        stopInitStream = connectInitializationStream(
          (initStatus: InitializationStatus) => {
            // Map the streaming init status to our SystemInitialization type
            const systemInit: SystemInitialization = {
              timestamp: initStatus.timestamp,
              overall_status: initStatus.overall_progress === 100 ? "healthy" : "degraded", // Stream doesn't send "critical" yet, assume degraded if not 100% or healthy
              initialization_progress: initStatus.overall_progress,
              services: Object.entries(initStatus.services).reduce((acc, [name, s]) => {
                let status: "healthy" | "unhealthy" | "initializing" | "disabled" | "error" | "retry_scheduled" = 'initializing';
                if (s.state === 'ready') status = 'healthy';
                else if (s.state === 'failed') status = 'error';
                else if (s.state === 'disabled') status = 'disabled';
                else if (s.state === 'initializing') status = 'initializing';
                
                acc[name] = {
                    status,
                    message: s.current_phase?.message || s.error,
                    state: s.state, // Preserve original state for UI
                    user_friendly_name: s.user_friendly_name, // Pass through extras
                    current_phase: s.current_phase,
                    logs: s.logs,
                    error: s.error
                } as any; // We extend the type with extras which is fine
                return acc;
              }, {} as any),
              summary: {
                total_services: Object.keys(initStatus.services).length,
                healthy_services: Object.values(initStatus.services).filter(s => s.state === 'ready').length,
                failed_services: Object.values(initStatus.services).filter(s => s.state === 'failed').length,
              },
              capabilities: {
                configuration_api: initStatus.services['database']?.state === 'ready',
                search_api: initStatus.services['typesense']?.state === 'ready',
                crawl_api: initStatus.services['crawl_manager']?.state === 'ready',
                full_functionality: initStatus.overall_progress === 100
              },
              degraded_mode: Object.values(initStatus.services).some(s => s.state === 'failed'),
              message: `Initialization progress: ${initStatus.overall_progress.toFixed(0)}%`
            };
            
            setSystemInitialization(systemInit);
          },
          () => {
             console.debug("SSE init stream disconnected");
          }
        );
        
      } catch (e) {
        console.warn("Failed to start SSE streams", e);
        setIsLive(false);
        startPolling();
      }
    }

    loadInitial().then(() => {
      startStream();
    });

    return () => {
      if (stopStream) stopStream();
      if (stopInitStream) stopInitStream();
      stopPolling();
    };
  }, [applySnapshot]);

  const value = useMemo<StatusContextValue>(
    () => ({
      status,
      stats,
      systemInitialization,
      watchPaths,
      lastUpdate,
      isLive,
      isLoading,
      error,
      // Computed properties
      isInitializationComplete: systemInitialization?.initialization_progress === 100,
      isSystemHealthy: systemInitialization?.overall_status === "healthy",
      canUseSearch: systemInitialization?.capabilities?.search_api ?? false,
      canUseCrawler: systemInitialization?.capabilities?.crawl_api ?? false,
    }),
    [status, stats, systemInitialization, watchPaths, lastUpdate, isLive, isLoading, error]
  );

  return (
    <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
  );
}

export function useStatus() {
  const ctx = useContext(StatusContext);
  if (!ctx) {
    throw new Error("useStatus must be used within a StatusProvider");
  }
  return ctx;
}