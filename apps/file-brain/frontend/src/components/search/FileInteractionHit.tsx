/**
 * Enhanced Hit component with file interaction capabilities
 */
import React, { useState } from 'react';
import { Card } from 'primereact/card';
import { confirmDialog } from "primereact/confirmdialog";
import { Tooltip } from 'primereact/tooltip';
import { useInstantSearch } from 'react-instantsearch';
import { FileContextMenu } from '../modals/FileContextMenu';
import { fileOperationsService } from '../../services/fileOperations';

import { getFileName } from '../../utils/fileUtils';
interface HitType {
  file_name: string;
  file_path: string;  // Backend field name
  path?: string;      // Frontend compatibility (mapped from file_path)
  file_extension?: string;
  mime_type?: string;
  file_size?: number;
  modified_time?: number;
  content?: string;
  title?: string;
  author?: string;
  subject?: string;
  language?: string;
  keywords?: string[];
  extraction_method?: string;
}

interface FileInteractionHitProps {
  hit: HitType;
  onHover?: (path: string | null) => void;
}

export function FileInteractionHit({ hit, onHover }: FileInteractionHitProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const { refresh } = useInstantSearch();

  // Helper to get actual file path (handles both field names)
  const getFilePath = (): string | null => {
    return hit.file_path || hit.path || null;
  };

  const filePath = getFilePath();
  const isSelected = false; // Simplified - selection removed
  const snippet = hit.content || "";
  const shortSnippet = snippet.length > 260 ? `${snippet.slice(0, 260)}…` : snippet;

  // Debug logging
  console.log(`Hit component for: ${getFileName(hit.file_path)} (path: ${filePath}), selected: ${isSelected}`);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Click handling simplified - selection feature removed
  };

  const handleDoubleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!filePath) {
      return;
    }

    try {
      await fileOperationsService.openFile(filePath);
    } catch {
      // Silent failure
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleContextMenuClose = () => {
    setShowContextMenu(false);
  };

  const handleFileOperation = async (request: { file_path: string; operation: 'file' | 'folder' | 'delete' | 'forget' }) => {
    try {
      switch (request.operation) {
        case 'file':
          await fileOperationsService.openFile(request.file_path);
          break;
        case 'folder':
          await fileOperationsService.openFolder(request.file_path);
          break;
        case 'delete':
          confirmDialog({
            message: `Are you sure you want to permanently delete "${getFileName(hit.file_path)}"? This action cannot be undone.`,
            header: 'Confirm Deletion',
            icon: 'fa fa-info-circle',
            acceptClassName: 'p-button-danger',
            accept: async () => {
              try {
                await fileOperationsService.deleteFile(request.file_path);
                refresh();
              } catch {
                // Silent failure
              }
            }
          });
          return;
        case 'forget':
          confirmDialog({
            message: `Are you sure you want to remove "${getFileName(hit.file_path)}" from the search index? The file will remain on disk but won't appear in search results.`,
            header: 'Remove from Search Index',
            icon: 'fa fa-exclamation-triangle',
            acceptClassName: 'p-button-warning',
            accept: async () => {
              try {
                await fileOperationsService.forgetFile(request.file_path);
                refresh();
              } catch {
                // Silent failure
              }
            }
          });
          return;
      }
    } catch {
      // Silent failure
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover?.(filePath);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHover?.(null);
  };

  const cardStyle = {
    border: isSelected
      ? '2px solid var(--primary-color)'
      : isHovered
        ? '1px solid var(--primary-color-light)'
        : '1px solid var(--surface-border)',
    backgroundColor: isSelected
      ? 'var(--primary-color-lightest)'
      : isHovered
        ? 'var(--surface-hover)'
        : 'var(--surface-card)',
    transform: isHovered ? 'translateY(-2px)' : 'none',
    boxShadow: isHovered
      ? '0 4px 12px rgba(0,0,0,0.15)'
      : isSelected
        ? '0 2px 8px rgba(0,0,0,0.1)'
        : 'none',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    position: 'relative' as const,
    overflow: 'visible' as const // Allow selection indicator to overflow
  };

  return (
    <>
      <Card
        className="file-interaction-hit"
        style={cardStyle}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Selection indicator */}
        {isSelected && (
          <div
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-color)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              zIndex: 10,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            <i className="fas fa-check" />
          </div>
        )}

        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", height: "100%" }}>
          <div
            style={{
              fontSize: "1.75rem",
              color: "var(--primary-color)",
              flexShrink: 0,
              marginTop: "0.25rem"
            }}
          >
            <i className={pickIconClass(hit)} aria-hidden="true" />
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {/* File name and badges */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                marginBottom: "0.35rem",
                flexWrap: "wrap"
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
                  flex: 1
                }}
              >
                 <Tooltip target=".hit-filename-tooltip" position="top" />
                 <span className="hit-filename-tooltip" data-pr-tooltip={getFileName(hit.file_path)} data-private>
                    {getFileName(hit.file_path)}
                 </span>
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
                    color: "white"
                  }}
                >
                  {hit.file_extension.replace(".", "")}
                </span>
              )}
            </div>

            {/* Path display */}
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--text-color-secondary)",
                marginBottom: "0.5rem",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              <Tooltip target=".hit-path-tooltip" position="top" />
              <span className="hit-path-tooltip" data-pr-tooltip={filePath || ''} data-private>
                {filePath || 'Unknown path'}
              </span>
            </div>

            {/* Content snippet */}
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
                  WebkitBoxOrient: "vertical"
                }}
                className="private"  // Mask content snippets
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
                  marginBottom: "0.5rem"
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

            {/* Footer with file info */}
            <div
              style={{
                display: "flex",
                gap: "1.5rem",
                fontSize: "0.75rem",
                color: "var(--text-color-secondary)",
                flexWrap: "wrap",
                marginTop: "auto"
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

      {/* Context Menu */}
      <FileContextMenu
        filePath={filePath || ''}
        isOpen={showContextMenu && !!filePath}
        position={contextMenuPosition}
        onClose={handleContextMenuClose}
        onFileOperation={handleFileOperation}
      />
    </>
  );
}

