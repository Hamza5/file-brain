# Context: Smart File Finder

## Current focus
- Provide a full crawler & search console UI over the existing FastAPI + Typesense backend.
- Backend orchestrated by [lifespan()](main.py:22) with crawl control via [CrawlJobManager](services/crawl_job_manager.py:46).
- Real-time monitoring enabled through [FileWatcher](services/watcher.py:16).
- Typesense collection auto-init via [initialize_collection()](services/typesense_client.py:29) with schema [get_collection_schema()](config/typesense_schema.py:7) including embeddings.
- Frontend is a multi-page React InstantSearch app in [App.tsx](frontend/src/App.tsx:1) with:
  - AppShell layout and sidebar navigation.
  - SearchPage with custom hit renderer, icons, and pagination.
  - StatsPage with live stats from /api/crawler/stats and Recharts visualizations.
  - SettingsPage with crawler controls, crawler options, and Watch Paths manager.

## Recent changes
- Authored Memory Bank docs:
  - Product overview in [product.md](.kilocode/rules/memory-bank/product.md).
  - Architecture in [architecture.md](.kilocode/rules/memory-bank/architecture.md).
  - Tech stack and operations in [tech.md](.kilocode/rules/memory-bank/tech.md).
- Improved crawl orchestration:
  - [CrawlJobManager](services/crawl_job_manager.py:46) now offloads CPU/IO-heavy work (file hashing, Docling extraction, Typesense I/O) to a bounded ThreadPoolExecutor via [_run_in_executor()](services/crawl_job_manager.py:401).
  - Indexing and discovery loops use cooperative cancellation via _stop_event to ensure responsive shutdown.
- Control-plane responsiveness:
  - [/api/crawler/status](api/crawler.py:129) reads cheap in-memory/DB state; no heavy work on the event loop.
  - [/api/crawler/stop](api/crawler.py:146) signals _stop_event, stops watcher, cancels tasks, and returns without waiting for long-running extraction/indexing.
- New frontend console:
  - App shell with sidebar and header in [AppShell.tsx](frontend/src/layout/AppShell.tsx:1).
  - Search UI in [SearchPage.tsx](frontend/src/pages/SearchPage.tsx:1) using TypesenseInstantSearchAdapter, custom hit cards with React Icons, and InstantSearch Pagination.
  - Stats UI in [StatsPage.tsx](frontend/src/pages/StatsPage.tsx:1) using /api/crawler/stats and Recharts (coverage pie + hourly bar).
  - Settings UI in [SettingsPage.tsx](frontend/src/pages/SettingsPage.tsx:1) including:
    - Crawler controls mapped to /api/crawler/start, /stop, /clear-indexes.
    - Crawler options (start_monitoring, include_subdirectories) bound to /api/crawler/settings.
    - Watch Paths manager wired to /api/config/watch-paths* endpoints.
  - Shared StatusContext in [StatusContext.tsx](frontend/src/context/StatusContext.tsx:1) consuming:
    - /api/crawler/status and /api/crawler/stats snapshots.
    - /api/crawler/stream SSE for live updates, with polling fallback.
- Backend APIs:
  - /api/crawler/stats implemented for structured CrawlStats.
  - /api/crawler/stream emits strict JSON SSE payloads for UI consumption.
  - /api/config/watch-paths* endpoints used as the single source of truth for UI-managed watch paths.

## Implementation snapshot
- API surfaces:
  - Crawler control endpoints: [router](api/crawler.py:25).
  - Configuration endpoints: [router](api/configuration.py:1).
- Persistence and state:
  - DB base and session: [Base](database/models/base.py:9), [SessionLocal](database/models/base.py:19).
  - Models: [CrawlerState](database/models/crawler_state.py:9), [Setting](database/models/setting.py:9), [WatchPath](database/models/watch_path.py:9).
  - Helper service: [DatabaseService](services/database_service.py:12).
- Extraction path:
  - Preferred: [ContentExtractor](services/extractor.py:23) using Docling.
  - Fallback: [ContentExtractor._extract_basic](services/extractor.py:119).
- Indexing:
  - Upserts: [index_file()](services/typesense_client.py:77).
  - Deletes: [remove_from_index()](services/typesense_client.py:143).
  - Progress semantics: [get_status()](services/crawl_job_manager.py:189) clamps indexing_progress below 100 when pending work exists.

## Gaps and observations
- Dual processing implementations present:
  - Primary: [CrawlJobManager](services/crawl_job_manager.py:46) handles discovery/indexing/monitoring with cooperative cancellation and thread-pooled heavy work.
  - Legacy/aux: [FileProcessor](workers/file_processor.py:18) exists but is not wired into startup paths; consider deprecating or consolidating.
- Embedding config uses Typesense "embed" with model ts/e5-small-v2 in [get_collection_schema()](config/typesense_schema.py:54). Ensure local Typesense build supports embeddings.
- Frontend currently lacks facets, hit rendering, and config UI; only basic search box and hits.

## Next steps (short-term)
1. Add basic facets and custom hit renderer in [App.tsx](frontend/src/App.tsx:1) (file_extension, mime_type).
2. Confirm Typesense setup and keys:
   - Search-only key in frontend [App.tsx](frontend/src/App.tsx:1).
   - Admin key only server-side [settings.typesense_api_key](config/settings.py:29).
3. Harden progress reporting and edge cases in [get_status()](services/crawl_job_manager.py:189).
4. Document and verify .env; align with [Settings(BaseSettings)](config/settings.py:12).
5. Write minimal e2e flow test for start/stop crawl in [router](api/crawler.py:40,146) to assert:
   - /status remains responsive during heavy indexing.
   - /stop returns quickly and does not process substantial new work after the stop request.

## Medium-term items
- Create Docker Compose for app + Typesense.
- UI for managing watch paths and crawler settings (if not already fully covered in [router](api/configuration.py:1)).
- Optional: consolidate or remove [FileProcessor](workers/file_processor.py:18); ensure a single ingestion path.

## Risks
- Embeddings require Typesense with embedding provider support; verify local environment version and feature flags.
- Large file performance and OCR throughput; tune thread pool and queue size in [CrawlJobManager](services/crawl_job_manager.py:46).
- Misconfiguration of CRAWLER_WORKERS or MAX_FILE_SIZE_MB could affect throughput or resource use; defaults are conservative.
