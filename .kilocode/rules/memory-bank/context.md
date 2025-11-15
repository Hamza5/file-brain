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
- **Fixed Background Task Health Monitoring (2025-11-15)**:
  - Implemented [ServiceManager](services/service_manager.py:39) for centralized service state management
  - Added [critical_init()](main.py:23) for immediate startup with database initialization
  - Added [background_init()](main.py:62) for non-blocking service initialization (Typesense, crawl manager, file watcher)
  - Added [health_monitoring_loop()](main.py:317) for continuous service health checks every 30 seconds
  - Fixed health checker implementations with correct SQLAlchemy text() syntax and Typesense method names
  - Services now properly maintain "healthy" status instead of failing after 30-second timeouts
  - Added system API endpoint for service initialization status
  - Enhanced frontend StatusContext to handle degraded service modes gracefully

- Authored Memory Bank docs:
  - Product overview in [product.md](.kilocode/rules/memory-bank/product.md).
  - Architecture in [architecture.md](.kilocode/rules/memory-bank/architecture.md).
  - Tech stack and operations in [tech.md](.kilocode/rules/memory-bank/tech.md).
- Improved crawl orchestration:
  - [CrawlJobManager](services/crawl_job_manager.py:46) now offloads CPU/IO-heavy work (file hashing, Tika extraction, Typesense I/O) to a bounded ThreadPoolExecutor via [_run_in_executor()](services/crawl_job_manager.py:401).
  - Indexing and discovery loops use cooperative cancellation via _stop_event to ensure responsive shutdown.
- Control-plane responsiveness:
  - [/api/crawler/status](api/crawler.py:129) reads cheap in-memory/DB state; no heavy work on the event loop.
  - [/api/crawler/stop](api/crawler.py:146) signals _stop_event, stops watcher, cancels tasks, and returns without waiting for long-running extraction/indexing.
- Comprehensive UI refactoring (Nov 2025):
  - **AppShell.tsx**: Replaced custom grid layout with PrimeReact Sidebar for responsive navigation; fixed sidebar button visibility with explicit styling; switched to FontAwesome icons (fas fa-bars, fas fa-search, fas fa-chart-pie, fas fa-cog).
  - **SearchPage.tsx**: Wrapped hit cards in PrimeReact Card component; implemented responsive grid with `grid-template-columns: repeat(auto-fill, minmax(350px, 1fr))`; fixed search box padding to prevent text interference with icon; enhanced typography and spacing.
  - **SettingsPage.tsx**: Organized into three PrimeReact Card sections (Controls, Options, Watch Paths); replaced custom buttons with PrimeReact Button with severity levels; added PrimeReact Message component for feedback.
  - **StatsPage.tsx**: Wrapped stat cards in PrimeReact Card component; implemented responsive grid for summary stats; disabled chart animations with `animation: false` to prevent re-render jank; added explicit height containers for charts.
  - **FolderSelectModal.tsx**: Replaced custom modal with PrimeReact Dialog component; improved breadcrumb navigation styling; enhanced folder list with proper selection states.
  - **index.css**: Enabled PrimeReact core CSS; added InstantSearch input styling with search icon pseudo-element; styled pagination controls with hover/active states; added PrimeReact component overrides for consistency; added `.ais-Hits-list` grid styling with `display: grid` and `grid-template-columns: repeat(auto-fill, minmax(350px, 1fr))`; added `.ais-Hits-item { display: contents; }` to make list items transparent to grid layout.
- New frontend console:
  - App shell with sidebar and header in [AppShell.tsx](frontend/src/layout/AppShell.tsx:1).
  - Search UI in [SearchPage.tsx](frontend/src/pages/SearchPage.tsx:1) using TypesenseInstantSearchAdapter, custom hit cards with FontAwesome icons, and InstantSearch Pagination with responsive grid layout.
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
  - System health endpoints: [router](api/system.py:1) for service initialization status
- Persistence and state:
  - DB base and session: [Base](database/models/base.py:9), [SessionLocal](database/models/base.py:19).
  - Models: [CrawlerState](database/models/crawler_state.py:9), [Setting](database/models/setting.py:9), [WatchPath](database/models/watch_path.py:9).
  - Helper service: [DatabaseService](services/database_service.py:12).
- Extraction path:
  - Preferred: [ContentExtractor](services/extractor.py:23) using Apache Tika.
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
- Service Management:
  - ServiceManager tracks 4 core services: database, typesense, crawl_manager, file_watcher
  - Health checkers registered for continuous monitoring with 30-second intervals
  - Services marked as READY during initialization maintain healthy status without requiring active health checkers
  - Failed services automatically retry with exponential backoff (up to 3 attempts)

## Gaps and observations
- Dual processing implementations present:
  - Primary: [CrawlJobManager](services/crawl_job_manager.py:46) handles discovery/indexing/monitoring with cooperative cancellation and thread-pooled heavy work.
  - Legacy/aux: [FileProcessor](workers/file_processor.py:18) exists but is not wired into startup paths; consider deprecating or consolidating.
- Hybrid search assumes:
  - Typesense server version supports embed + vector_query.
  - Collection was (re)created with the embedding field active.
- Frontend hybrid behavior:
  - Currently configured globally via additionalSearchParameters; no per-query toggle.
- Service Health Monitoring:
  - Health checkers must use correct method names and SQLAlchemy syntax to avoid false failures
  - Services without health checkers rely on initialization state rather than active monitoring

## Next steps
- UI is now production-ready with professional PrimeReact styling and responsive layouts.
- Service health monitoring system is robust and handles service failures gracefully.
- Confirm Typesense deployment:
  - Version supports embeddings and vector_query.
  - Embedding provider/model configured for ts/e5-small-v2 (or chosen model).
- Optionally:
  - Align backend search_files() in [TypesenseClient](services/typesense_client.py:220) to use the same hybrid parameters for API consumers.
- Maintain docs so future changes respect always-on hybrid semantics.

## Risks
- If server or collection is not correctly configured for embeddings, vector_query calls will error.
- Need to ensure operational docs clearly specify Typesense embedding requirements for this hybrid mode.
- Health monitoring requires maintenance of correct method signatures and SQL syntax to prevent false service failures.

## UI/UX Implementation Details
- **Grid Layout**: Search results use CSS Grid with `display: contents` on list items to achieve responsive card layout (350px minimum width per card).
- **Icon System**: FontAwesome 6 Free icons used throughout (fas fa-* classes) for consistency and availability.
- **Component Library**: All UI components use PrimeReact for consistency, theming, and accessibility.
- **Responsive Design**: Mobile-first approach with breakpoints at 768px for tablet/desktop adjustments.
- **Chart Optimization**: Recharts animations disabled to prevent jank during live stat updates.
- **Search UX**: Hybrid semantic search configured globally; search box includes icon pseudo-element for visual clarity.
- **Service Status**: Frontend gracefully handles degraded service modes and shows appropriate warnings to users.
