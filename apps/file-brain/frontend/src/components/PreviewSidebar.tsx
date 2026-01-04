import React from 'react';
import { getFileName } from "../utils/fileUtils";
import { Sidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import { fileOperationsService } from '../services/fileOperations';
import { confirmDialog } from 'primereact/confirmdialog';
import { formatSize, formatDate } from '../utils/fileUtils';
import { Snippet, useInstantSearch } from 'react-instantsearch';

interface PreviewSidebarProps {
    visible: boolean;
    onHide: () => void;
    file: any;
}

export const PreviewSidebar: React.FC<PreviewSidebarProps> = ({ visible, onHide, file }) => {
    const { refresh } = useInstantSearch();
    if (!file) return null;

    const handleOpen = async () => {
        await fileOperationsService.openFile(file.file_path);
    };

    const handleOpenFolder = async () => {
        await fileOperationsService.openFolder(file.file_path);
    };

    const handleDelete = () => {
        confirmDialog({
            message: 'Are you sure you want to delete this file?',
            header: 'Confirm Delete',
            icon: 'fa fa-exclamation-triangle',
            accept: async () => {
                await fileOperationsService.deleteFile(file.file_path);
                onHide();
                refresh();
            }
        });
    };

    // Check specifically for content match
    const hasContentMatch = file._snippetResult?.content?.matchLevel !== 'none' && file._snippetResult?.content?.value;

    // Get all other matches (excluding content)
    const getMetadataMatches = () => {
        if (!file._snippetResult) return [];

        return Object.keys(file._snippetResult)
            .filter(key => key !== 'content' && file._snippetResult[key].matchLevel !== 'none')
            .map(key => ({
                key,
                label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                value: file._snippetResult[key].value
            }));
    };

    const metadataMatches = getMetadataMatches();
    const hasAnyMatch = hasContentMatch || metadataMatches.length > 0;

    return (
        <Sidebar visible={visible} onHide={onHide} position="right" style={{ width: '100%', maxWidth: '40rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: '1.25rem',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }} title={getFileName(file.file_path)}>
                        {getFileName(file.file_path)}
                    </h2>
                </div>

                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    marginBottom: '1rem',
                    backgroundColor: 'var(--surface-100)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    {hasAnyMatch ? (
                        <>
                            {hasContentMatch && (
                                <div className="search-snippet" style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.9rem',
                                    lineHeight: '1.5',
                                    color: 'var(--text-color)',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                }}>
                                    <div style={{
                                        fontWeight: 600,
                                        marginBottom: '0.5rem',
                                        color: 'var(--primary-color)',
                                        fontSize: '0.8rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        Content Match
                                    </div>
                                    <Snippet hit={file} attribute="content" />
                                </div>
                            )}

                            {metadataMatches.map(match => (
                                <div key={match.key} className="search-snippet" style={{
                                    fontSize: '0.9rem',
                                    lineHeight: '1.5',
                                    color: 'var(--text-color)',
                                    wordBreak: 'break-word'
                                }}>
                                    <div style={{
                                        fontWeight: 600,
                                        marginBottom: '0.25rem',
                                        color: 'var(--primary-color)',
                                        fontSize: '0.8rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        {match.label} Match
                                    </div>
                                    <Snippet hit={file} attribute={match.key} />
                                </div>
                            ))}
                        </>
                    ) : (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            textAlign: 'center',
                            padding: '2rem'
                        }}>
                            <i className="fa-solid fa-brain" style={{
                                fontSize: '3rem',
                                color: 'var(--primary-color)',
                                marginBottom: '1rem',
                                opacity: 0.8
                            }} />
                            <h3 style={{
                                fontSize: '1.1rem',
                                fontWeight: 600,
                                marginBottom: '0.5rem',
                                color: 'var(--text-color)'
                            }}>
                                Semantic Match
                            </h3>
                            <p style={{
                                color: 'var(--text-color-secondary)',
                                fontSize: '0.9rem',
                                lineHeight: '1.5'
                            }}>
                                This file was found because its meaning is related to your search, even though it doesn't contain the exact keywords.
                            </p>
                        </div>
                    )}
                </div>

                <div style={{
                    backgroundColor: 'var(--surface-card)',
                    border: '1px solid var(--surface-border)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    marginBottom: '1rem'
                }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Properties</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem', rowGap: '0.75rem' }}>
                        <div style={{ color: 'var(--text-color-secondary)' }}>Path</div>
                        <div style={{ color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.file_path}>
                            {file.file_path}
                        </div>

                        <div style={{ color: 'var(--text-color-secondary)' }}>Size</div>
                        <div style={{ color: 'var(--text-color)' }}>{formatSize(file.file_size)}</div>

                        <div style={{ color: 'var(--text-color-secondary)' }}>Type</div>
                        <div style={{ color: 'var(--text-color)' }}>{file.mime_type || file.file_type || 'Unknown'}</div>

                        <div style={{ color: 'var(--text-color-secondary)' }}>Modified</div>
                        <div style={{ color: 'var(--text-color)' }}>{formatDate(file.modified_time)}</div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <Button label="Open" icon="fa-solid fa-external-link-alt" style={{ flex: 1 }} onClick={handleOpen} />
                    <Button label="Folder" icon="fa-solid fa-folder" severity="secondary" style={{ flex: 1 }} onClick={handleOpenFolder} />
                    <Button icon="fa-solid fa-trash" severity="danger" aria-label="Delete" onClick={handleDelete} />
                </div>
            </div>
            <style>{`
                .search-snippet mark {
                    background-color: var(--primary-200);
                    color: var(--primary-900);
                    padding: 0 2px;
                    border-radius: 2px;
                    font-weight: 600;
                }
            `}</style>
        </Sidebar>
    );
};
