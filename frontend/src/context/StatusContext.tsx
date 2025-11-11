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
  connectStatusStream,
  getCrawlerStats,
  getCrawlerStatus,
} from "../api/client";

interface StatusContextValue {
  status: CrawlStatus["status"] | null;
  stats: CrawlStats | null;
  lastUpdate: number | null;
  isLive: boolean; // true when SSE connected
  isLoading: boolean;
  error: string | null;
}

const StatusContext = createContext<StatusContextValue | undefined>(undefined);

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CrawlStatus["status"] | null>(null);
  const [stats, setStats] = useState<CrawlStats | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback(
    (nextStatus: CrawlStatus["status"] | null, nextStats: CrawlStats | null) => {
      if (nextStatus) {
        setStatus(nextStatus);
      }
      if (nextStats) {
        setStats(nextStats);
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
        const [statusRes, statsRes] = await Promise.allSettled([
          getCrawlerStatus(),
          getCrawlerStats(),
        ]);

        const initialStatus =
          statusRes.status === "fulfilled" ? statusRes.value.status : null;
        const initialStats =
          statsRes.status === "fulfilled" ? statsRes.value : null;

        applySnapshot(initialStatus, initialStats);
      } catch (e) {
        console.error("Failed to load initial crawler state", e);
        setError("Failed to load crawler status");
      } finally {
        setIsLoading(false);
      }
    }

    function startPolling() {
      if (pollTimer !== null) return;
      const intervalMs = 5000;
      pollTimer = window.setInterval(async () => {
        try {
          const [statusRes, statsRes] = await Promise.allSettled([
            getCrawlerStatus(),
            getCrawlerStats(),
          ]);

          const nextStatus =
            statusRes.status === "fulfilled" ? statusRes.value.status : null;
          const nextStats =
            statsRes.status === "fulfilled" ? statsRes.value : null;

          applySnapshot(nextStatus, nextStats);
        } catch (e) {
          console.error("Polling error", e);
          setError("Lost connection to crawler status");
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
          (payload: { status: CrawlStatus["status"]; stats?: CrawlStats | undefined; timestamp: number }) => {
            setIsLive(true);
            applySnapshot(payload.status, payload.stats ?? null);
          },
          () => {
            // SSE error; mark as not live and use polling
            setIsLive(false);
            if (!pollTimer) {
              startPolling();
            }
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

  const value = useMemo<StatusContextValue>(
    () => ({
      status,
      stats,
      lastUpdate,
      isLive,
      isLoading,
      error,
    }),
    [status, stats, lastUpdate, isLive, isLoading, error]
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