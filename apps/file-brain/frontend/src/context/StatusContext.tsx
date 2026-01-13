import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import equal from "fast-deep-equal";
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
  // Status bar helpers
  isIndexing: boolean;
  indexingProgress: number; // 0-100 percentage
  typesenseNotReady: boolean;
}

const StatusContext = createContext<StatusContextValue | undefined>(undefined);

export function StatusProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [status, setStatus] = useState<CrawlStatus["status"] | null>(null);
  const [stats, setStats] = useState<CrawlStats | null>(null);
  const [systemInitialization, setSystemInitialization] = useState<SystemInitialization | null>(null);
  const [watchPaths, setWatchPaths] = useState<WatchPath[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);
  const isLiveRef = useRef(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for current state to use in applySnapshot without dependency cycles
  const statusRef = useRef(status);
  const statsRef = useRef(stats);
  const watchPathsRef = useRef(watchPaths);
  const systemInitRef = useRef(systemInitialization);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { watchPathsRef.current = watchPaths; }, [watchPaths]);
  useEffect(() => { systemInitRef.current = systemInitialization; }, [systemInitialization]);

  const updateLiveStatus = useCallback((live: boolean) => {
    // Only update if changed to avoid renders
    if (isLiveRef.current !== live) {
        setIsLive(live);
        isLiveRef.current = live;
    }
  }, []);

  const applySnapshot = useCallback(
    (nextStatus: CrawlStatus["status"] | null, nextStats: CrawlStats | null, nextWatchPaths?: WatchPath[], nextSystemInit?: SystemInitialization | null) => {
      let changed = false;

      if (nextStatus && !equal(nextStatus, statusRef.current)) {
        setStatus(nextStatus);
        changed = true;
      }
      if (nextStats && !equal(nextStats, statsRef.current)) {
        setStats(nextStats);
        changed = true;
      }
      
      // For watch paths, array order might matter or not, but usually we just want content equality
      if (nextWatchPaths !== undefined && !equal(nextWatchPaths, watchPathsRef.current)) {
        setWatchPaths(nextWatchPaths);
        changed = true;
      }
      
      if (nextSystemInit !== undefined && !equal(nextSystemInit, systemInitRef.current)) {
        setSystemInitialization(nextSystemInit);
        changed = true;
      }

      if (changed) {
          setLastUpdate(Date.now());
      }
      // Always clear error on successful snapshot
      if (error) setError(null);
    },
    [error]
  );

  // Initial snapshot + SSE subscription with polling fallback
  useEffect(() => {
    // Skip everything if not enabled (wizard not completed)
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let stopStream: (() => void) | null = null;
    let stopInitStream: (() => void) | null = null;
    let pollTimer: number | null = null;
    let retryTimer: NodeJS.Timeout | null = null;
    let isUnmounted = false;

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

        if (!isUnmounted) {
            applySnapshot(initialStatus, initialStats, initialWatchPaths, initialSystemInit);
        }
      } catch {
        if (!isUnmounted) {
            setError(
            "Failed to load crawler status. Some features may be temporarily unavailable."
            );
        }
      } finally {
        if (!isUnmounted) setIsLoading(false);
      }
    }

    function startPolling() {
      if (pollTimer !== null) return;
      
      // Only poll if SSE is not active
      const intervalMs = 5000;
      pollTimer = window.setInterval(async () => {
        if (isLiveRef.current) return; // Skip polling if we have a live connection
        
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

           if (!isUnmounted) {
               applySnapshot(nextStatus, nextStats, nextWatchPaths, nextSystemInit);
           }
        } catch {
          if (!isUnmounted) {
              setError(
                "Lost connection to crawler status. Some information may be out of date."
              );
          }
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
      if (isUnmounted) return;

      // Clean up previous streams if any (e.g. from a retry)
      if (stopStream) stopStream();
      if (stopInitStream) stopInitStream();

      try {
        // Connect to crawler status stream
        stopStream = connectStatusStream(
          (payload: { status: CrawlStatus["status"]; stats?: CrawlStats | undefined; watch_paths?: WatchPath[]; timestamp: number }) => {
            updateLiveStatus(true);
            stopPolling(); // Connection successful, strictly stop polling
            
            // Clear any pending retry since we are successful
            if (retryTimer) {
                clearTimeout(retryTimer);
                retryTimer = null;
            }

            applySnapshot(payload.status, payload.stats ?? null, payload.watch_paths, undefined);
          },
          () => {
            // On error
            updateLiveStatus(false);
            // Fallback to polling immediately
            startPolling();
            // Schedule reconnection attempt
            if (!retryTimer) {
                retryTimer = setTimeout(() => {
                    retryTimer = null;
                    startStream();
                }, 10000); // Retry after 10s
            }
          }
        );
        
        // Connect to system initialization stream
        stopInitStream = connectInitializationStream(
          (initStatus: InitializationStatus) => {
            // Map the streaming init status to our SystemInitialization type
            const systemInit: SystemInitialization = {
              timestamp: initStatus.timestamp,
              overall_status: initStatus.overall_progress === 100 ? "healthy" : "degraded",
              initialization_progress: initStatus.overall_progress,
              services: Object.entries(initStatus.services).reduce((acc, [name, s]) => {
                let status: "healthy" | "unhealthy" | "initializing" | "disabled" | "error" | "retry_scheduled" = 'initializing';
                if (s.state === 'ready') status = 'healthy';
                else if (s.state === 'failed') status = 'error';
                else if (s.state === 'disabled') status = 'disabled';
                else if (s.state === 'busy') status = 'initializing'; // Treat busy as initializing for UI
                else if (s.state === 'initializing') status = 'initializing';
                
                acc[name] = {
                    status,
                    message: s.current_phase?.message || s.error,
                    state: s.state, // Preserve original state for UI
                    user_friendly_name: s.user_friendly_name, // Pass through extras
                    current_phase: s.current_phase,
                    logs: s.logs,
                    error: s.error
                } as unknown as SystemInitialization["services"][string];
                return acc;
              }, {} as SystemInitialization["services"]),
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
            
            applySnapshot(null, null, undefined, systemInit);
          },
          () => {
             // Note: We don't trigger polling/retry just for init stream as main status stream is primary
          }
        );
        
      } catch {
        setIsLive(false);
        startPolling();
        // Schedule retry
        if (!retryTimer) {
             retryTimer = setTimeout(() => {
                retryTimer = null;
                startStream();
             }, 10000);
        }
      }
    }

    loadInitial().then(() => {
      startStream();
    });

    return () => {
      isUnmounted = true;
      if (stopStream) stopStream();
      if (stopInitStream) stopInitStream();
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [applySnapshot, enabled, updateLiveStatus]);

  const value = useMemo<StatusContextValue>(
    () => {
      const isIndexing = status?.running ?? false;
      const discovered = stats?.totals?.discovered ?? 0;
      const indexed = stats?.totals?.indexed ?? 0;
      const indexingProgress = discovered > 0 ? Math.min(100, (indexed / discovered) * 100) : 0;
      
      // Check if Typesense is not ready (initializing or failed)
      const typesenseService = systemInitialization?.services?.['typesense'];
      const typesenseNotReady = typesenseService ? 
        (typesenseService.state !== 'ready' && typesenseService.state !== 'disabled') : false;
      
      return {
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
        // Status bar helpers
        isIndexing,
        indexingProgress,
        typesenseNotReady,
      };
    },
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