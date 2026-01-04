export interface HitType {
    file_name: string;
    file_path: string;
    file_extension?: string;
    mime_type?: string;
    file_size?: number;
    modified_time?: number;
    [key: string]: any;
}

export function formatSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDate(ts?: number): string {
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

export function pickIconClass(fileType?: string, mimeType?: string, extension?: string): string {
    const ext = (extension || "").toLowerCase();
    const mime = (mimeType || "").toLowerCase();
    const type = (fileType || "").toLowerCase();

    if (ext === ".pdf" || mime.includes("pdf") || type.includes("pdf")) return "far fa-file-pdf";
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext) || mime.startsWith("image/") || type.includes("image"))
        return "far fa-file-image";
    if (
        [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs"].includes(ext) ||
        type.includes("code")
    )
        return "far fa-file-code";
    if (mime.startsWith("text/") || type.includes("text")) return "far fa-file-alt";
    if (mime.startsWith("video/") || type.includes("video")) return "far fa-file-video";
    if (mime.startsWith("audio/") || type.includes("audio")) return "far fa-file-audio";

    return "far fa-file";
}

/**
 * Extract filename from file path
 * @param filePath - Full file path
 * @returns Just the filename (last part after /)
 */
export const getFileName = (filePath: string): string => {
  if (!filePath) return 'Unknown File';
  const parts = filePath.split('/');
  return parts[parts.length - 1] || 'Unknown File';
};
