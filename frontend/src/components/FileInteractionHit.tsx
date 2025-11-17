/**
 * Enhanced Hit component with file interaction capabilities
 */
import React, { useState } from 'react';
import { Card } from 'primereact/card';
import { confirmDialog } from "primereact/confirmdialog";
import { useInstantSearch } from 'react-instantsearch';
import { FileContextMenu } from './FileContextMenu';
import { fileOperationsService } from '../services/fileOperations';
import { useFileSelection } from '../context/FileSelectionContext';
import { useNotification } from '../context/NotificationContext';

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
  const { showSuccess, showError, showInfo } = useNotification();
  const { isFileSelected, selectFile, toggleFileSelection } = useFileSelection();
  const { refresh } = useInstantSearch();

  // Helper to get actual file path (handles both field names)
  const getFilePath = (): string | null => {
    return hit.file_path || hit.path || null;
  };

  const filePath = getFilePath();
  const isSelected = filePath ? isFileSelected(filePath) : false;
  const snippet = hit.content || "";
  const shortSnippet = snippet.length > 260 ? `${snippet.slice(0, 260)}…` : snippet;

  // Debug logging
  console.log(`Hit component for: ${hit.file_name} (path: ${filePath}), selected: ${isSelected}`);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!filePath) {
      console.warn('No file path available for:', hit.file_name);
      return;
    }
    
    console.log(`Click on file: ${hit.file_name} (path: ${filePath})`);
    
    // Single click handling:
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    
    if (isCtrlOrCmd) {
      console.log('Toggling selection (Ctrl/Cmd held)');
      toggleFileSelection(filePath);
    } else {
      console.log('Selecting single file');
      selectFile(filePath);
    }
  };

  const handleDoubleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!filePath) {
      showError('Error', `Cannot open ${hit.file_name} - missing file path`);
      return;
    }
    
    try {
      const result = await fileOperationsService.openFile(filePath);
      if (result.success) {
        showSuccess('File Opened', `Successfully opened ${hit.file_name}`);
      } else {
        showError('Error', result.error || 'Failed to open file');
      }
    } catch {
      showError('Error', 'Failed to open file');
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
      let result;
      
      switch (request.operation) {
        case 'file':
          result = await fileOperationsService.openFile(request.file_path);
          break;
        case 'folder':
          result = await fileOperationsService.openFolder(request.file_path);
          break;
        case 'delete':
          // Confirm before deletion using PrimeReact ConfirmDialog
          confirmDialog({
            message: `Are you sure you want to permanently delete "${hit.file_name}"? This action cannot be undone.`,
            header: 'Confirm Deletion',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: async () => {
              try {
                // Show immediate feedback
                showInfo('Processing...', 'Deleting file from filesystem and search index');
                
                const result = await fileOperationsService.deleteFile(request.file_path);
                
                if (result.success) {
                  showSuccess('Success', 'File permanently deleted from filesystem');
                  // Optimistic update: refresh search results immediately
                  refresh();
                } else {
                  showError('Error', result.error || 'Failed to delete file');
                }
              } catch {
                showError('Error', 'Operation failed');
              }
            },
            reject: () => {
              // User cancelled - do nothing
            }
          });
          return; // Exit early since we handle the result in the accept callback
        case 'forget':
          // Confirm before removing from index using PrimeReact ConfirmDialog
          confirmDialog({
            message: `Are you sure you want to remove "${hit.file_name}" from the search index? The file will remain on disk but won't appear in search results.`,
            header: 'Remove from Search Index',
            icon: 'pi pi-info-circle',
            acceptClassName: 'p-button-warning',
            accept: async () => {
              try {
                // Show immediate feedback
                showInfo('Processing...', 'Removing file from search index');
                
                const result = await fileOperationsService.forgetFile(request.file_path);
                
                if (result.success) {
                  showSuccess('Success', 'File removed from search index');
                  // Optimistic update: refresh search results immediately
                  refresh();
                } else {
                  showError('Error', result.error || 'Failed to remove file from search index');
                }
              } catch {
                showError('Error', 'Operation failed');
              }
            },
            reject: () => {
              // User cancelled - do nothing
            }
          });
          return; // Exit early since we handle the result in the accept callback
        default:
          showError('Error', `Unknown operation: ${request.operation}`);
          return;
      }
      
      if (result && result.success) {
        let successMessage = '';
        switch (request.operation as string) {
          case 'file':
            successMessage = 'Successfully opened file';
            break;
          case 'folder':
            successMessage = 'Successfully opened folder';
            break;
          case 'delete':
            successMessage = 'File permanently deleted from filesystem';
            break;
          case 'forget':
            successMessage = 'File removed from search index';
            break;
        }
        showSuccess('Success', successMessage);
      } else if (result) {
        showError('Error', result.error || `Failed to ${request.operation} file`);
      }

    } catch {
      showError('Error', 'Operation failed');
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
              title={filePath || ''}
            >
              {filePath || 'Unknown path'}
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