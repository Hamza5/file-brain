import React, { useEffect, useState, useRef } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { DataView } from 'primereact/dataview';
import { Toast } from 'primereact/toast';
import { Fieldset } from 'primereact/fieldset';
import { Message } from 'primereact/message';
import { InputSwitch } from 'primereact/inputswitch';
import { confirmDialog } from 'primereact/confirmdialog';
import { listWatchPaths, addWatchPath, deleteWatchPath, updateWatchPath, clearIndexes, resetWizard, type WatchPath } from '../api/client';
import { FolderSelectModal } from './FolderSelectModal';

interface SettingsDialogProps {
    visible: boolean;
    onHide: () => void;
    onRefreshStats?: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ visible, onHide, onRefreshStats }) => {
    const [watchPaths, setWatchPaths] = useState<WatchPath[]>([]);
    const [folderPickerVisible, setFolderPickerVisible] = useState(false);
    const [isAddingExcluded, setIsAddingExcluded] = useState(false);
    const [clearingIndexes, setClearingIndexes] = useState(false);
    const [resettingWizard, setResettingWizard] = useState(false);
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

    const handleAddPath = async (path: string, includeSubdirectories: boolean, isExcluded: boolean) => {
        try {
            await addWatchPath(path, includeSubdirectories, isExcluded);
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

    const handleResetWizard = () => {
        confirmDialog({
            message: 'Are you sure you want to restart the configuration wizard? This will reset your setup progress, but your data and indexes will be preserved unless you choose to clear them separately.',
            header: 'Restart Configuration Wizard',
            icon: 'fa-solid fa-redo',
            acceptClassName: 'p-button-warning',
            rejectClassName: 'p-button-secondary',
            acceptIcon: 'fa-solid fa-check',
            rejectIcon: 'fa-solid fa-times',
            accept: async () => {
                setResettingWizard(true);
                try {
                    await resetWizard();
                    toast.current?.show({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Wizard reset successfully. Reloading...',
                        life: 2000
                    });
                    // Reload page to start wizard
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } catch (error) {
                    console.error("Failed to reset wizard:", error);
                    toast.current?.show({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to reset wizard.',
                        life: 5000
                    });
                    setResettingWizard(false);
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
                    width: '50px',
                    height: '50px',
                    borderRadius: '8px',
                    backgroundColor: item.is_excluded ? 'var(--red-50)' : 'var(--primary-50)',
                    color: item.is_excluded ? 'var(--red-500)' : 'var(--primary-color)',
                    flexShrink: 0
                }}>
                    <i className={`fa-solid ${item.is_excluded ? 'fa-folder-minus' : 'fa-folder-plus'}`} style={{ fontSize: '1.5rem' }} />
                </div>

                {/* Path and Status */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {/* Enable/Disable Switch */}
                            <InputSwitch
                                checked={item.enabled}
                                onChange={async (e) => {
                                    try {
                                        await updateWatchPath(item.id, { enabled: e.value });
                                        // Specific to Primereact InputSwitch onChange event value
                                        await loadWatchPaths();
                                    } catch (error) {
                                        console.error("Failed to update watch path:", error);
                                        toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to update watch path status' });
                                    }
                                }}
                            />

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
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Dialog header="Settings" visible={visible} style={{ width: '50vw' }} onHide={onHide} breakpoints={{ '960px': '75vw', '641px': '100vw' }} maximizable>
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
                        
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span className="p-text-secondary" style={{ fontSize: '0.9rem' }}>
                        Manage the directories that File Brain indexes.
                    </span>
                    <div className="flex gap-2">
                         <Button
                            label="Add Folder"
                            icon="fa-solid fa-plus"
                            onClick={() => {
                                setIsAddingExcluded(false);
                                setFolderPickerVisible(true);
                            }}
                            className="p-button-sm"
                        />
                         <Button
                            label="Add Excluded"
                            icon="fa-solid fa-ban"
                            onClick={() => {
                                setIsAddingExcluded(true);
                                setFolderPickerVisible(true);
                            }}
                            className="p-button-sm p-button-danger p-button-outlined"
                        />
                    </div>
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

                {/* System Reset Section */}
                 <Fieldset
                    legend={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <i className="fa-solid fa-power-off" style={{ color: 'var(--primary-color)' }} />
                            <span>System Reset</span>
                        </div>
                    }
                    toggleable
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="flex align-items-center justify-content-between">
                            <div>
                                <h4 className="m-0 mb-1">Restart Wizard</h4>
                                <p style={{ color: 'var(--text-color-secondary)', margin: 0, fontSize: '0.9rem' }}>
                                    Reset the setup wizard to re-configure Docker services and collections.
                                </p>
                            </div>
                            <Button
                                label="Restart Wizard"
                                icon="fa-solid fa-redo"
                                severity="warning"
                                outlined
                                loading={resettingWizard}
                                onClick={handleResetWizard}
                            />
                        </div>
                    </div>
                </Fieldset>
            </div>

            <FolderSelectModal
                isOpen={folderPickerVisible}
                onClose={() => setFolderPickerVisible(false)}
                onConfirm={(path, includeSubdirectories) => handleAddPath(path, includeSubdirectories, isAddingExcluded)}
                includeSubdirectories={true}
                onIncludeSubdirectoriesChange={() => { }}
                isExcludedMode={isAddingExcluded}
            />
        </Dialog>
    );
};
