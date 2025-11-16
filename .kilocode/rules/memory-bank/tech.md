# Tech: File Brain

## Stack overview
- Backend: FastAPI with lifecycle [lifespan()](main.py:22) and routers [router](api/crawler.py:25), [router](api/configuration.py:1), [router](api/system.py:1).
- Persistence: SQLAlchemy + SQLite at [DATABASE_URL](database/models/base.py:12) and session [SessionLocal](database/models/base.py:19).
- Search: Typesense via [TypesenseClient](services/typesense_client.py:14) and schema [get_collection_schema()](config/typesense_schema.py:7).
- Extraction: Apache Tika via [ContentExtractor](services/extractor.py:23) with fallback [ContentExtractor._extract_basic](services/extractor.py:119).
- Monitoring: Watchdog through [FileWatcher](services/watcher.py:16) and [OperationEventHandler](services/watcher.py:109).
- Orchestration: [CrawlJobManager](services/crawl_job_manager.py:46) with status [get_status()](services/crawl_job_manager.py:182).
- Service Management: [ServiceManager](services/service_manager.py:39) for centralized health monitoring and initialization tracking.
- Frontend: React + Vite InstantSearch in [App.tsx](frontend/src/App.tsx:1).

## Dependencies and versions
- Python 3.11
- fastapi[standard-no-fastapi-cloud-cli] >=0.121,<0.122 ([pyproject.toml](pyproject.toml:17))
- sqlalchemy >=2.0.44,<3 ([pyproject.toml](pyproject.toml:18))
- pydantic >=2.12.4,<3 ([pyproject.toml](pyproject.toml:11))
- pydantic-settings >=2.11,<3 ([pyproject.toml](pyproject.toml:12))
- watchdog >=6,<7 ([pyproject.toml](pyproject.toml:13))
- tika >=3.1.0,<4 ([pyproject.toml](pyproject.toml:19))
- typesense >=1.1.1,<2 ([pyproject.toml](pyproject.toml:15))
- python-magic >=0.4.27,<0.5 ([pyproject.toml](pyproject.toml:16))
- Frontend libs: typesense-instantsearch-adapter (see [App.tsx](frontend/src/App.tsx:1), [package.json](frontend/package.json:1))

## Local services
- Typesense server required; defaults from [settings.typesense_*](config/settings.py:29).

Run via Docker:

```bash
docker run -d --name typesense \
  -p 8108:8108 \
  -v $(pwd)/typesense-data:/data \
  -e TYPESENSE_API_KEY=xyz-typesense-key \
  -e TYPESENSE_DATA_DIR=/data \
  typesense/typesense:0.25.1 --enable-cors
```

- Collection auto-created on first run by [initialize_collection()](services/typesense_client.py:29).

## Configuration
- App settings loaded from .env by [Settings(BaseSettings)](config/settings.py:12).

Example .env:

```ini
DEBUG=true
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=xyz-typesense-key
TYPESENSE_COLLECTION_NAME=files
WATCH_PATHS=/home/you/docs,/home/you/images
MAX_FILE_SIZE_MB=100
BATCH_SIZE=10
WORKER_QUEUE_SIZE=1000
```

- Crawler toggles persisted in DB via [initialize_default_crawler_settings](services/database_service.py:39) and API [update_crawler_settings()](api/crawler.py:248).

## Running backend
```bash
# With uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Or
python main.py
```

## Running frontend
```bash
cd frontend
npm install
npm run dev
```

## Operational notes
- Typesense is source of truth; writes are upserts [index_file()](services/typesense_client.py:77), clears via [clear_all_documents()](services/typesense_client.py:198).
- Idempotent reindex: compare [get_doc_by_path()](services/typesense_client.py:61) in [CrawlJobManager._handle_create_edit_operation](services/crawl_job_manager.py:626).
- Queue/back-pressure: asyncio.Queue maxsize=1000 at [CrawlJobManager](services/crawl_job_manager.py:67); thread pool [max_workers=4](services/crawl_job_manager.py:69).
- File size cap with MAX_FILE_SIZE_MB in [CrawlJobManager](services/crawl_job_manager.py:600) and [FileProcessor](workers/file_processor.py:204).
- Health endpoint [health_check](main.py:396).
- Logging configured in [logger](utils/logger.py:55).

## Service Management and Health Monitoring
- **Critical vs Background Initialization**: Database initialization blocks startup, while Typesense, crawl manager, and file watcher initialize in background
- **Service Health Tracking**: [ServiceManager](services/service_manager.py:39) tracks 4 core services with health checkers running every 30 seconds
- **Health Checkers**: 
  - Database: Uses SQLAlchemy `text()` for raw SQL queries
  - Typesense: Uses `get_collection_stats()` method (not `get_collectionstats`)
  - Crawl Manager: Queries status via `get_status()` method
  - File Watcher: Verifies watchdog library availability
- **Retry Logic**: Failed services retry up to 3 times with exponential backoff (2^n seconds, max 5 minutes)
- **API Endpoints**: 
  - `/api/system/initialization` - Real-time service initialization status
  - `/health` - Comprehensive health check with service status
  - `/api/crawler/status` - Enhanced with service availability information

## Security
- Frontend uses a search-only Typesense key at [App.tsx](frontend/src/App.tsx:6). Server uses admin key from [settings](config/settings.py:32). Do not expose admin key to the browser.

## Testing
- pytest available ([pyproject.toml](pyproject.toml:26)).
```bash
pytest -q
```

## Tuning and limits
- Include/exclude subdirectories via [get_crawler_settings](services/database_service.py:20).
- Adjust thread pool and queue sizes in [CrawlJobManager](services/crawl_job_manager.py:67) and [services/crawl_job_manager.py](services/crawl_job_manager.py:69).
- Embedding model configured in [get_collection_schema()](config/typesense_schema.py:54).

## Recent Fixes (2025-11-15)
- **Health Check Timeout Issue**: Services marked as READY during initialization now maintain healthy status even without active health checkers
- **SQLAlchemy Compatibility**: Fixed database health checker to use `text("SELECT 1")` instead of raw SQL strings
- **Typesense Method Names**: Corrected health checker to use `get_collection_stats()` instead of non-existent `get_collectionstats()`
- **Service Manager**: Added centralized service state management with proper health monitoring
- **Background Initialization**: Services properly initialize asynchronously without blocking FastAPI startup