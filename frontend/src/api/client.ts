// Local TS-only definition mirroring backend CrawlStatus shape
export interface CrawlStatus {
  status: {
    running: boolean;
    job_type: string | null;
    start_time: number | null;
    elapsed_time: number | null;
    discovery_progress: number;
    indexing_progress: number;
    files_discovered: number;
    files_indexed: number;
    files_skipped: number;
    queue_size: number;
    monitoring_active: boolean;
    estimated_completion: number | null;
  };
  timestamp: number;
}

// Generic JSON fetch helper
const API_BASE =
  // In production behind the same origin, keep this empty and proxy /api to FastAPI.
  // During Vite dev, configure server.proxy in vite.config.ts so that ^/api goes to FastAPI.
  "";

async function requestJSON<T>(input: string, init?: RequestInit): Promise<T> {
  const url = input.startsWith("http") ? input : `${API_BASE}${input}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  if (res.status === 204) {
    // No Content
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

// Types for stats API
export interface CrawlTotals {
  discovered: number;
  indexed: number;
  skipped: number;
  failed: number;
  indexed_bytes: number;
}

export interface CrawlRatios {
  indexed_vs_discovered: number;
  success_rate: number;
}

export interface TimeBucket {
  bucket: string;
  count: number;
}

export interface CrawlRuntime {
  last_crawl_started_at: number | null;
  last_crawl_completed_at: number | null;
  running: boolean;
}

export interface CrawlStats {
  totals: CrawlTotals;
  ratios: CrawlRatios;
  timeseries: {
    indexed_per_hour: TimeBucket[];
    indexed_per_day: TimeBucket[];
  };
  runtime: CrawlRuntime;
}

export interface CrawlerRunSummary {
  id: string;
  started_at: number;
  completed_at: number | null;
  total_indexed: number;
  total_failed: number;
  duration_sec: number | null;
}

export interface CrawlerRunsResponse {
  runs: CrawlerRunSummary[];
}

// Crawler control
export async function startCrawler(): Promise<{ message: string; success: boolean; timestamp: number }> {
  return requestJSON("/api/crawler/start", { method: "POST" });
}

export async function stopCrawler(): Promise<{ message: string; success: boolean; timestamp: number }> {
  return requestJSON("/api/crawler/stop", { method: "POST" });
}

export async function clearIndexes(): Promise<{ success: boolean; message: string; timestamp: number }> {
  return requestJSON("/api/crawler/clear-indexes", { method: "POST" });
}

// Status / settings / stats
export async function getCrawlerStatus(): Promise<CrawlStatus> {
  return requestJSON("/api/crawler/status");
}

export async function getCrawlerSettings(): Promise<Record<string, unknown>> {
  return requestJSON("/api/crawler/settings");
}

export async function updateCrawlerSettings(
  settings: Record<string, unknown>
): Promise<{ message: string; success: boolean; timestamp: number }> {
  return requestJSON("/api/crawler/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getCrawlerStats(): Promise<CrawlStats> {
  return requestJSON("/api/crawler/stats");
}

// Watch paths config (UI management)
export interface WatchPath {
  id: number;
  path: string;
  enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BatchWatchPathsRequest {
  paths: string[];
}

export interface BatchWatchPathsResponse {
  added: {
    id: number;
    path: string;
    enabled: boolean;
    created_at?: string | null;
    updated_at?: string | null;
  }[];
  skipped: {
    path: string;
    reason: string;
  }[];
  total_added: number;
  total_skipped: number;
}

export async function listWatchPaths(enabledOnly = false): Promise<WatchPath[]> {
  const qs = enabledOnly ? "?enabled_only=true" : "";
  return requestJSON(`/api/config/watch-paths${qs}`);
}

export async function addWatchPath(path: string): Promise<WatchPath> {
  // Prefer batch API to leverage existing validation
  const body: BatchWatchPathsRequest = { paths: [path] };
  const res = await requestJSON<BatchWatchPathsResponse>(
    "/api/config/watch-paths/batch",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  const added = res.added[0];
  if (!added) {
    throw new Error(
      res.skipped[0]?.reason || "Failed to add watch path (see backend logs)."
    );
  }
  return {
    id: added.id,
    path: added.path,
    enabled: added.enabled,
    created_at: added.created_at,
    updated_at: added.updated_at,
  };
}

export async function replaceWatchPaths(paths: string[]): Promise<void> {
  const body: BatchWatchPathsRequest = { paths };
  await requestJSON("/api/config/watch-paths", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function clearWatchPaths(): Promise<void> {
  await requestJSON("/api/config/watch-paths", {
    method: "DELETE",
  });
}

// SSE stream connection
export interface StreamPayload {
  status: CrawlStatus["status"];
  stats?: CrawlStats;
  timestamp: number;
}

export type StreamUpdateHandler = (payload: StreamPayload) => void;
export type StreamErrorHandler = (error: Event) => void;

export function connectStatusStream(
  onUpdate: StreamUpdateHandler,
  onError?: StreamErrorHandler
): () => void {
  const es = new EventSource("/api/crawler/stream");

  es.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as StreamPayload;
      onUpdate(data);
    } catch (e) {
      console.error("Failed to parse stream event", e);
    }
  };

  es.onerror = (event: Event) => {
    console.warn("Crawler stream error", event);
    if (onError) {
      onError(event);
    }
    // Let the caller decide whether to close / fallback to polling.
  };

  return () => {
    es.close();
  };
}