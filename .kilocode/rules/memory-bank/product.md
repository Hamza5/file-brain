# Product: File Brain

## Why this exists
File Brain enables fast, reliable search across large local file collections with intelligent content extraction and real‑time updates. It reduces time spent locating documents, supports knowledge reuse, and keeps indexes fresh automatically.

## Problems it solves
- Slow or incomplete OS/file-manager search.
- No unified search across heterogeneous formats (PDF, text, images with text).
- Stale indexes after file changes, moves, or deletions.
- Lack of semantic snippets and metadata for quick triage.
- Operational fragility in long-running crawls.

## Who will use it
- Individual developers and researchers with large local archives.
- Small teams needing self-hosted, private search.
- Operations/IT indexing shared drives or project workspaces.

## Core outcomes
- Find the right file fast with high recall and relevant snippets.
- Keep index consistent with the filesystem in near real time.
- Be safe and resumable across restarts.

## Key features
- Parallel discovery and indexing with back-pressure aware queues.
- Real-time monitoring via watchdog with conversion to typed crawl operations.
- Apache Tika-based extraction with OCR for PDFs and 1400+ file formats; graceful fallbacks for unsupported formats.
- Typesense-backed full-text + facet search with embeddings for semantic ranking.
- Auto-resume on startup if a crawl was in progress.
- Simple REST API for control and configuration, plus a minimal React UI using InstantSearch.

## High-level product narrative
1. User configures one or more watch paths via API.
2. Starts a crawl; system discovers files and enqueues operations while indexing runs in parallel.
3. Watcher streams filesystem changes as operations to the same queue.
4. Extractor converts content to markdown and metadata; Typesense is upserted as the source of truth.
5. Frontend queries Typesense and renders hits with snippets and facets.

## UX goals
- Zero-config defaults; safe to run out of the box.
- Clear status and progress reporting (running, job type, queue size, ETA).
- Fast, incremental search with responsive filters.
- Idempotent operations; repeated runs never duplicate.

## Non-goals (for now)
- Distributed crawling across multiple hosts.
- Deep ML-based document understanding beyond embeddings.
- Cloud multi-tenant SaaS.

## Value proposition
- Private, local, and fast: Typesense provides millisecond search.
- Accurate and current: File hash + upsert semantics keep the index synchronized.
- Resilient: Auto-resume and watchdog integration prevent missed updates.

## Success criteria
- p95 end-to-end search latency under 200 ms for 100k documents on modest hardware.
- Index freshness: changes visible in search within 5 seconds during monitoring.
- Crash-safe: restart resumes the prior job and monitoring state correctly.

## References to implementation
- Configuration and app info: [Settings(BaseSettings)](config/settings.py:12), [get_app_info()](utils/app_info.py:11)
- Crawl orchestration: [CrawlJobManager](services/crawl_job_manager.py:46)
- File monitoring: [FileWatcher](services/watcher.py:16)
- Extraction: [ContentExtractor](services/extractor.py:23)
- Search index client: [TypesenseClient](services/typesense_client.py:14)
- API surface: [router](api/crawler.py:25), [router](api/configuration.py:1)
- Frontend InstantSearch integration: [App.tsx](frontend/src/App.tsx)

## Future enhancements
- De-duplication across hardlinks and content-hash families.
- Pluggable embedding models and re-ranking.
- Role-based auth for the API and UI.
- Move progress and job history to a dedicated table with audit logs.