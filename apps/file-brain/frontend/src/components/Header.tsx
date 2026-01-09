import React, { useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { InputSwitch } from 'primereact/inputswitch';
import { Tooltip } from 'primereact/tooltip';
import { useSearchBox } from 'react-instantsearch';

interface HeaderProps {
    isCrawlerActive: boolean;
    onToggleCrawler: (value: boolean) => void;
    isMonitoring?: boolean;
    onToggleMonitoring?: (value: boolean) => void;
    crawlerStatus?: {
        current_phase?: string;
        verification_progress?: number;
        indexing_progress?: number;
    };
    hasIndexedFiles?: boolean;
    hasFoldersConfigured?: boolean;
}

// Helper to get user-friendly phase label
function getPhaseLabel(crawlerStatus?: HeaderProps['crawlerStatus']): string {
    if (!crawlerStatus) return "Active";
    const phase = crawlerStatus.current_phase;
    switch (phase) {
        case 'verifying':
            return `Checking ${crawlerStatus.verification_progress || 0}%`;
        case 'discovering':
            return "Scanning...";
        case 'indexing':
            return `Processing ${(crawlerStatus.indexing_progress || 0).toFixed(0)}%`;
        case 'idle':
            return "Ready";
        default:
            return "Active";
    }
}

export const Header: React.FC<HeaderProps> = ({
    isCrawlerActive,
    onToggleCrawler,
    isMonitoring = false,
    onToggleMonitoring,
    crawlerStatus,
    hasIndexedFiles = true,
    hasFoldersConfigured = false
}) => {
    const { query, refine } = useSearchBox();
    const [searchValue, setSearchValue] = useState('');
    const [isTogglingCrawler, setIsTogglingCrawler] = useState(false);
    const [isTogglingMonitor, setIsTogglingMonitor] = useState(false);

    React.useEffect(() => {
        if (query === '' && searchValue !== '') {
            setSearchValue('');
        }
    }, [query]); // Only depend on query, not searchValue

    const handleSearch = () => {
        if (hasIndexedFiles) refine(searchValue);
    };

    const handleClear = () => {
        setSearchValue('');
        refine('');
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSearch();
    };

    const getPlaceholder = () => {
        if (hasIndexedFiles) return "Search your files...";
        if (hasFoldersConfigured) return "Start indexer to search";
        return "Add folders via the dashboard first";
    };



    return (
        <header className="sticky top-0 z-5 surface-card shadow-2 surface-border px-3 py-2">
            {/* Tooltips */}
            <Tooltip target=".help-auto-index" position="bottom" className="text-sm" style={{ maxWidth: '250px' }}>
                When enabled, File Brain automatically detects when files are added, modified, or deleted in your watched folders and updates the search index accordingly.
            </Tooltip>

            <div className="flex align-items-center justify-content-between gap-3">
                {/* Logo */}
                <div className="flex align-items-center gap-2 flex-shrink-0">
                    <img src="/icon.svg" alt="File Brain" className="w-2rem h-2rem" />
                    <span className="text-xl font-bold text-color hidden md:block">File Brain</span>
                </div>

                {/* Search */}
                <div style={{ flex: 1, maxWidth: '30rem', position: 'relative' }}>
                    <span style={{ position: 'relative', display: 'block' }}>
                        <i
                            className="fa-solid fa-magnifying-glass"
                            style={{
                                position: 'absolute',
                                left: '0.75rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: hasIndexedFiles ? 'var(--text-color-secondary)' : 'var(--surface-400)',
                                fontSize: '0.875rem',
                                zIndex: 1
                            }}
                        />
                        <InputText
                            value={searchValue}
                            onChange={(e) => {
                                if (hasIndexedFiles) {
                                    setSearchValue(e.target.value);
                                }
                            }}
                            onKeyPress={handleKeyPress}
                            placeholder={getPlaceholder()}
                            disabled={!hasIndexedFiles}
                            style={{
                                width: '100%',
                                paddingLeft: '2.5rem',
                                paddingRight: searchValue && hasIndexedFiles ? '5.5rem' : '3rem',
                                cursor: hasIndexedFiles ? 'text' : 'not-allowed',
                                opacity: hasIndexedFiles ? 1 : 0.6
                            }}
                            tooltip="Search (or press Enter)"
                            tooltipOptions={{
                                position: 'bottom',
                                showDelay: 500
                            }}
                        />
                        {hasIndexedFiles && (
                            <Button
                                icon="fa-solid fa-search"
                                rounded
                                onClick={handleSearch}
                                className="p-button-text"
                                aria-label="Search"
                                tooltip="Search"
                                tooltipOptions={{ position: 'bottom' }}
                                style={{
                                    position: 'absolute',
                                    right: searchValue ? '2.5rem' : '0.5rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '2rem',
                                    height: '2rem',
                                    color: 'var(--primary-color)',
                                }}
                            />
                        )}
                        {searchValue && hasIndexedFiles && (
                            <Button
                                icon="fa-solid fa-times"
                                rounded
                                onClick={handleClear}
                                className="p-button-text"
                                aria-label="Clear search"
                                tooltip="Clear search"
                                tooltipOptions={{ position: 'bottom' }}
                                style={{
                                    position: 'absolute',
                                    right: '0.25rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '2rem',
                                    height: '2rem',
                                    color: 'var(--text-color-secondary)',
                                }}
                            />
                        )}
                    </span>
                </div>

                {/* Controls */}
                <div className="flex align-items-center gap-3 flex-shrink-0">
                    {/* Auto-Index Toggle */}
                    {onToggleMonitoring && (
                        <div className="p-inputgroup">
                            <div className="p-inputgroup-addon p-2 flex align-items-center gap-2">
                            <InputSwitch
                                checked={isMonitoring}
                                onChange={
                                    async (e) => {
                                        setIsTogglingMonitor(true);
                                        try {
                                            await onToggleMonitoring(e.value);
                                        } finally {
                                            setIsTogglingMonitor(false);
                                        }
                                    }
                                }
                                disabled={isTogglingMonitor}
                                tooltip={isMonitoring ? "Auto-indexing is active" : "Enable auto-indexing"}
                                tooltipOptions={{ position: 'bottom' }}
                                />
                                {isTogglingMonitor && (
                                    <i className="fa-solid fa-spinner fa-spin" />
                                )}
                                <label className="flex align-items-center gap-2">
                                    <span className="text-sm font-medium text-color hidden lg:block">Auto-Index</span>
                                    <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help help-auto-index hidden lg:inline" />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Indexer Control */}
                    <div className="flex align-items-center gap-2">
                        <Button
                            label={isCrawlerActive ? "Stop" : "Index"}
                            icon={isTogglingCrawler ? "fas fa-spinner fa-spin" : (isCrawlerActive ? "fa-solid fa-stop" : "fa-solid fa-play")}
                            onClick={async () => {
                                setIsTogglingCrawler(true);
                                try {
                                    await onToggleCrawler(!isCrawlerActive);
                                } finally {
                                    setIsTogglingCrawler(false);
                                }
                            }}
                            disabled={isTogglingCrawler}
                            size="small"
                            severity={isCrawlerActive ? "danger" : "success"}
                            tooltip="The indexer scans your watched folders and processes file contents to make them searchable. Start it to begin indexing, or stop it to pause."
                            tooltipOptions={{ position: 'bottom', showDelay: 500 }}
                            className=""
                        />
                        <Tag
                            value={isTogglingCrawler ? "..." : (isCrawlerActive ? getPhaseLabel(crawlerStatus) : "Stopped")}
                            severity={isTogglingCrawler ? "info" : (isCrawlerActive ? "success" : "secondary")}
                            className="text-xs"
                        />
                    </div>

                </div>
            </div>
        </header>
    );
};

