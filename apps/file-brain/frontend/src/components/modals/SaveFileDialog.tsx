import { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import {
    getFsRoots,
    listFs,
    type FsRoot,
    type FsEntry,
} from '../../api/client';

interface SaveFileDialogProps {
    isOpen: boolean;
    defaultFilename: string;
    onClose: () => void;
    /** Called with the chosen directory and filename when the user confirms. */
    onConfirm: (directory: string, filename: string) => void;
}

export function SaveFileDialog({
    isOpen,
    defaultFilename,
    onClose,
    onConfirm,
}: SaveFileDialogProps) {
    const [roots, setRoots] = useState<FsRoot[]>([]);
    const [activeRoot, setActiveRoot] = useState<FsRoot | null>(null);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [entries, setEntries] = useState<FsEntry[]>([]);
    const [filter, setFilter] = useState<string>('');
    const [selectedPath, setSelectedPath] = useState<string>('');
    const [filename, setFilename] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [initializing, setInitializing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filteredEntries =
        filter.trim() === ''
            ? entries
            : entries.filter((e) =>
                  e.name.toLowerCase().includes(filter.toLowerCase()),
              );

    // Sync filename with defaultFilename whenever dialog opens with a new value
    useEffect(() => {
        if (isOpen) {
            setFilename(defaultFilename);
        }
    }, [isOpen, defaultFilename]);

    // Reset when closed
    useEffect(() => {
        if (!isOpen) {
            setActiveRoot(null);
            setCurrentPath('');
            setEntries([]);
            setFilter('');
            setSelectedPath('');
            setLoading(false);
            setInitializing(false);
            setError(null);
        }
    }, [isOpen]);

    // Reset filter on navigation
    useEffect(() => {
        setFilter('');
    }, [currentPath]);

    // Initialise roots when opened
    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;

        async function init() {
            setInitializing(true);
            setError(null);
            try {
                const rootsResp = await getFsRoots();
                if (cancelled) return;
                if (!rootsResp || rootsResp.length === 0) {
                    setError('No filesystem roots available.');
                    return;
                }
                setRoots(rootsResp);
                const defaultRoot =
                    rootsResp.find((r) => r.isDefault) ?? rootsResp[0];
                setActiveRoot(defaultRoot);
                setCurrentPath(defaultRoot.path);
                setSelectedPath(defaultRoot.path);
                await loadEntries(defaultRoot.path, cancelled);
            } catch {
                if (!cancelled) {
                    setError('Unable to browse filesystem.');
                }
            } finally {
                if (!cancelled) setInitializing(false);
            }
        }

        void init();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    async function loadEntries(path: string, cancelledFlag?: boolean) {
        setLoading(true);
        setError(null);
        try {
            const children = await listFs(path);
            if (cancelledFlag) return;
            setEntries(children);
        } catch {
            if (!cancelledFlag) {
                setEntries([]);
                setError(
                    'Unable to list this folder. Check permissions or choose another location.',
                );
            }
        } finally {
            if (!cancelledFlag) setLoading(false);
        }
    }

    async function handleSelectRoot(root: FsRoot) {
        setActiveRoot(root);
        setCurrentPath(root.path);
        setSelectedPath(root.path);
        await loadEntries(root.path);
    }

    async function handleEnterDirectory(entry: FsEntry) {
        const newPath = entry.path;
        setCurrentPath(newPath);
        setSelectedPath(newPath);
        await loadEntries(newPath);
    }

    // Breadcrumb helpers (same logic as FolderSelectModal)
    function getBreadcrumbSegments(path: string): string[] {
        if (!path) return [];
        if (path.includes('\\') && !path.includes('/')) {
            const parts = path.split('\\').filter((p) => p.length > 0);
            if (parts.length === 0) return [path];
            const [drive, ...rest] = parts;
            const segments = [`${drive}:`];
            let current = `${drive}:`;
            for (const seg of rest) {
                current = `${current}\\${seg}`;
                segments.push(current);
            }
            return segments;
        }
        if (path === '/') return ['/'];
        const parts = path.split('/').filter((p) => p.length > 0);
        const segments: string[] = ['/'];
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : `/${part}`;
            segments.push(current);
        }
        return segments;
    }

    function getBreadcrumbLabel(segmentPath: string, index: number): string {
        if (segmentPath === '/') return '/';
        if (index === 0 && segmentPath.endsWith(':')) return segmentPath;
        const normalized = segmentPath.replace(/\\/g, '/');
        const parts = normalized.split('/').filter((p) => p.length > 0);
        return parts[parts.length - 1] || segmentPath;
    }

    const breadcrumbSegments = getBreadcrumbSegments(currentPath);

    const canSave = selectedPath.trim() !== '' && filename.trim() !== '';

    function handleConfirm() {
        if (!canSave) return;
        onConfirm(selectedPath.trim(), filename.trim());
    }

    return (
        <Dialog
            header="Save Export As…"
            visible={isOpen}
            style={{ width: '90vw', height: '90vh' }}
            onHide={onClose}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    height: '100%',
                }}
            >
                {/* Breadcrumb */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                        fontSize: '0.9rem',
                        padding: '0.5rem',
                        backgroundColor: 'var(--surface-50)',
                        borderRadius: '6px',
                        border: '1px solid var(--surface-border)',
                    }}
                >
                    {breadcrumbSegments.length === 0 ? (
                        <span style={{ color: 'var(--text-color-secondary)' }}>
                            No location
                        </span>
                    ) : (
                        breadcrumbSegments.map((segPath, idx) => {
                            const label = getBreadcrumbLabel(segPath, idx);
                            const isLast = idx === breadcrumbSegments.length - 1;
                            return (
                                <span
                                    key={segPath}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                    }}
                                >
                                    <button
                                        type="button"
                                        disabled={isLast}
                                        onClick={() =>
                                            !isLast &&
                                            void (async () => {
                                                setCurrentPath(segPath);
                                                setSelectedPath(segPath);
                                                await loadEntries(segPath);
                                            })()
                                        }
                                        style={{
                                            border: 'none',
                                            padding: '0.25rem 0.5rem',
                                            margin: 0,
                                            background: 'none',
                                            cursor: isLast ? 'default' : 'pointer',
                                            fontSize: '0.9rem',
                                            fontWeight: isLast ? 600 : 400,
                                            color: isLast
                                                ? 'var(--primary-color)'
                                                : 'var(--text-color)',
                                            borderRadius: '4px',
                                        }}
                                    >
                                        {label}
                                    </button>
                                    {!isLast && (
                                        <i
                                            className="fas fa-chevron-right"
                                            aria-hidden="true"
                                            style={{
                                                fontSize: '0.7rem',
                                                color: 'var(--text-color-secondary)',
                                            }}
                                        />
                                    )}
                                </span>
                            );
                        })
                    )}
                </div>

                {/* Main content */}
                <div
                    style={{
                        display: 'flex',
                        gap: '1rem',
                        flex: 1,
                        overflow: 'hidden',
                    }}
                >
                    {/* Roots sidebar */}
                    <div
                        style={{
                            width: '150px',
                            borderRight: '1px solid var(--surface-border)',
                            padding: '0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            overflowY: 'auto',
                        }}
                    >
                        {initializing && (
                            <div
                                style={{
                                    fontSize: '0.9rem',
                                    color: 'var(--text-color-secondary)',
                                }}
                            >
                                Loading…
                            </div>
                        )}
                        {!initializing && roots.length === 0 && (
                            <div
                                style={{
                                    fontSize: '0.9rem',
                                    color: 'var(--text-color-secondary)',
                                }}
                            >
                                No roots available
                            </div>
                        )}
                        {roots.map((root) => {
                            const isActive = activeRoot?.path === root.path;
                            return (
                                <button
                                    key={root.path}
                                    type="button"
                                    onClick={() => void handleSelectRoot(root)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.5rem',
                                        borderRadius: '6px',
                                        border: isActive
                                            ? '2px solid var(--primary-color)'
                                            : '1px solid var(--surface-border)',
                                        backgroundColor: isActive
                                            ? 'var(--primary-color-emphasis)'
                                            : 'var(--surface-card)',
                                        color: isActive
                                            ? 'var(--primary-color)'
                                            : 'var(--text-color)',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: isActive ? 600 : 400,
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    <i
                                        className={`fas ${root.icon || 'fa-hdd'}`}
                                        aria-hidden="true"
                                        style={{ fontSize: '1rem' }}
                                    />
                                    <span
                                        style={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {root.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Folder list */}
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                            overflow: 'hidden',
                        }}
                    >
                        {error && (
                            <Message severity="error" text={error} style={{ margin: 0 }} />
                        )}

                        {/* Filter */}
                        <div
                            style={{
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <i
                                className="fas fa-filter"
                                aria-hidden="true"
                                style={{
                                    position: 'absolute',
                                    left: '0.75rem',
                                    fontSize: '0.9rem',
                                    color: 'var(--text-color-secondary)',
                                    pointerEvents: 'none',
                                }}
                            />
                            <input
                                type="text"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                placeholder="Filter folders…"
                                style={{
                                    width: '100%',
                                    padding: '0.65rem 2.5rem 0.65rem 2.5rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--surface-border)',
                                    backgroundColor: 'var(--surface-card)',
                                    color: 'var(--text-color)',
                                    fontSize: '0.85rem',
                                    outline: 'none',
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = 'var(--primary-color)';
                                    e.target.style.boxShadow =
                                        '0 0 0 2px var(--primary-color-emphasis)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'var(--surface-border)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                            {filter && (
                                <button
                                    type="button"
                                    onClick={() => setFilter('')}
                                    style={{
                                        position: 'absolute',
                                        right: '0.5rem',
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer',
                                        padding: '0.25rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '4px',
                                    }}
                                >
                                    <i
                                        className="fas fa-times"
                                        aria-hidden="true"
                                        style={{
                                            fontSize: '0.9rem',
                                            color: 'var(--text-color-secondary)',
                                        }}
                                    />
                                </button>
                            )}
                        </div>

                        {loading && (
                            <div
                                style={{
                                    fontSize: '0.9rem',
                                    color: 'var(--text-color-secondary)',
                                }}
                            >
                                Loading folders…
                            </div>
                        )}
                        {!loading && !error && entries.length === 0 && (
                            <div
                                style={{
                                    fontSize: '0.9rem',
                                    color: 'var(--text-color-secondary)',
                                }}
                            >
                                This folder has no subdirectories.
                            </div>
                        )}

                        <div
                            style={{
                                flex: 1,
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                            }}
                        >
                            {filteredEntries.map((entry) => {
                                const isSelected = selectedPath === entry.path;
                                return (
                                    <div
                                        key={entry.path}
                                        onClick={() => setSelectedPath(entry.path)}
                                        onDoubleClick={() =>
                                            void handleEnterDirectory(entry)
                                        }
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '0.95rem',
                                            backgroundColor: isSelected
                                                ? 'var(--primary-color-emphasis)'
                                                : 'var(--surface-card)',
                                            border: isSelected
                                                ? '2px solid var(--primary-color)'
                                                : '1px solid var(--surface-border)',
                                            color: isSelected
                                                ? 'var(--primary-color)'
                                                : 'var(--text-color)',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <i
                                            className="fas fa-folder"
                                            aria-hidden="true"
                                            style={{
                                                fontSize: '1.1rem',
                                                color: isSelected
                                                    ? 'var(--primary-color)'
                                                    : 'var(--blue-400)',
                                            }}
                                        />
                                        <span
                                            style={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {entry.name}
                                        </span>
                                        {entry.has_children && (
                                            <i
                                                className="fas fa-chevron-right"
                                                aria-hidden="true"
                                                style={{
                                                    marginLeft: 'auto',
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-color-secondary)',
                                                    flexShrink: 0,
                                                }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Selected directory display */}
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'row',
                                gap: '0.5rem',
                                alignItems: 'center',
                            }}
                        >
                            <div style={{ color: 'var(--text-color-secondary)', whiteSpace: 'nowrap' }}>
                                Save in
                            </div>
                            <div
                                style={{
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--surface-border)',
                                    backgroundColor: 'var(--surface-50)',
                                    color: selectedPath
                                        ? 'var(--primary-color)'
                                        : 'var(--text-color-secondary)',
                                    wordBreak: 'break-all',
                                    fontSize: '0.75rem',
                                    fontFamily: 'monospace',
                                    flex: 1,
                                }}
                            >
                                {selectedPath || 'None selected'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer — filename input + buttons */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                    }}
                >
                    {/* Filename row */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                        }}
                    >
                        <label
                            htmlFor="save-file-name"
                            style={{
                                fontSize: '0.85rem',
                                color: 'var(--text-color-secondary)',
                                whiteSpace: 'nowrap',
                                fontWeight: 500,
                            }}
                        >
                            File name
                        </label>
                        <input
                            id="save-file-name"
                            type="text"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && canSave) handleConfirm();
                            }}
                            style={{
                                flex: 1,
                                padding: '0.6rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid var(--surface-border)',
                                backgroundColor: 'var(--surface-card)',
                                color: 'var(--text-color)',
                                fontSize: '0.9rem',
                                outline: 'none',
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = 'var(--primary-color)';
                                e.target.style.boxShadow =
                                    '0 0 0 2px var(--primary-color-emphasis)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'var(--surface-border)';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>

                    {/* Action buttons */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '0.75rem',
                        }}
                    >
                        <Button
                            label="Cancel"
                            severity="danger"
                            onClick={onClose}
                            outlined
                            icon="fa-solid fa-xmark"
                        />
                        <Button
                            label="Save"
                            icon="fa-solid fa-floppy-disk"
                            onClick={handleConfirm}
                            disabled={!canSave}
                        />
                    </div>
                </div>
            </div>
        </Dialog>
    );
}
