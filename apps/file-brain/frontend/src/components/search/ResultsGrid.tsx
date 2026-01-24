import React, { useState, useEffect } from 'react';
import { useHits, useInstantSearch, useSearchBox } from 'react-instantsearch';
import { FileContextMenu } from '../modals/FileContextMenu';
import { fileOperationsService, type FileOperationRequest } from '../../services/fileOperations';
import { type SearchHit } from '../../types/search';
import { confirmDialog } from 'primereact/confirmdialog';
import { Tooltip } from 'primereact/tooltip';
import { pickIconClass, formatDate, getFileName } from '../../utils/fileUtils';
import { usePostHog } from '../../context/PostHogProvider';

interface ResultsGridProps {
    onResultClick: (result: SearchHit) => void;
    isCrawlerActive?: boolean;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({ onResultClick, isCrawlerActive = false }) => {
    const { results } = useHits();
    const { refresh, status } = useInstantSearch();
    const { query } = useSearchBox();
    const posthog = usePostHog();
    const isSearching = status === 'loading' || status === 'stalled';
    const [contextMenu, setContextMenu] = useState<{
        isOpen: boolean;
        position: { x: number; y: number };
        filePath: string;
        file: SearchHit | null;
    }>({
        isOpen: false,
        position: { x: 0, y: 0 },
        filePath: '',
        file: null
    });

    const searchStartTimeRef = React.useRef<number | null>(null);

    // Track when a search starts to measure latency
    useEffect(() => {
        if (isSearching && !searchStartTimeRef.current) {
            searchStartTimeRef.current = performance.now();
        }
    }, [isSearching]);

    // Track search events when results change
    useEffect(() => {
        if (results && query && posthog && !isSearching) {
            const latency = searchStartTimeRef.current 
                ? performance.now() - searchStartTimeRef.current 
                : null;

            posthog.capture('search_performed', {
                query_length: query.length,
                result_count: results.hits.length,
                has_results: results.hits.length > 0,
                page: results.page,
                search_latency_ms: latency ? Math.round(latency) : undefined
            });

            // Reset start time for next search
            searchStartTimeRef.current = null;
        }
    }, [results, query, posthog, isSearching]);

    const handleContextMenu = (e: React.MouseEvent, hit: SearchHit) => {
        e.preventDefault();
        setContextMenu({
            isOpen: true,
            position: { x: e.clientX, y: e.clientY },
            filePath: hit.file_path,
            file: hit
        });
    };

    const handleFileOperation = async (request: FileOperationRequest) => {
        if (request.operation === 'delete') {
            confirmDialog({
                message: 'Are you sure you want to delete this file?',
                header: 'Confirm Delete',
                icon: 'fa fa-circle-exclamation',
                acceptClassName: 'p-button-danger',
                rejectClassName: 'p-button-secondary',
                acceptIcon: 'fa fa-trash',
                rejectIcon: 'fa fa-times',
                accept: async () => {
                    try {
                        await fileOperationsService.deleteFile(request.file_path);
                        // Refresh search results after successful deletion
                        refresh();
                    } catch {
                        // Failed to delete file - silent failure
                    }
                }
            });
        } else if (request.operation === 'forget') {
            confirmDialog({
                message: 'Are you sure you want to remove this file from the search index? The file will remain on disk but won\'t appear in search results.',
                header: 'Remove from Search Index',
                icon: 'fa fa-triangle-exclamation',
                acceptClassName: 'p-button-warning',
                rejectClassName: 'p-button-secondary',
                acceptIcon: 'fa fa-broom',
                rejectIcon: 'fa fa-times',
                accept: async () => {
                    try {
                        await fileOperationsService.forgetFile(request.file_path);
                        // Refresh search results after successful forget
                        refresh();
                    } catch {
                        // Failed to forget file - silent failure
                    }
                }
            });
        } else if (request.operation === 'file') {
            await fileOperationsService.openFile(request.file_path);
        } else if (request.operation === 'folder') {
            await fileOperationsService.openFolder(request.file_path);
        }
    };

    if (results?.nbHits === 0) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem 2rem',
                textAlign: 'center'
            }}>
                <i className="fa-regular fa-folder-open" style={{
                    fontSize: '4rem',
                    color: 'var(--text-color-secondary)',
                    marginBottom: '1.5rem',
                    opacity: 0.6
                }} />
                <h3 style={{
                    fontSize: '1.5rem',
                    color: 'var(--text-color)',
                    marginBottom: '0.5rem',
                    fontWeight: 600
                }}>No results found</h3>
                <p style={{
                    color: 'var(--text-color-secondary)',
                    fontSize: '1rem',
                    maxWidth: '400px'
                }}>
                    {isCrawlerActive
                        ? 'No matches yet. The crawler is indexing files.'
                        : 'Try adjusting your search terms or start the crawler to index more files.'}
                </p>
            </div>
        );
    }

    const totalResults = results?.nbHits || 0;

    return (
        <>
            {/* Loading Indicator */}
            {isSearching && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                    gap: '0.75rem'
                }}>
                    <i className="fa fa-spinner fa-spin" style={{
                        fontSize: '1.5rem',
                        color: 'var(--primary-color)'
                    }} />
                    <span style={{
                        fontSize: '1rem',
                        color: 'var(--text-color-secondary)',
                        fontWeight: 500
                    }}>
                        Searching...
                    </span>
                </div>
            )}

            <Tooltip target=".grid-tooltip" />

            {/* Result Count Header */}
            {
                !isSearching && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '1rem',
                        padding: '0.75rem 0.5rem',
                        borderBottom: '1px solid var(--surface-border)'
                    }}>
                        <div style={{
                            fontSize: '0.95rem',
                            color: 'var(--text-color-secondary)',
                            fontWeight: 500
                        }}>
                            {totalResults.toLocaleString()} {totalResults === 1 ? 'result' : 'results'} found
                        </div>
                    </div>
                )
            }

            {/* Results Grid */}
            {
                !isSearching && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '0.75rem'
                    }}>
                        {
                            results?.hits.map((hit) => {
                                const searchHit = hit as SearchHit;
                                const iconClass = pickIconClass(undefined, searchHit.mime_type, searchHit.file_extension);
                                const extension = searchHit.file_extension ? searchHit.file_extension.replace('.', '').toUpperCase() : 'FILE';

                                return (
                                    <div key={searchHit.objectID} style={{ padding: '0.5rem' }}>
                                        <div
                                            style={{
                                                backgroundColor: 'var(--surface-card)',
                                                border: '1px solid var(--surface-border)',
                                                borderRadius: '12px',
                                                padding: '0.75rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.75rem',
                                                height: '100%',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                                            }}
                                            onClick={() => {
                                                // Track search result click
                                                if (posthog && query) {
                                                    const hitIndex = results?.hits.findIndex(h => (h as SearchHit).objectID === searchHit.objectID) || 0;
                                                    posthog.capture('search_result_clicked', {
                                                        hit_position: hitIndex,
                                                        query_length: query.length,
                                                    });
                                                }
                                                onResultClick(searchHit);
                                            }}
                                            onContextMenu={(e) => handleContextMenu(e, searchHit)}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.12)';
                                                e.currentTarget.style.transform = 'translateY(-4px)';
                                                e.currentTarget.style.borderColor = 'var(--primary-color)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.borderColor = 'var(--surface-border)';
                                            }}
                                        >
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: 'var(--surface-50)',
                                                borderRadius: '8px',
                                                height: '140px'
                                            }}>
                                                <i className={iconClass} style={{ fontSize: '3rem', color: 'var(--primary-color)' }} />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <div style={{
                                                    fontWeight: 600,
                                                    color: 'var(--text-color)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}
                                                className="grid-tooltip"
                                                data-pr-tooltip={getFileName(searchHit.file_path)}
                                                data-private  // Mask file name in session recordings
                                                >
                                                    {getFileName(searchHit.file_path)}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-color-secondary)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}
                                                className="grid-tooltip"
                                                data-pr-tooltip={searchHit.file_path}
                                                data-private  // Mask file path in session recordings
                                                >
                                                    {searchHit.file_path}
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    flexWrap: 'wrap',
                                                    marginTop: 'auto',
                                                    paddingTop: '0.5rem'
                                                }}>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        backgroundColor: 'var(--primary-reverse)',
                                                        color: 'var(--primary-color)',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 500,
                                                        flexShrink: 0
                                                    }}>
                                                        {extension}
                                                    </span>
                                                    <span style={{ 
                                                        fontSize: '0.75rem', 
                                                        color: 'var(--text-color-secondary)',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {formatDate(searchHit.modified_time)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        }
                    </div >
                )
            }

            <FileContextMenu
                isOpen={contextMenu.isOpen}
                position={contextMenu.position}
                filePath={contextMenu.filePath}
                onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
                onFileOperation={handleFileOperation}
            />
        </>
    );
};
