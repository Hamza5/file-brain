import { Hits, SearchBox, Pagination, Configure, useInstantSearch } from "react-instantsearch";
import { Card } from "primereact/card";

type HitType = {
  file_name: string;
  path: string;
  file_extension?: string;
  mime_type?: string;
  file_size?: number;
  modified_time?: number;
  content?: string;
  // Enhanced metadata from Tika extraction
  title?: string;
  author?: string;
  description?: string;
  subject?: string;
  language?: string;
  producer?: string;
  application?: string;
  keywords?: string[];
  extraction_method?: string;
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

function pickIconClass(hit: HitType): string {
  const ext = (hit.file_extension || "").toLowerCase();
  const mime = (hit.mime_type || "").toLowerCase();

  if (ext === ".pdf" || mime.includes("pdf")) return "far fa-file-pdf";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext))
    return "far fa-file-image";
  if (mime.startsWith("image/")) return "far fa-file-image";
  if (
    [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs"].includes(
      ext
    )
  )
    return "far fa-file-code";
  if (mime.startsWith("text/")) return "far fa-file-alt";
  if (mime.startsWith("video/")) return "far fa-file-video";
  if (mime.startsWith("audio/")) return "far fa-file-audio";
  return "far fa-file";
}

function Hit({ hit }: { hit: HitType }) {
  const snippet = hit.content || "";
  const shortSnippet =
    snippet.length > 260 ? `${snippet.slice(0, 260)}…` : snippet;

  return (
    <Card
      style={{
        border: "1px solid var(--surface-border)",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", height: "100%" }}>
        <div
          style={{
            fontSize: "1.75rem",
            color: "var(--primary-color)",
            flexShrink: 0,
            marginTop: "0.25rem",
          }}
        >
          <i className={pickIconClass(hit)} aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              marginBottom: "0.35rem",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: "1rem",
                color: "var(--text-color)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={hit.file_name}
            >
              {hit.file_name}
            </div>
            {hit.file_extension && (
              <span
                style={{
                  padding: "0.25rem 0.5rem",
                  borderRadius: "4px",
                  fontSize: "0.65rem",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  backgroundColor: "var(--primary-color)",
                  color: "white",
                }}
              >
                {hit.file_extension.replace(".", "")}
              </span>
            )}
            {hit.mime_type && (
              <span
                style={{
                  padding: "0.25rem 0.5rem",
                  borderRadius: "4px",
                  fontSize: "0.6rem",
                  border: "1px solid var(--surface-border)",
                  color: "var(--text-color-secondary)",
                  backgroundColor: "var(--surface-50)",
                }}
              >
                {hit.mime_type}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--text-color-secondary)",
              marginBottom: "0.5rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={hit.path}
          >
            {hit.path}
          </div>
          {shortSnippet && (
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--text-color)",
                marginBottom: "0.5rem",
                lineHeight: "1.4",
                maxHeight: "3em",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {shortSnippet}
            </div>
          )}
          
          {/* Enhanced metadata from Tika */}
          {(hit.title || hit.author || hit.subject || hit.language || hit.keywords) && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                fontSize: "0.75rem",
                color: "var(--text-color-secondary)",
                backgroundColor: "var(--surface-50)",
                padding: "0.5rem",
                borderRadius: "4px",
                marginBottom: "0.5rem",
              }}
            >
              {hit.title && (
                <div>
                  <strong>Title:</strong>{" "}
                  <span style={{ color: "var(--text-color)", fontStyle: "italic" }}>
                    {hit.title}
                  </span>
                </div>
              )}
              {hit.author && (
                <div>
                  <strong>Author:</strong>{" "}
                  <span style={{ color: "var(--text-color)" }}>
                    {hit.author}
                  </span>
                </div>
              )}
              {hit.subject && (
                <div>
                  <strong>Subject:</strong>{" "}
                  <span style={{ color: "var(--text-color)" }}>
                    {hit.subject}
                  </span>
                </div>
              )}
              {hit.keywords && hit.keywords.length > 0 && (
                <div>
                  <strong>Keywords:</strong>{" "}
                  <span style={{ color: "var(--text-color)" }}>
                    {hit.keywords.slice(0, 3).join(", ")}
                    {hit.keywords.length > 3 && "..."}
                  </span>
                </div>
              )}
              {hit.language && (
                <div>
                  <strong>Language:</strong>{" "}
                  <span style={{ color: "var(--text-color)" }}>
                    {hit.language.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          )}
          
          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              fontSize: "0.75rem",
              color: "var(--text-color-secondary)",
              flexWrap: "wrap",
              marginTop: "auto",
            }}
          >
            <span>
              <strong>Size:</strong>{" "}
              <span style={{ color: "var(--text-color)" }}>
                {formatSize(hit.file_size)}
              </span>
            </span>
            <span>
              <strong>Modified:</strong>{" "}
              <span style={{ color: "var(--text-color)" }}>
                {formatDate(hit.modified_time)}
              </span>
            </span>
            {hit.extraction_method && (
              <span>
                <strong>Extracted via:</strong>{" "}
                <span style={{ color: "var(--text-color)", textTransform: "capitalize" }}>
                  {hit.extraction_method}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function HybridSemanticConfigure() {
  const { uiState } = useInstantSearch();
  const indexState = uiState.files || {};
  const query = (indexState.query as string | undefined) || "";
  const hasQuery = query.trim().length > 0;

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 600,
            color: "var(--text-color)",
          }}
        >
          Search
        </h1>
        <p
          style={{
            margin: "0.5rem 0 0 0",
            fontSize: "0.9rem",
            color: "var(--text-color-secondary)",
          }}
        >
          Query your indexed files with full-text and semantic-powered search.
        </p>
      </div>

      {/* Search box */}
      <Card style={{ border: "1px solid var(--surface-border)" }}>
        <div style={{ position: "relative" }}>
          <SearchBox
            placeholder="Search by file name, path, or content..."
            classNames={{
              root: "",
              form: "",
              input: "ais-SearchBox-input",
              submit: "hidden",
              reset: "hidden",
            }}
          />
        </div>
      </Card>

      {/* Hybrid semantic search configuration */}
      <HybridSemanticConfigure />

      {/* Results Grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Hits<HitType> hitComponent={Hit} />
      </div>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          paddingTop: "1rem",
        }}
      >
        <Pagination
          classNames={{
            root: "p-d-flex",
            list: "p-d-flex",
            item: "p-px-2 p-py-1",
            selectedItem: "p-px-2 p-py-1",
            disabledItem: "p-px-2 p-py-1",
            link: "",
          }}
        />
      </div>
    </div>
  );
}
