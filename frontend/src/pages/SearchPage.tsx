import { Hits, SearchBox, Pagination, Configure, useInstantSearch } from "react-instantsearch";
import {
  FiFile,
  FiFileText,
  FiImage,
  FiCode,
  FiVideo,
  FiMusic,
} from "react-icons/fi";

type HitType = {
  file_name: string;
  path: string;
  file_extension?: string;
  mime_type?: string;
  file_size?: number;
  modified_time?: number;
  content?: string;
};

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(ts?: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

function pickIcon(hit: HitType) {
  const ext = (hit.file_extension || "").toLowerCase();
  const mime = (hit.mime_type || "").toLowerCase();

  if (ext === ".pdf" || mime.includes("pdf")) return <FiFileText />;
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext))
    return <FiImage />;
  if (mime.startsWith("image/")) return <FiImage />;
  if (
    [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs"].includes(
      ext
    )
  )
    return <FiCode />;
  if (mime.startsWith("text/")) return <FiFileText />;
  if (mime.startsWith("video/")) return <FiVideo />;
  if (mime.startsWith("audio/")) return <FiMusic />;
  return <FiFile />;
}

function Hit({ hit }: { hit: HitType }) {
  const snippet = hit.content || "";
  const shortSnippet =
    snippet.length > 260 ? `${snippet.slice(0, 260)}…` : snippet;

  return (
    <div className="flex gap-3 p-3 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-sky-500/70 hover:bg-slate-900 transition-colors">
      <div className="mt-1 text-sky-400">{pickIcon(hit)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-slate-50 truncate">
            {hit.file_name}
          </div>
          {hit.file_extension && (
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] uppercase text-sky-300">
              {hit.file_extension.replace(".", "")}
            </span>
          )}
          {hit.mime_type && (
            <span className="px-2 py-0.5 rounded-full bg-slate-900 text-[9px] text-slate-400 border border-slate-700">
              {hit.mime_type}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 truncate">
          {hit.path}
        </div>
        <div className="mt-2 text-xs text-slate-300 whitespace-pre-line">
          {shortSnippet || <span className="text-slate-600">No preview.</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
          <span>Size: <span className="text-slate-200">{formatSize(hit.file_size)}</span></span>
          <span>Modified: <span className="text-slate-200">{formatDate(hit.modified_time)}</span></span>
        </div>
      </div>
    </div>
  );
}

function HybridSemanticConfigure() {
  // React InstantSearch v7: useInstantSearch gives access to UI state.
  const { uiState } = useInstantSearch();

  // Our single index is "files" (see App.tsx InstantSearch indexName).
  const indexState = uiState.files || {};
  const query = (indexState.query as string | undefined) || "";
  const hasQuery = query.trim().length > 0;

  // `typesenseVectorQuery` is a special passthrough param understood by
  // typesense-instantsearch-adapter and forwarded as `vector_query`.
  // We use a typed extension of the underlying search parameters to satisfy TS/ESLint.
  type TypesenseConfigureProps = React.ComponentProps<typeof Configure> & {
    typesenseVectorQuery?: string;
  };

  const configureProps: TypesenseConfigureProps = hasQuery
    ? { typesenseVectorQuery: "embedding:([], k:50)" }
    : { typesenseVectorQuery: undefined };

  return <Configure {...configureProps} />;
}

export function SearchPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Search</h1>
          <p className="text-xs text-slate-400">
            Query your indexed files with full-text and metadata-aware search.
          </p>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2">
        <SearchBox
          placeholder="Search by file name, path, or content..."
          classNames={{
            root: "w-full",
            form: "flex items-center gap-2",
            input:
              "w-full bg-slate-950 text-slate-50 text-sm px-3 py-2 rounded outline-none border border-slate-700 focus:border-sky-500",
            submit:
              "hidden",
            reset: "hidden",
          }}
        />
      </div>

      {/* Always-on hybrid semantic search:
          - When query is non-empty, HybridSemanticConfigure injects typesenseVectorQuery
          - When query is empty, only lexical search runs
      */}
      <HybridSemanticConfigure />

      <div className="space-y-2">
        <Hits<HitType> hitComponent={Hit} />
      </div>

      <div className="pt-2 flex justify-center">
        <Pagination
          classNames={{
            root: "inline-flex items-center gap-1 text-[10px]",
            list: "flex items-center gap-1",
            item: "px-2 py-1 rounded border border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900 hover:text-sky-400 cursor-pointer",
            selectedItem:
              "px-2 py-1 rounded border border-sky-500 bg-sky-600/20 text-sky-300 font-semibold",
            disabledItem:
              "px-2 py-1 rounded border border-slate-900 bg-slate-900/60 text-slate-600 cursor-not-allowed",
            link: "outline-none",
          }}
        />
      </div>
    </div>
  );
}