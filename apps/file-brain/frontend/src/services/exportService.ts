import * as XLSX from 'xlsx';
import { type SearchHit } from '../types/search';
import { getFileName, formatDate, formatSize } from '../utils/fileUtils';
import { saveExport } from '../api/client';

export type ExportFormat = 'csv' | 'md' | 'xlsx' | 'json' | 'txt';

export interface ExportContent {
    content: string;
    encoding: 'utf-8' | 'base64';
    defaultFilename: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

interface ExportRow {
    Name: string;
    Path: string;
    Extension: string;
    Size: string;
    Modified: string;
}

function hitsToRows(hits: SearchHit[]): ExportRow[] {
    return hits.map((hit) => ({
        Name: getFileName(hit.file_path),
        Path: hit.file_path,
        Extension: hit.file_extension?.replace('.', '').toUpperCase() ?? '',
        Size: formatSize(hit.file_size),
        Modified: formatDate(hit.modified_time),
    }));
}

// ---------------------------------------------------------------------------
// Content generators (pure – no I/O)
// ---------------------------------------------------------------------------

function generateCsvContent(hits: SearchHit[]): ExportContent {
    const headers: (keyof ExportRow)[] = ['Name', 'Path', 'Extension', 'Size', 'Modified'];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = hitsToRows(hits);
    const lines = [
        headers.join(','),
        ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ];
    return {
        content: lines.join('\r\n'),
        encoding: 'utf-8',
        defaultFilename: `file-brain-export-${buildTimestamp()}.csv`,
    };
}

function generateMarkdownContent(hits: SearchHit[]): ExportContent {
    const lines = [
        `# File Brain Export`,
        ``,
        `_Exported ${hits.length} file${hits.length !== 1 ? 's' : ''} on ${new Date().toLocaleString()}_`,
        ``,
        ...hits.map((hit) => {
            const name = getFileName(hit.file_path);
            const meta: string[] = [];
            if (hit.file_extension) meta.push(hit.file_extension.replace('.', '').toUpperCase());
            if (hit.file_size) meta.push(formatSize(hit.file_size));
            if (hit.modified_time) meta.push(formatDate(hit.modified_time));
            const metaStr = meta.length ? ` — ${meta.join(' · ')}` : '';
            return `- [${name}](file://${hit.file_path})${metaStr}`;
        }),
    ];
    return {
        content: lines.join('\n'),
        encoding: 'utf-8',
        defaultFilename: `file-brain-export-${buildTimestamp()}.md`,
    };
}

function generateXlsxContent(hits: SearchHit[]): ExportContent {
    const rows = hitsToRows(hits);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    const content = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) as string;
    return {
        content,
        encoding: 'base64',
        defaultFilename: `file-brain-export-${buildTimestamp()}.xlsx`,
    };
}

function generateJsonContent(hits: SearchHit[]): ExportContent {
    return {
        content: JSON.stringify(hitsToRows(hits), null, 2),
        encoding: 'utf-8',
        defaultFilename: `file-brain-export-${buildTimestamp()}.json`,
    };
}

function generateTextContent(hits: SearchHit[]): ExportContent {
    return {
        content: hits.map((hit) => hit.file_path).join('\n'),
        encoding: 'utf-8',
        defaultFilename: `file-brain-export-${buildTimestamp()}.txt`,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate serialised export content for the given format.
 * This is a synchronous, pure operation – no file I/O happens here.
 */
export function generateExportContent(
    hits: SearchHit[],
    format: ExportFormat,
): ExportContent {
    switch (format) {
        case 'csv':  return generateCsvContent(hits);
        case 'md':   return generateMarkdownContent(hits);
        case 'xlsx': return generateXlsxContent(hits);
        case 'json': return generateJsonContent(hits);
        case 'txt':  return generateTextContent(hits);
    }
}

/**
 * Write an already-generated export to a specific location on disk via the backend.
 * Returns the absolute path of the saved file.
 */
export async function saveExportContent(
    directory: string,
    filename: string,
    content: string,
    encoding: 'utf-8' | 'base64',
): Promise<string> {
    const { saved_path } = await saveExport({ directory, filename, content, encoding });
    return saved_path;
}
