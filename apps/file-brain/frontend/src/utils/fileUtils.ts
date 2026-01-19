export interface HitType {
    file_name: string;
    file_path: string;
    file_extension?: string;
    mime_type?: string;
    file_size?: number;
    modified_time?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any; // Allow dynamic fields from Typesense documents
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format timestamp to relative time (e.g., "5m ago", "2h ago")
 */
export function formatRelativeTime(timestamp: number | null | undefined): string {
    if (!timestamp) return "—";
    const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const diff = Date.now() - ms;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
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

/**
 * Returns the appropriate Font Awesome icon class for a file based on its type, extension, and name
 */
export function pickIconClass(file_type?: string, mime_type?: string, file_extension?: string): string {
    const ext = (file_extension || "").toLowerCase();
    const mime = (mime_type || "").toLowerCase();
    const type = (file_type || "").toLowerCase();

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
 * Get file icon class based on extension
 */
export function getFileIcon(ext: string | null | undefined): string {
    const e = (ext || "").toLowerCase();
    if (e === ".pdf") return "far fa-file-pdf";
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(e)) return "far fa-file-image";
    if ([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs", ".cpp", ".c", ".h"].includes(e))
        return "far fa-file-code";
    if ([".txt", ".md", ".log"].includes(e)) return "far fa-file-alt";
    if ([".mp4", ".avi", ".mov", ".mkv"].includes(e)) return "far fa-file-video";
    if ([".mp3", ".wav", ".flac", ".m4a"].includes(e)) return "far fa-file-audio";
    if ([".zip", ".tar", ".gz", ".rar", ".7z"].includes(e)) return "far fa-file-archive";
    if ([".doc", ".docx"].includes(e)) return "far fa-file-word";
    if ([".xls", ".xlsx"].includes(e)) return "far fa-file-excel";
    if ([".ppt", ".pptx"].includes(e)) return "far fa-file-powerpoint";
    return "far fa-file";
}

/**
 * Extract filename from file path
 * @param filePath - Full file path
 * @returns Just the filename (last part after /)
 */
export const getFileName = (filePath: string | null | undefined): string => {
    if (!filePath) return 'Unknown File';
    const parts = filePath.split(/[\\/]/);  // Handle both Unix and Windows paths
    return parts[parts.length - 1] || 'Unknown File';
};
