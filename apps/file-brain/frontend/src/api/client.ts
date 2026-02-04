// Local TS-only definition mirroring backend CrawlStatus shape
export interface CrawlStatus {
  status: {
    running: boolean;
    job_type: string | null;
    start_time: number | null;
    elapsed_time: number | null;
    current_phase: string;
    discovery_progress: number;
    indexing_progress: number;
    verification_progress: number;
    files_discovered: number;
    files_indexed: number;
    files_skipped: number;
    orphan_count: number;
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
  state: "not_started" | "initializing" | "ready" | "failed" | "disabled" | "busy";
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

/**
 * Generic JSON request helper
 */
export async function requestJSON<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
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
    throw new Error(
      `Request failed (${res.status}): ${text || res.statusText}`
    );
  }

  if (res.status === 204) {
    // No Content
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

export interface AppConfig {
  app_version: string;
  typesense: {
    api_key: string;
    host: string;
    port: number;
    protocol: string;
    collection_name: string;
  };
}

export async function getAppConfig(): Promise<AppConfig> {
  return requestJSON("/api/v1/config");
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
export async function startCrawler(): Promise<{
  message: string;
  success: boolean;
  timestamp: number;
}> {
  return requestJSON("/api/v1/crawler/start", { method: "POST" });
}

export async function stopCrawler(): Promise<{
  message: string;
  success: boolean;
  timestamp: number;
}> {
  return requestJSON("/api/v1/crawler/stop", { method: "POST" });
}

export async function startFileMonitoring(): Promise<{
  message: string;
  success: boolean;
  timestamp: number;
}> {
  return requestJSON("/api/v1/crawler/monitor/start", { method: "POST" });
}

export async function stopFileMonitoring(): Promise<{
  message: string;
  success: boolean;
  timestamp: number;
}> {
  return requestJSON("/api/v1/crawler/monitor/stop", { method: "POST" });
}

export async function clearIndexes(): Promise<{
  success: boolean;
  message: string;
  timestamp: number;
}> {
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
  is_excluded: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BatchWatchPathsRequest {
  paths: string[];
  include_subdirectories?: boolean;
  enabled?: boolean;
  is_excluded?: boolean;
}

export interface BatchWatchPathsResponse {
  added: {
    id: number;
    path: string;
    enabled: boolean;
    include_subdirectories: boolean;
    is_excluded: boolean;
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

export async function listWatchPaths(
  enabledOnly = false
): Promise<WatchPath[]> {
  const qs = enabledOnly ? "?enabled_only=true" : "";
  return requestJSON(`/api/v1/config/watch-paths${qs}`);
}

export async function addWatchPath(
  path: string,
  includeSubdirectories: boolean = true,
  isExcluded: boolean = false
): Promise<WatchPath> {
  const body = {
    path,
    include_subdirectories: includeSubdirectories,
    is_excluded: isExcluded,
    enabled: true,
  };
  return requestJSON<WatchPath>("/api/v1/config/watch-paths", {
    method: "POST",
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
  icon?: string;
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
    } catch {
      // Failed to parse stream event - silent failure
    }
  };

  es.onerror = (event: Event) => {
    // Stream error - let caller handle via onError callback
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
  services: Record<
    string,
    {
      status:
        | "healthy"
        | "unhealthy"
        | "initializing"
        | "disabled"
        | "error"
        | "retry_scheduled";
      message?: string;
      error?: string;
      timestamp?: number;
      retry_in_seconds?: number;
      [key: string]: unknown;
    }
  >;
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
  services: Record<
    string,
    {
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
    }
  >;
}

export async function getSystemInitialization(): Promise<SystemInitialization> {
  return requestJSON("/api/v1/system/initialization");
}

export async function getServicesStatus(): Promise<ServiceStatus> {
  return requestJSON("/api/v1/system/services");
}

export async function retryService(
  serviceName: string
): Promise<{ message: string; timestamp: number }> {
  return requestJSON(`/api/v1/system/services/${serviceName}/retry`, {
    method: "POST",
  });
}

export function connectInitializationStream(
  onUpdate: (status: InitializationStatus) => void,
  onError?: () => void
): () => void {
  const eventSource = new EventSource("/api/v1/system/initialization/stream");

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data && typeof data === "object") {
        onUpdate(data);
      }
    } catch {
      // Failed to parse init stream event - silent failure
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    if (onError) onError();
  };

  return () => eventSource.close();
}

// Wizard API
export interface WizardStatus {
  wizard_completed: boolean;
  docker_check_passed: boolean;
  docker_services_started: boolean;
  collection_created: boolean;
  last_step_completed: number;
  current_step: number;
}

export interface DockerCheckResult {
  available: boolean;
  command?: string;
  version?: string;
  has_gpu_hardware?: boolean;
  has_nvidia_runtime?: boolean;
  gpu_mode_enabled?: boolean;
  error?: string;
}

export interface DockerService {
  name: string;
  service: string;
  state: string;
  status: string;
  health: string;
}

export interface DockerStatusResult {
  success: boolean;
  running: boolean;
  healthy: boolean;
  services: DockerService[];
  error?: string;
}

export async function getWizardStatus(): Promise<WizardStatus> {
  return requestJSON("/api/v1/wizard/status");
}

export interface CheckDetail {
  passed: boolean;
  message: string;
}

export interface StartupCheckResponse {
  all_checks_passed: boolean;
  needs_wizard: boolean;
  is_first_run: boolean;  // True if wizard was never completed
  start_step: number | null;
  is_upgrade: boolean;
  checks: Record<string, CheckDetail>;
}

export async function checkStartupRequirements(): Promise<StartupCheckResponse> {
  return requestJSON("/api/v1/wizard/startup-check");
}
export async function checkDockerInstallation(): Promise<DockerCheckResult> {
  return requestJSON("/api/v1/wizard/docker-check");
}

export interface DockerImagesCheckResult {
  success: boolean;
  all_present: boolean;
  missing: string[];
  present: string[];
  total_required: number;
  error?: string;
}

export async function checkDockerImages(): Promise<DockerImagesCheckResult> {
  return requestJSON("/api/v1/wizard/docker-images-check");
}

export async function startDockerServices(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  return requestJSON("/api/v1/wizard/docker-start", { method: "POST" });
}

export async function getDockerStatus(): Promise<DockerStatusResult> {
  return requestJSON("/api/v1/wizard/docker-status");
}

export interface DockerPullProgress {
  image?: string;
  layer_id?: string;
  status?: string;
  current?: number;
  total?: number;
  progress_percent?: number;
  image_percent?: number;
  overall_percent?: number;
  progress_text?: string;
  message?: string;
  complete?: boolean;
  error?: string;
  heartbeat?: boolean;
  timestamp?: number;
}

export function connectDockerPullStream(
  onProgress: (data: DockerPullProgress) => void,
  onError?: (error: string) => void,
  onComplete?: () => void
): () => void {
  // Use GET for SSE (EventSource only supports GET)
  const eventSource = new EventSource("/api/v1/wizard/docker-pull");

  eventSource.onmessage = (event) => {
    try {
      const data: DockerPullProgress = JSON.parse(event.data);

      if (data.error) {
        if (onError) onError(data.error);
        eventSource.close();
      } else if (data.complete) {
        onProgress(data);
        if (onComplete) onComplete();
        eventSource.close();
      } else if (!data.heartbeat) {
        onProgress(data);
      }
    } catch {
      // Failed to parse docker pull event - silent failure
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    if (onError) onError("Connection lost");
  };

  return () => eventSource.close();
}

export function connectDockerLogsStream(
  onLog: (log: string, timestamp: number) => void,
  onError?: (error: string) => void
): () => void {
  const eventSource = new EventSource("/api/v1/wizard/docker-logs");

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error) {
        if (onError) onError(data.error);
      } else if (data.log) {
        onLog(data.log, data.timestamp);
      }
    } catch {
      // Failed to parse docker log event - silent failure
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    if (onError) onError("Connection lost");
  };

  return () => eventSource.close();
}

export interface CollectionLogEvent {
  log?: string;
  status?: string;
  complete?: boolean;
  heartbeat?: boolean;
  error?: string;
  timestamp: number;
}

export function connectCollectionLogsStream(
  onLog: (log: string, timestamp: number) => void,
  onComplete?: (status: string) => void,
  onError?: (error: string) => void
): () => void {
  const eventSource = new EventSource("/api/v1/wizard/collection-logs");

  eventSource.onmessage = (event) => {
    try {
      const data: CollectionLogEvent = JSON.parse(event.data);

      if (data.error) {
        if (onError) onError(data.error);
        eventSource.close();
      } else if (data.complete) {
        if (onComplete && data.status) onComplete(data.status);
        eventSource.close();
      } else if (data.log) {
        onLog(data.log, data.timestamp);
      }
      // Ignore heartbeat messages
    } catch {
      // Failed to parse collection log event - silent failure
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    if (onError) onError("Connection lost");
  };

  return () => eventSource.close();
}

// Model download API
export interface ModelStatusResult {
  exists: boolean;
  path: string;
  files: string[];
  missing_files: string[];
}

export async function getModelStatus(): Promise<ModelStatusResult> {
  return requestJSON("/api/v1/wizard/model-status");
}

export interface ModelDownloadProgress {
  status?: string;
  message?: string;
  file?: string;
  progress_percent?: number;
  // Byte-level progress
  file_percent?: number;
  file_downloaded?: number;
  file_total?: number;
  total_downloaded?: number;
  total_size?: number;
  // Legacy fields
  total_files?: number;
  completed_files?: number;
  complete?: boolean;
  error?: string;
  heartbeat?: boolean;
  timestamp?: number;
}

export function connectModelDownloadStream(
  onProgress: (data: ModelDownloadProgress) => void,
  onError?: (error: string) => void,
  onComplete?: () => void
): () => void {
  const eventSource = new EventSource("/api/v1/wizard/model-download");

  eventSource.onmessage = (event) => {
    try {
      const data: ModelDownloadProgress = JSON.parse(event.data);

      if (data.error) {
        if (onError) onError(data.error);
        eventSource.close();
      } else if (data.complete) {
        onProgress(data);
        if (onComplete) onComplete();
        eventSource.close();
      } else if (!data.heartbeat) {
        onProgress(data);
      }
    } catch {
      // Failed to parse model download event - silent failure
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    if (onError) onError("Connection lost");
  };

  return () => eventSource.close();
}

export async function createTypesenseCollection(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  return requestJSON("/api/v1/wizard/collection-create", { method: "POST" });
}

export async function getCollectionStatus(): Promise<{
  exists: boolean;
  ready: boolean;
  document_count?: number;
  error?: string;
}> {
  return requestJSON("/api/v1/wizard/collection-status");
}

export async function restartTypesense(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  return requestJSON("/api/v1/wizard/restart-typesense", { method: "POST" });
}

export async function completeWizard(): Promise<{
  success: boolean;
  message?: string;
}> {
  return requestJSON("/api/v1/wizard/complete", { method: "POST" });
}

export async function resetWizard(): Promise<{
  success: boolean;
  message: string;
  timestamp: number;
}> {
  return requestJSON("/api/v1/wizard/reset", { method: "POST" });
}

// App Container Startup API (Post-Wizard)
export async function startAppContainers(): Promise<{
  success: boolean;
  message?: string;
  timestamp: number;
}> {
  return requestJSON("/api/v1/wizard/app-containers-start", { method: "POST" });
}

export interface AppContainerStatus {
  success: boolean;
  running: boolean;
  healthy: boolean;
  services: DockerService[];
  error?: string;
  retrying?: boolean;  // Indicates error but will retry
  message?: string;
  timestamp: number;
  check_count?: number;  // Number of health check attempts
}

export function connectAppContainerStatusStream(
  onStatus: (status: AppContainerStatus) => void,
  onError?: (error: string) => void,
  onComplete?: () => void
): () => void {
  const eventSource = new EventSource("/api/v1/wizard/app-containers-status");

  eventSource.onmessage = (event) => {
    try {
      const data: AppContainerStatus = JSON.parse(event.data);

      // Always send status updates
      onStatus(data);

      if (data.error && !data.retrying) {
        // Fatal error (non-retrying)
        if (onError) onError(data.error);
        eventSource.close();
      } else if (data.healthy) {
        // Success - containers are healthy
        if (onComplete) onComplete();
        eventSource.close();
      }
      // If retrying=true, just update status and keep stream open
    } catch {
      // Failed to parse container status event - silent failure
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    if (onError) onError("Connection lost");
  };

  return () => eventSource.close();
}

// Extended Stats API types
export interface RecentFile {
  file_path: string;
  file_extension: string | null;
  file_size: number | null;
  mime_type: string | null;
  modified_time: number | null;
  indexed_at: number | null;
}

export interface RecentFilesResponse {
  files: RecentFile[];
  total: number;
}

export interface IndexingActivityPoint {
  timestamp: number;
  count: number;
}

export interface IndexingActivityResponse {
  range: "24h" | "7d";
  activity: IndexingActivityPoint[];
  total: number;
}

export interface FilesByTypeResponse {
  files: RecentFile[];
  total: number;
  page: number;
  per_page: number;
  extension: string;
}

export interface FilesByAgeResponse {
  files: RecentFile[];
  total: number;
  page: number;
  per_page: number;
  age_range: "30d" | "90d" | "1y" | "older";
}

export interface FileAgeDistribution {
  "30d": number;
  "90d": number;
  "1y": number;
  older: number;
}

export interface FileAgeDistributionResponse {
  distribution: FileAgeDistribution;
}

export interface StorageByTypeResponse {
  storage: Record<string, number>;
}

// Extended Stats API functions
export async function getRecentFiles(
  limit: number = 10
): Promise<RecentFilesResponse> {
  return requestJSON(`/api/v1/stats/recent-files?limit=${limit}`);
}

export async function getIndexingActivity(
  range: "24h" | "7d" = "24h"
): Promise<IndexingActivityResponse> {
  return requestJSON(`/api/v1/stats/indexing-activity?range=${range}`);
}

export async function getFilesByType(
  ext: string,
  page: number = 1,
  perPage: number = 20
): Promise<FilesByTypeResponse> {
  return requestJSON(
    `/api/v1/stats/files-by-type?ext=${encodeURIComponent(
      ext
    )}&page=${page}&per_page=${perPage}`
  );
}

export async function getFilesByAge(
  ageRange: "30d" | "90d" | "1y" | "older",
  page: number = 1,
  perPage: number = 20
): Promise<FilesByAgeResponse> {
  return requestJSON(
    `/api/v1/stats/files-by-age?age_range=${ageRange}&page=${page}&per_page=${perPage}`
  );
}

export async function getFileAgeDistribution(): Promise<FileAgeDistributionResponse> {
  return requestJSON("/api/v1/stats/file-age-distribution");
}

export async function getStorageByType(): Promise<StorageByTypeResponse> {
  return requestJSON("/api/v1/stats/storage-by-type");
}

export interface IndexStorageResponse {
  num_documents: number;
  collection_name: string;
  index_memory_bytes: number;
  resident_memory_bytes: number;
  fragmentation_ratio: number;
}

export async function getIndexStorage(): Promise<IndexStorageResponse> {
  return requestJSON("/api/v1/stats/index-storage");
}
