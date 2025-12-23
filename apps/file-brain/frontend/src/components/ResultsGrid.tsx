import React, { useState } from 'react';
import { useHits, useInstantSearch } from 'react-instantsearch';
import { FileContextMenu } from './FileContextMenu';
import { fileOperationsService, type FileOperationRequest } from '../services/fileOperations';
import { confirmDialog } from 'primereact/confirmdialog';
import { pickIconClass, formatDate } from '../utils/fileUtils';

interface ResultsGridProps {
    onResultClick: (result: any) => void;
    isCrawlerActive?: boolean;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({ onResultClick, isCrawlerActive = false }) => {
    const { results } = useHits();
    const { refresh, status } = useInstantSearch();
    const isSearching = status === 'loading' || status === 'stalled';
    const [contextMenu, setContextMenu] = useState<{
        isOpen: boolean;
        position: { x: number; y: number };
        filePath: string;
        file: any;
    }>({
        isOpen: false,
        position: { x: 0, y: 0 },
        filePath: '',
        file: null
    });

    const handleContextMenu = (e: React.MouseEvent, hit: any) => {
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
                    } catch (error) {
                        console.error('Failed to delete file:', error);
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
                    } catch (error) {
                        console.error('Failed to forget file:', error);
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
                            results?.hits.map((hit: any) => {
                                const iconClass = pickIconClass(hit.file_type, hit.mime_type, hit.file_extension);
                                const extension = hit.file_extension ? hit.file_extension.replace('.', '').toUpperCase() : (hit.file_type || 'FILE');

                                return (
                                    <div key={hit.objectID} style={{ padding: '0.5rem' }}>
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
                                            onClick={() => onResultClick(hit)}
                                            onContextMenu={(e) => handleContextMenu(e, hit)}
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
                                                }} title={hit.file_name}>
                                                    {hit.file_name || 'Unknown File'}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-color-secondary)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }} title={hit.file_path}>
                                                    {hit.file_path}
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginTop: 'auto',
                                                    paddingTop: '0.5rem'
                                                }}>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        backgroundColor: 'var(--primary-50)',
                                                        color: 'var(--primary-700)',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 500
                                                    }}>
                                                        {extension}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-color-secondary)' }}>
                                                        {formatDate(hit.modified_time)}
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
