import React from 'react';
import { getFileName } from "../../utils/fileUtils";
import { Sidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import { fileOperationsService } from '../../services/fileOperations';
import { type SearchHit } from '../../types/search';
import { confirmDialog } from 'primereact/confirmdialog';
import { Tooltip } from 'primereact/tooltip';
import { formatSize, formatDate } from '../../utils/fileUtils';
import { Snippet, useInstantSearch } from 'react-instantsearch';

interface PreviewSidebarProps {
    visible: boolean;
    onHide: () => void;
    file: SearchHit | null;
}

export const PreviewSidebar: React.FC<PreviewSidebarProps> = ({ visible, onHide, file }) => {
    const { refresh } = useInstantSearch();
    const [isOpeningFile, setIsOpeningFile] = React.useState(false);
    const [isOpeningFolder, setIsOpeningFolder] = React.useState(false);
    
    if (!file) return null;

    const handleOpen = async () => {
        setIsOpeningFile(true);
        try {
            await fileOperationsService.openFile(file.file_path);
        } finally {
            setIsOpeningFile(false);
        }
    };

    const handleOpenFolder = async () => {
        setIsOpeningFolder(true);
        try {
            await fileOperationsService.openFolder(file.file_path);
        } finally {
            setIsOpeningFolder(false);
        }
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

    // Safely check for content match with type guard
    const hasContentMatch = file._snippetResult?.content &&
        'matchLevel' in file._snippetResult.content &&
        file._snippetResult.content.matchLevel !== 'none' &&
        'value' in file._snippetResult.content &&
        file._snippetResult.content.value;

    // Get other matched fields with proper type checking
    const metadataMatches = file._snippetResult
        ? Object.keys(file._snippetResult)
            .filter(key => {
                const result = file._snippetResult?.[key];
                return key !== 'content' &&
                    result &&
                    typeof result === 'object' &&
                    'matchLevel' in result &&
                    result.matchLevel !== 'none';
            })
            .map(key => {
                const result = file._snippetResult?.[key];
                return {
                    key,
                    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                    value: result && typeof result === 'object' && 'value' in result ? result.value : ''
                };
            })
        : [];

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
                    }}>
                        <Tooltip target=".preview-filename-tooltip" position="bottom" />
                        <span className="preview-filename-tooltip" data-pr-tooltip={getFileName(file.file_path)} data-private>
                            {getFileName(file.file_path)}
                        </span>
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
                                        letterSpacing: '0.5px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}>
                                        <i className="fa-solid fa-font" style={{ fontSize: '0.9rem' }} />
                                        Content Match
                                    </div>
                                    <div className="private">
                                        <Snippet hit={file as any} attribute="content" />
                                    </div>
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
                                        letterSpacing: '0.5px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}>
                                        <i className="fa-solid fa-font" style={{ fontSize: '0.9rem' }} />
                                        {match.label} Match
                                    </div>
                                    <Snippet hit={file as any} attribute={match.key} />
                                </div>
                            ))}
                        </>
                    ) : file.content ? (
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
                                letterSpacing: '0.5px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                <i className="fa-solid fa-brain" style={{ fontSize: '0.9rem' }} />
                                Semantic Match
                            </div>
                            <div style={{
                                backgroundColor: 'var(--surface-50)',
                                padding: '0.75rem',
                                borderRadius: '4px',
                                borderLeft: '3px solid var(--primary-color)'
                            }} className="private">
                                {file.content}
                            </div>
                            <div style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-color-secondary)',
                                marginTop: '0.5rem',
                                fontStyle: 'italic'
                            }}>
                                Found by AI semantic similarity (no exact keyword match)
                            </div>
                        </div>
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
                            <i className="fa-solid fa-file" style={{
                                fontSize: '3rem',
                                color: 'var(--text-color-secondary)',
                                marginBottom: '1rem',
                                opacity: 0.5
                            }} />
                            <p style={{
                                color: 'var(--text-color-secondary)',
                                fontSize: '0.9rem'
                            }}>
                                No preview available
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
                        <div style={{ color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                             <Tooltip target=".preview-path-tooltip" position="top" />
                             <span className="preview-path-tooltip" data-pr-tooltip={file.file_path} data-private>
                                {file.file_path}
                             </span>
                        </div>

                        <div style={{ color: 'var(--text-color-secondary)' }}>Size</div>
                        <div style={{ color: 'var(--text-color)' }}>{formatSize(file.file_size)}</div>

                        <div style={{ color: 'var(--text-color-secondary)' }}>Type</div>
                        <div style={{ color: 'var(--text-color)' }}>{file.mime_type || 'Unknown'}</div>

                        <div style={{ color: 'var(--text-color-secondary)' }}>Modified</div>
                        <div style={{ color: 'var(--text-color)' }}>{formatDate(file.modified_time)}</div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <Button 
                        label="Open" 
                        icon="fa-solid fa-external-link-alt" 
                        style={{ flex: 1 }} 
                        onClick={handleOpen}
                        loading={isOpeningFile}
                    />
                    <Button 
                        label="Folder" 
                        icon="fa-solid fa-folder" 
                        severity="secondary" 
                        style={{ flex: 1 }} 
                        onClick={handleOpenFolder}
                        loading={isOpeningFolder}
                    />
                    <Button 
                        icon="fa-solid fa-trash" 
                        severity="danger" 
                        aria-label="Delete" 
                        onClick={handleDelete} 
                    />
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
