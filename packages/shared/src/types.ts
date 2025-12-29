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
    estimated_completion: number | null;
  };
  timestamp: number;
}

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
  file_types: Record<string, number>;
  runtime: CrawlRuntime;
  healthy: boolean;
}

export interface WatchPath {
  id: number;
  path: string;
  enabled: boolean;
  include_subdirectories: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}
