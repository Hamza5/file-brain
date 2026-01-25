import React, { useEffect, useRef, useState } from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { confirmDialog } from 'primereact/confirmdialog';
import { InputSwitch } from 'primereact/inputswitch';
import { Tag } from 'primereact/tag';
import { clearIndexes, resetWizard, getOcrStatus, updateSetting } from '../../api/client';
import type { OcrStatus } from '../../api/client';

interface IndexManagementSidebarProps {
    visible: boolean;
    onHide: () => void;
}

export const IndexManagementSidebar: React.FC<IndexManagementSidebarProps> = ({ visible, onHide }) => {
    const [clearingIndexes, setClearingIndexes] = useState(false);
    const [resettingWizard, setResettingWizard] = useState(false);
    const [ocrStatus, setOcrStatus] = useState<OcrStatus | null>(null);
    const [ocrLoading, setOcrLoading] = useState(false);
    const toast = useRef<Toast>(null);

    // Load OCR status when sidebar opens
    useEffect(() => {
        if (visible) {
            loadOcrStatus();
        }
    }, [visible]);

    const loadOcrStatus = async () => {
        try {
            const status = await getOcrStatus();
            setOcrStatus(status);
        } catch {
            // OCR status endpoint might not exist on older versions
            setOcrStatus(null);
        }
    };

    const handleOcrToggle = async (enabled: boolean) => {
        if (!ocrStatus) return;
        setOcrLoading(true);
        try {
            await updateSetting(ocrStatus.setting_key, enabled ? 'true' : 'false');
            setOcrStatus({ ...ocrStatus, enabled });
            toast.current?.show({
                severity: 'success',
                summary: 'Success',
                detail: `PDF OCR processing ${enabled ? 'enabled' : 'disabled'}`,
                life: 3000
            });
        } catch {
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to update OCR setting',
                life: 5000
            });
        } finally {
            setOcrLoading(false);
        }
    };

    const handleClearIndexes = () => {
        confirmDialog({
            message: 'Are you sure you want to remove all indexed files? This action cannot be undone, and you will need to re-index your files to search them again.',
            header: 'Reset Search Data',
            icon: 'fa-solid fa-triangle-exclamation',
            acceptLabel: 'Clear Data',
            rejectLabel: 'Cancel',
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
                        detail: 'All search data cleared successfully',
                        life: 5000
                    });
                     // Close sidebar after successful action? Optional.
                } catch {
                    toast.current?.show({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to clear search data.',
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
            message: 'Are you sure you want to run the setup wizard again? This allows you to change your initial configuration. Your existing data will be preserved unless you choose to clear it.',
            header: 'Reconfigure System',
            icon: 'fa-solid fa-redo',
            acceptLabel: 'Resetup Wizard',
            rejectLabel: 'Cancel',
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
                        detail: 'System reset successfully. Reloading...',
                        life: 2000
                    });
                    // Reload page to start wizard
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } catch {
                    toast.current?.show({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to reset system configuration.',
                        life: 5000
                    });
                    setResettingWizard(false);
                }
            }
        });
    };

    return (
        <Sidebar
            visible={visible}
            onHide={onHide}
            position="bottom"
            style={{ height: 'auto', minHeight: '300px' }}
            header={
                <div className="flex align-items-center gap-2">
                    <i className="fa-solid fa-database text-primary text-xl" />
                    <span className="font-bold text-xl">Index Management</span>
                </div>
            }
        >
            <Toast ref={toast} />
            <div className="grid">
                {/* PDF OCR Card */}
                <div className="col-12 md:col-4">
                    <div className="surface-card p-4 border-round-xl border-1 surface-border hover:shadow-2 transition-duration-200 h-full flex flex-column justify-content-between">
                        <div>
                            <div className="flex align-items-center gap-2 mb-2">
                                <div className="bg-blue-50 text-blue-500 border-round w-2rem h-2rem flex align-items-center justify-content-center">
                                    <i className="fa-solid fa-file-pdf" />
                                </div>
                                <span className="text-lg font-semibold text-900">PDF OCR</span>
                                {ocrStatus?.available ? (
                                    <Tag severity="success" value={ocrStatus.version || 'Available'} className="text-xs" />
                                ) : ocrStatus ? (
                                    <Tag severity="danger" value="Not Installed" className="text-xs" />
                                ) : null}
                            </div>
                            <p className="text-secondary m-0 mb-3 line-height-3">
                                Add searchable text layers to scanned PDFs using OCRmyPDF. Requires ocrmypdf to be installed on the system.
                            </p>
                            {ocrStatus && !ocrStatus.available && ocrStatus.error && (
                                <p className="text-orange-500 text-sm m-0 mb-3">
                                    <i className="fa-solid fa-circle-info mr-1" />
                                    {ocrStatus.error}
                                </p>
                            )}
                        </div>
                        <div className="flex align-items-center justify-content-between pt-2 border-top-1 surface-border">
                            <span className="text-sm font-medium">Enable OCR Processing</span>
                            <InputSwitch
                                checked={ocrStatus?.enabled ?? false}
                                onChange={(e) => handleOcrToggle(e.value)}
                                disabled={!ocrStatus?.available || ocrLoading}
                            />
                        </div>
                    </div>
                </div>

                {/* Reset Search Data Card */}
                <div className="col-12 md:col-4">
                    <div className="surface-card p-4 border-round-xl border-1 surface-border hover:shadow-2 transition-duration-200 h-full flex flex-column justify-content-between">
                        <div>
                            <div className="flex align-items-center gap-2 mb-2">
                                <div className="bg-red-50 text-red-500 border-round w-2rem h-2rem flex align-items-center justify-content-center">
                                    <i className="fa-solid fa-broom" />
                                </div>
                                <span className="text-lg font-semibold text-900">Reset Search Data</span>
                            </div>
                            <p className="text-secondary m-0 mb-4 line-height-3">
                                Remove all indexed files from the system. This allows you to start fresh if your search results are outdated or incorrect.
                            </p>
                        </div>
                        <Button
                            label="Clear Data"
                            icon="fa-solid fa-broom"
                            severity="danger"
                            loading={clearingIndexes}
                            onClick={handleClearIndexes}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Reconfigure System Card */}
                <div className="col-12 md:col-4">
                    <div className="surface-card p-4 border-round-xl border-1 surface-border hover:shadow-2 transition-duration-200 h-full flex flex-column justify-content-between">
                        <div>
                            <div className="flex align-items-center gap-2 mb-2">
                                <div className="bg-orange-50 text-orange-500 border-round w-2rem h-2rem flex align-items-center justify-content-center">
                                    <i className="fa-solid fa-sliders" />
                                </div>
                                <span className="text-lg font-semibold text-900">Reconfigure System</span>
                            </div>
                            <p className="text-secondary m-0 mb-4 line-height-3">
                                Run the setup wizard again to change your initial configuration, such as re-connecting Docker services or resetting preferences.
                            </p>
                        </div>
                        <Button
                            label="Resetup Wizard"
                            icon="fa-solid fa-redo"
                            severity="warning"
                            outlined
                            loading={resettingWizard}
                            onClick={handleResetWizard}
                            className="w-full"
                        />
                    </div>
                </div>
            </div>
        </Sidebar>
    );
};