// Helper functions
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
    // If timestamp is in seconds (< 10 billion), convert to milliseconds
    // Otherwise, it's already in milliseconds
    const milliseconds = ts < 10000000000 ? ts * 1000 : ts;
    return new Date(milliseconds).toLocaleString();
  } catch {
    return "—";
  }
}

function pickIconClass(hit: HitType): string {
  const ext = (hit.file_extension || "").toLowerCase();
  const mime = (hit.mime_type || "").toLowerCase();
  const fileName = (getFileName(hit.file_path) || "").toLowerCase();

  // 1. Specific Filenames
  if (fileName === "dockerfile") return "fab fa-docker";
  if (fileName === ".gitignore" || fileName === ".gitattributes") return "fab fa-git-alt";
  if (fileName === "package.json" || fileName === "package-lock.json") return "fab fa-npm";

  // 2. Code & Scripts
  if ([".py", ".pyc", ".pyd", ".pyo"].includes(ext)) return "fab fa-python";
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "fab fa-js";
  if ([".ts", ".tsx"].includes(ext)) return "fab fa-js"; // FontAwesome doesn't have a specific TS icon in free set usually, JS is close enough or use code
  if ([".java", ".jar", ".class"].includes(ext)) return "fab fa-java";
  if ([".html", ".htm", ".xhtml"].includes(ext)) return "fab fa-html5";
  if ([".css", ".scss", ".sass", ".less"].includes(ext)) return "fab fa-css3-alt";
  if ([".php", ".phtml"].includes(ext)) return "fab fa-php";
  if ([".c", ".cpp", ".h", ".hpp", ".cc"].includes(ext)) return "fas fa-code"; // No specific C++ icon in free
  if ([".go"].includes(ext)) return "fab fa-golang";
  if ([".rs"].includes(ext)) return "fab fa-rust";
  if ([".sh", ".bash", ".zsh", ".fish"].includes(ext)) return "fas fa-terminal";
  if ([".sql", ".db", ".sqlite", ".sqlite3"].includes(ext)) return "fas fa-database";
  if ([".md", ".markdown"].includes(ext)) return "fab fa-markdown";
  if ([".json", ".xml", ".yaml", ".yml", ".toml", ".ini", ".conf", ".env"].includes(ext)) return "fas fa-cogs";

  // 3. Documents
  if (ext === ".pdf" || mime.includes("pdf")) return "far fa-file-pdf";
  if ([".doc", ".docx", ".odt", ".rtf"].includes(ext)) return "far fa-file-word";
  if ([".xls", ".xlsx", ".csv", ".ods"].includes(ext)) return "far fa-file-excel";
  if ([".ppt", ".pptx", ".odp"].includes(ext)) return "far fa-file-powerpoint";
  if ([".txt", ".log"].includes(ext) || mime.startsWith("text/")) return "far fa-file-alt";

  // 4. Media
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".tiff"].includes(ext) || mime.startsWith("image/"))
    return "far fa-file-image";
  if ([".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"].includes(ext) || mime.startsWith("video/"))
    return "far fa-file-video";
  if ([".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"].includes(ext) || mime.startsWith("audio/"))
    return "far fa-file-audio";

  // 5. Archives
  if ([".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".xz"].includes(ext)) return "far fa-file-archive";

  // 6. Default
  return "far fa-file";
}