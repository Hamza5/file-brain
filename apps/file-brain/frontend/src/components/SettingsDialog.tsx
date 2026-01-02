import React, { useEffect, useState, useRef } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { DataView } from 'primereact/dataview';
import { Toast } from 'primereact/toast';
import { Fieldset } from 'primereact/fieldset';
import { Message } from 'primereact/message';
import { confirmDialog } from 'primereact/confirmdialog';
import { listWatchPaths, addWatchPath, deleteWatchPath, clearIndexes, type WatchPath } from '../api/client';
import { FolderSelectModal } from './FolderSelectModal';

interface SettingsDialogProps {
    visible: boolean;
    onHide: () => void;
    onRefreshStats?: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ visible, onHide, onRefreshStats }) => {
    const [watchPaths, setWatchPaths] = useState<WatchPath[]>([]);
    const [folderPickerVisible, setFolderPickerVisible] = useState(false);
    const [includeSubdirectories, setIncludeSubdirectories] = useState(true);
    const [clearingIndexes, setClearingIndexes] = useState(false);
    const toast = useRef<Toast>(null);

    const loadWatchPaths = async () => {
        try {
            const paths = await listWatchPaths();
            setWatchPaths(paths);
        } catch (error) {
            console.error("Failed to load watch paths:", error);
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to load watch paths' });
        }
    };

    useEffect(() => {
        if (visible) {
            loadWatchPaths();
        }
    }, [visible]);

    const handleAddPath = async (path: string, includeSubdirectories: boolean) => {
        try {
            await addWatchPath(path, includeSubdirectories);
            await loadWatchPaths();
            setFolderPickerVisible(false);
            toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Watch path added' });
            // Trigger stats refresh to update empty state
            onRefreshStats?.();
        } catch (error) {
            console.error("Failed to add watch path:", error);
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to add watch path' });
        }
    };

    const handleDeletePath = async (id: number) => {
        try {
            await deleteWatchPath(id);
            await loadWatchPaths();
            toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Watch path removed' });
        } catch (error) {
            console.error("Failed to delete watch path:", error);
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to delete watch path' });
        }
    };

    const handleClearIndexes = () => {
        confirmDialog({
            message: 'Are you sure you want to clear all indexes? This will remove all indexed files from the search database. You will need to restart the crawler to re-index your files.',
            header: 'Clear All Indexes',
            icon: 'fa-solid fa-triangle-exclamation',
            acceptClassName: 'p-button-danger',
            rejectClassName: 'p-button-secondary',
            acceptIcon: 'fa-solid fa-broom',
            rejectIcon: 'fa-solid fa-times',
            accept: async () => {
                setClearingIndexes(true);
                try {
                    await clearIndexes();
                    toast.current?.show({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'All indexes cleared successfully',
                        life: 5000
                    });
                } catch (error) {
                    console.error("Failed to clear indexes:", error);
                    toast.current?.show({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to clear indexes. Please check the logs.',
                        life: 5000
                    });
                } finally {
                    setClearingIndexes(false);
                }
            }
        });
    };

    const itemTemplate = (item: WatchPath) => {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                backgroundColor: 'var(--surface-0)',
                borderRadius: '8px',
                marginBottom: '0.75rem',
                border: '1px solid var(--surface-border)',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                width: '100%'
            }}>
                {/* Folder Icon */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--primary-50)',
                    color: 'var(--primary-color)',
                    flexShrink: 0
                }}>
                    <i className="fa-solid fa-folder" style={{ fontSize: '1.25rem' }} />
                </div>

                {/* Path and Status */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    overflow: 'hidden',
                    flex: 1,
                    minWidth: 0
                }}>
                    <span style={{
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        color: 'var(--text-color)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }} title={item.path}>
                        {item.path}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.25rem 0.625rem',
                            borderRadius: '12px',
                            backgroundColor: item.enabled ? 'var(--green-100)' : 'var(--orange-100)',
                            color: item.enabled ? 'var(--green-700)' : 'var(--orange-700)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                        }}>
                            <i className={`fa-solid fa-${item.enabled ? 'check-circle' : 'pause-circle'}`} style={{ fontSize: '0.7rem' }} />
                            {item.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        {item.include_subdirectories && (
                            <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backgroundColor: 'var(--blue-100)',
                                color: 'var(--blue-700)',
                                padding: '0.25rem 0.625rem',
                                borderRadius: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                            }}>
                                <i className="fa-solid fa-sitemap" style={{ fontSize: '0.7rem' }} />
                                Recursive
                            </span>
                        )}
                    </div>
                </div>

                {/* Delete Button */}
                <Button
                    icon="fa-solid fa-trash"
                    severity="danger"
                    text
                    rounded
                    aria-label="Remove"
                    tooltip="Remove folder"
                    tooltipOptions={{ position: 'left' }}
                    onClick={() => handleDeletePath(item.id)}
                    style={{ flexShrink: 0 }}
                />
            </div>
        );
    };

    return (
        <Dialog header="Settings" visible={visible} style={{ width: '50vw' }} onHide={onHide} breakpoints={{ '960px': '75vw', '641px': '100vw' }}>
            <Toast ref={toast} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Watched Folders Section */}
                <Fieldset
                    legend={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <i className="fa-solid fa-folder-open" style={{ color: 'var(--primary-color)' }} />
                            <span>Watched Folders</span>
                        </div>
                    }
                    toggleable
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <Message 
                            severity="info" 
                            text={
                                <span>
                                    Enable the <strong>Monitor</strong> to automatically index changes in these folders.
                                </span>
                            }
                            style={{ width: '100%' }}
                        />
                        
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{ color: 'var(--text-color-secondary)', margin: 0 }}>
                                Manage the directories that File Brain indexes.
                            </p>
                            <Button
                                label="Add Folder"
                                icon="fa-solid fa-plus"
                                size="small"
                                onClick={() => setFolderPickerVisible(true)}
                            />
                        </div>

                        <DataView
                            value={watchPaths}
                            itemTemplate={itemTemplate}
                            layout="list"
                            emptyMessage="No folders watched yet."
                        />
                    </div>
                </Fieldset>

                {/* Index Management Section */}
                <Fieldset
                    legend={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <i className="fa-solid fa-database" style={{ color: 'var(--primary-color)' }} />
                            <span>Index Management</span>
                        </div>
                    }
                    toggleable
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <p style={{ color: 'var(--text-color-secondary)', margin: 0 }}>
                            Clear all indexed files from the search database.
                        </p>
                        <div>
                            <Button
                                label="Clear All Indexes"
                                icon="fa-solid fa-broom"
                                severity="danger"
                                loading={clearingIndexes}
                                onClick={handleClearIndexes}
                            />
                        </div>
                    </div>
                </Fieldset>
            </div>

            <FolderSelectModal
                isOpen={folderPickerVisible}
                onClose={() => setFolderPickerVisible(false)}
                onConfirm={handleAddPath}
                includeSubdirectories={includeSubdirectories}
                onIncludeSubdirectoriesChange={setIncludeSubdirectories}
            />
        </Dialog>
    );
};
