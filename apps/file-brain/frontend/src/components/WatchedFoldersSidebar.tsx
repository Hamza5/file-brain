import React, { useEffect, useRef, useState } from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import { DataView } from 'primereact/dataview';
import { Toast } from 'primereact/toast';
import { Message } from 'primereact/message';
import { InputSwitch } from 'primereact/inputswitch';
import { Tooltip } from 'primereact/tooltip';
import { listWatchPaths, addWatchPath, deleteWatchPath, updateWatchPath, type WatchPath } from '../api/client';
import { FolderSelectModal } from './FolderSelectModal';

interface WatchedFoldersSidebarProps {
    visible: boolean;
    onHide: () => void;
    onRefreshStats?: () => void;
}

export const WatchedFoldersSidebar: React.FC<WatchedFoldersSidebarProps> = ({ visible, onHide, onRefreshStats }) => {
    const [watchPaths, setWatchPaths] = useState<WatchPath[]>([]);
    const [folderPickerVisible, setFolderPickerVisible] = useState(false);
    const [isAddingExcluded, setIsAddingExcluded] = useState(false);
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
            onRefreshStats?.();
        } catch (error) {
            console.error("Failed to delete watch path:", error);
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to delete watch path' });
        }
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
                        whiteSpace: 'nowrap',
                        display: 'block'
                    }}>
                        <Tooltip target={`#path-${item.id}`} position="top" />
                        <span id={`path-${item.id}`} data-pr-tooltip={item.path}>
                            {item.path}
                        </span>
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
        <Sidebar
            visible={visible}
            onHide={onHide}
            position="bottom"
            style={{ height: 'auto', minHeight: '500px', maxHeight: '90vh' }}
            header={
                <div className="flex align-items-center gap-2">
                    <i className="fa-solid fa-folder-open text-primary text-xl" />
                    <span className="font-bold text-xl">Manage Watched Folders</span>
                    <span className="text-sm text-color-secondary ml-2">{watchPaths.length} locations</span>
                </div>
            }
        >
            <Toast ref={toast} />
            <div className="flex flex-column h-full">
                <div className="flex flex-column gap-3 mb-4">
                    <div className="flex justify-content-between align-items-center">
                        <span className="text-color-secondary text-sm">
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
                        emptyMessage="No folders to index yet."
                    />
                </div>
            </div>

            <FolderSelectModal
                isOpen={folderPickerVisible}
                onClose={() => setFolderPickerVisible(false)}
                onConfirm={(path, includeSubdirectories) => handleAddPath(path, includeSubdirectories, isAddingExcluded)}
                includeSubdirectories={true}
                onIncludeSubdirectoriesChange={() => { }}
                isExcludedMode={isAddingExcluded}
            />
        </Sidebar>
    );
};
