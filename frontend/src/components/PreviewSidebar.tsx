import React from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import { fileOperationsService } from '../services/fileOperations';
import { confirmDialog } from 'primereact/confirmdialog';
import { formatSize, formatDate } from '../utils/fileUtils';

interface PreviewSidebarProps {
    visible: boolean;
    onHide: () => void;
    file: any;
}

export const PreviewSidebar: React.FC<PreviewSidebarProps> = ({ visible, onHide, file }) => {
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
                // TODO: Trigger search refresh
            }
        });
    };

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
                    }} title={file.file_name}>
                        {file.file_name}
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
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {/* Preview Content Placeholder */}
                    <div style={{ textAlign: 'center' }}>
                        <i className="fa-solid fa-file" style={{ fontSize: '3.75rem', color: 'var(--text-color-secondary)', marginBottom: '0.75rem' }} />
                        <p style={{ color: 'var(--text-color-secondary)' }}>Preview not available</p>
                    </div>
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
        </Sidebar>
    );
};
