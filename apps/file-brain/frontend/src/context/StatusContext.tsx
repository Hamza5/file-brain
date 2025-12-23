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
  connectStatusStream,
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
        stopStream = connectStatusStream(
          (payload: { status: CrawlStatus["status"]; stats?: CrawlStats | undefined; watch_paths?: WatchPath[]; timestamp: number }) => {
            setIsLive(true);
            applySnapshot(payload.status, payload.stats ?? null, payload.watch_paths, undefined);
          },
          () => {
            // SSE error; mark as not live and use polling
            setIsLive(false);
            if (!pollTimer) {
              startPolling();
            }
            // Only log the error once per connection attempt to reduce spam
            console.debug("SSE stream disconnected, falling back to polling");
          }
        );
      } catch (e) {
        console.warn("Failed to start SSE stream, falling back to polling", e);
        setIsLive(false);
        startPolling();
      }
    }

    loadInitial().then(() => {
      startStream();
    });

    return () => {
      if (stopStream) {
        stopStream();
      }
      stopPolling();
    };
  }, [applySnapshot]);

  // Convenience getters
  const isInitializationComplete = useMemo(() => {
    if (!systemInitialization) return false;
    return systemInitialization.initialization_progress === 100;
  }, [systemInitialization]);

  const isSystemHealthy = useMemo(() => {
    if (!systemInitialization) return false;
    return systemInitialization.overall_status === "healthy";
  }, [systemInitialization]);

  const canUseSearch = useMemo(() => {
    if (!systemInitialization) return false;
    return systemInitialization.capabilities.search_api;
  }, [systemInitialization]);

  const canUseCrawler = useMemo(() => {
    if (!systemInitialization) return false;
    return systemInitialization.capabilities.crawl_api;
  }, [systemInitialization]);

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
      isInitializationComplete,
      isSystemHealthy,
      canUseSearch,
      canUseCrawler,
    }),
    [status, stats, systemInitialization, watchPaths, lastUpdate, isLive, isLoading, error, isInitializationComplete, isSystemHealthy, canUseSearch, canUseCrawler]
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