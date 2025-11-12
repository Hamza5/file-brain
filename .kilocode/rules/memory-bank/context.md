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
- Hybrid semantic search integration:
  - Typesense collection schema includes an "embedding" field with "embed.from" over [title, description, content] using ts/e5-small-v2 ([get_collection_schema()](config/typesense_schema.py:7)).
  - Frontend TypesenseInstantSearchAdapter in [App.tsx](frontend/src/App.tsx:11) configured with:
    - additionalSearchParameters.query_by = "file_name,file_path,content,title,description,embedding"
    - additionalSearchParameters.exclude_fields = "embedding"
    - additionalSearchParameters.vector_query = "embedding:([], k:50)"
  - This makes all non-empty queries run hybrid (lexical + semantic) without user toggles, aligned with Typesense InstantSearch adapter semantics.

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
- Search / Hybrid semantics:
  - Typesense is the single source of truth; collection schema includes embedding field.
  - Frontend uses TypesenseInstantSearchAdapter with:
    - query_by covering file_name, file_path, content, title, description, embedding.
    - vector_query targeting the embedding field for k-NN.
    - embedding excluded from hits.
  - Result: Always-on hybrid (keyword + semantic) search from the React InstantSearch UI, modeled after official Typesense adapter patterns.

## Gaps and observations
- Dual processing implementations present:
  - Primary: [CrawlJobManager](services/crawl_job_manager.py:46) handles discovery/indexing/monitoring with cooperative cancellation and thread-pooled heavy work.
  - Legacy/aux: [FileProcessor](workers/file_processor.py:18) exists but is not wired into startup paths; consider deprecating or consolidating.
- Hybrid search assumes:
  - Typesense server version supports embed + vector_query.
  - Collection was (re)created with the embedding field active.
- Frontend hybrid behavior:
  - Currently configured globally via additionalSearchParameters; no per-query toggle.

## Next steps
- Confirm Typesense deployment:
  - Version supports embeddings and vector_query.
  - Embedding provider/model configured for ts/e5-small-v2 (or chosen model).
- Optionally:
  - Align backend search_files() in [TypesenseClient](services/typesense_client.py:220) to use the same hybrid parameters for API consumers.
- Maintain docs so future changes respect always-on hybrid semantics.

## Risks
- If server or collection is not correctly configured for embeddings, vector_query calls will error.
- Need to ensure operational docs clearly specify Typesense embedding requirements for this hybrid mode.
