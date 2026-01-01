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

export interface ServicePhase {
  name: string;
  progress: number;
  message: string;
}

export interface ServiceInitStatus {
  name: string;
  user_friendly_name: string;
  state: 'not_started' | 'initializing' | 'ready' | 'failed' | 'disabled';
  current_phase?: ServicePhase;
  error?: string;
  logs: string[];
}

export interface InitializationStatus {
  services: Record<string, ServiceInitStatus>;
  overall_progress: number;
  timestamp: number;
}

// Generic JSON fetch helper
const API_BASE_URL = "";
  // In production behind the same origin, keep this empty and proxy /api to FastAPI.
  // During Vite dev, configure server.proxy in vite.config.ts so that ^/api goes to FastAPI.

async function requestJSON<T>(input: string, init?: RequestInit): Promise<T> {
  const url = input.startsWith("http") ? input : `${API_BASE_URL}${input}`;
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

// Types for stats API (Typesense-backed)
export interface CrawlTotals {
  discovered: number;
  indexed: number;
}

export interface CrawlRatios {
  indexed_vs_discovered: number;
}

export interface CrawlRuntime {
  running: boolean;
}

export interface CrawlStats {
  totals: CrawlTotals;
  ratios: CrawlRatios;
  file_types: Record<string, number>; // e.g. { ".pdf": 42, ".txt": 15 }
  runtime: CrawlRuntime;
  healthy: boolean; // true if Typesense is available
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
  return requestJSON("/api/v1/crawler/start", { method: "POST" });
}

export async function stopCrawler(): Promise<{ message: string; success: boolean; timestamp: number }> {
  return requestJSON("/api/v1/crawler/stop", { method: "POST" });
}

export async function clearIndexes(): Promise<{ success: boolean; message: string; timestamp: number }> {
  return requestJSON("/api/v1/crawler/clear-indexes", { method: "POST" });
}

// Status / settings / stats
export async function getCrawlerStatus(): Promise<CrawlStatus> {
  return requestJSON("/api/v1/crawler/status");
}

export async function getCrawlerSettings(): Promise<Record<string, unknown>> {
  return requestJSON("/api/v1/crawler/settings");
}

export async function updateCrawlerSettings(
  settings: Record<string, unknown>
): Promise<{ message: string; success: boolean; timestamp: number }> {
  return requestJSON("/api/v1/crawler/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getCrawlerStats(): Promise<CrawlStats> {
  return requestJSON("/api/v1/crawler/stats");
}

// Watch paths config (UI management)
export interface WatchPath {
  id: number;
  path: string;
  enabled: boolean;
  include_subdirectories: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BatchWatchPathsRequest {
  paths: string[];
  include_subdirectories?: boolean;
  enabled?: boolean;
}

export interface BatchWatchPathsResponse {
  added: {
    id: number;
    path: string;
    enabled: boolean;
    include_subdirectories: boolean;
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
  return requestJSON(`/api/v1/config/watch-paths${qs}`);
}

export async function addWatchPath(path: string, includeSubdirectories: boolean = true): Promise<WatchPath> {
  // Prefer batch API to leverage existing validation
  const body: BatchWatchPathsRequest = { paths: [path], include_subdirectories: includeSubdirectories };
  const res = await requestJSON<BatchWatchPathsResponse>(
    "/api/v1/config/watch-paths/batch",
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
    include_subdirectories: added.include_subdirectories,
    created_at: added.created_at,
    updated_at: added.updated_at,
  };
}

export async function replaceWatchPaths(paths: string[]): Promise<void> {
  const body: BatchWatchPathsRequest = { paths };
  await requestJSON("/api/v1/config/watch-paths", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function clearWatchPaths(): Promise<void> {
  await requestJSON("/api/v1/config/watch-paths", {
    method: "DELETE",
  });
}

export async function deleteWatchPath(pathId: number): Promise<void> {
  await requestJSON(`/api/v1/config/watch-paths/${pathId}`, {
    method: "DELETE",
  });
}

export async function updateWatchPath(
  pathId: number,
  update: { enabled?: boolean; include_subdirectories?: boolean }
): Promise<WatchPath> {
  return requestJSON(`/api/v1/config/watch-paths/${pathId}`, {
    method: "PUT",
    body: JSON.stringify(update),
  });
}

// Filesystem browsing (for folder picker)
export interface FsRoot {
  name: string;
  path: string;
  type: "directory";
  isDefault?: boolean;
}

export interface FsEntry {
  name: string;
  path: string;
  type: "directory";
  has_children: boolean;
}

export async function getFsRoots(): Promise<FsRoot[]> {
  return requestJSON("/api/v1/fs/roots");
}

export async function listFs(path: string): Promise<FsEntry[]> {
  const qs = `?path=${encodeURIComponent(path)}`;
  return requestJSON(`/api/v1/fs/list${qs}`);
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
  const es = new EventSource("/api/v1/crawler/stream");

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

// System initialization status
export interface SystemInitialization {
  timestamp: number;
  overall_status: "healthy" | "degraded" | "critical";
  initialization_progress: number;
  services: Record<string, {
    status: "healthy" | "unhealthy" | "initializing" | "disabled" | "error" | "retry_scheduled";
    message?: string;
    error?: string;
    timestamp?: number;
    retry_in_seconds?: number;
    [key: string]: unknown;
  }>;
  summary: {
    total_services: number;
    healthy_services: number;
    failed_services: number;
  };
  capabilities: {
    configuration_api: boolean;
    search_api: boolean;
    crawl_api: boolean;
    full_functionality: boolean;
  };
  degraded_mode: boolean;
  message: string;
}

export interface ServiceStatus {
  timestamp: number;
  services: Record<string, {
    state: string;
    last_check: number | null;
    last_success: number | null;
    error_message: string | null;
    retry_count: number;
    max_retries: number;
    next_retry: number | null;
    dependencies: string[];
    details: Record<string, unknown>;
    health_check: {
      status: string;
      message?: string;
      error?: string;
      timestamp?: number;
      [key: string]: unknown;
    };
  }>;
}

export async function getSystemInitialization(): Promise<SystemInitialization> {
  return requestJSON("/api/v1/system/initialization");
}

export async function getServicesStatus(): Promise<ServiceStatus> {
  return requestJSON("/api/v1/system/services");
}

export async function retryService(serviceName: string): Promise<{ message: string; timestamp: number }> {
  return requestJSON(`/api/v1/system/services/${serviceName}/retry`, { method: "POST" });
}

export function connectInitializationStream(
  onUpdate: (status: InitializationStatus) => void,
  onError?: () => void
): () => void {
  const eventSource = new EventSource('/api/v1/system/initialization/stream');
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data && typeof data === 'object') {
        onUpdate(data);
      }
    } catch (e) {
      console.error("Failed to parse init stream event", e);
    }
  };
  
  eventSource.onerror = () => {
    eventSource.close();
    if (onError) onError();
  };
  
  return () => eventSource.close();
}