import React, { useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { InputSwitch } from 'primereact/inputswitch';
import { useSearchBox } from 'react-instantsearch';

interface HeaderProps {
    onSettingsClick: () => void;
    isCrawlerActive: boolean;
    onToggleCrawler: (value: boolean) => void;
    isMonitoring?: boolean;
    onToggleMonitoring?: (value: boolean) => void;
    crawlerStatus?: any;
    hasIndexedFiles?: boolean;
    hasFoldersConfigured?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
    onSettingsClick,
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

    // Sync local state with instant search query when it changes externally
    React.useEffect(() => {
        if (query !== searchValue && query === '') {
            setSearchValue('');
        }
    }, [query]);

    const handleSearch = () => {
        if (hasIndexedFiles) {
            refine(searchValue);
        }
    };

    const handleClear = () => {
        setSearchValue('');
        refine('');
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    // Determine the appropriate message based on state
    const getPlaceholder = () => {
        if (hasIndexedFiles) {
            return "Search files...";
        }
        if (hasFoldersConfigured) {
            return "Start the crawler to begin indexing";
        }
        return "Add folders in settings to start searching";
    };

    const searchDisabledMessage = !hasIndexedFiles
        ? (hasFoldersConfigured
            ? 'Folders configured but not indexed yet. Enable the crawler toggle to start indexing.'
            : 'No files indexed yet. Click the settings icon to add folders to watch, then start the crawler.')
        : undefined;

    return (
        <header style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            backgroundColor: 'var(--surface-card)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            borderBottom: '1px solid var(--surface-border)',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
        }}>
            {/* Logo Area */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 'max-content' }}>
                <img src="/icon.svg" alt="File Brain Logo" style={{ height: '32px', width: '32px' }} />
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-color)' }}>File Brain</span>
            </div>

            {/* Search Bar with Clear Button */}
            <div style={{ flex: 1, maxWidth: '30rem', position: 'relative' }}>
                <span
                    style={{ position: 'relative', display: 'block' }}
                    title={searchDisabledMessage}
                >
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
                        tooltip={searchDisabledMessage}
                        tooltipOptions={{
                            position: 'bottom',
                            showDelay: 300
                        }}
                    />
                    {hasIndexedFiles && (
                        <Button
                            icon="fa-solid fa-search"
                            rounded
                            onClick={handleSearch}
                            className="p-button-text"
                            style={{
                                position: 'absolute',
                                right: searchValue ? '2.5rem' : '0.25rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: '2rem',
                                height: '2rem',
                                minWidth: '2rem',
                                padding: 0,
                                color: 'var(--primary-color)',
                                backgroundColor: 'transparent',
                                transition: 'all 0.2s ease',
                                zIndex: 1
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'var(--primary-color-text)';
                                e.currentTarget.style.backgroundColor = 'var(--primary-color)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'var(--primary-color)';
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            aria-label="Search"
                            tooltip="Search (or press Enter)"
                            tooltipOptions={{
                                position: 'bottom',
                                showDelay: 500
                            }}
                        />
                    )}
                    {searchValue && hasIndexedFiles && (
                        <Button
                            icon="fa-solid fa-times"
                            rounded
                            onClick={handleClear}
                            className="p-button-text"
                            style={{
                                position: 'absolute',
                                right: '0.25rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: '2rem',
                                height: '2rem',
                                minWidth: '2rem',
                                padding: 0,
                                color: 'var(--text-color-secondary)',
                                backgroundColor: 'transparent',
                                transition: 'all 0.2s ease',
                                zIndex: 1
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'var(--text-color)';
                                e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'var(--text-color-secondary)';
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            aria-label="Clear search"
                        />
                    )}
                </span>
            </div>

            {/* Actions Area */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 'max-content' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    
                    {/* Monitor Switch */}
                    {onToggleMonitoring && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
                             <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-color)' }}>Monitor</span>
                            <div style={{ position: 'relative', width: '3rem', height: '1.75rem' }}>
                                 {isTogglingMonitor && (
                                    <i className="pi pi-spin pi-spinner" style={{ 
                                        position: 'absolute', 
                                        left: '50%', 
                                        top: '50%', 
                                        transform: 'translate(-50%, -50%)', 
                                        zIndex: 10,
                                        fontSize: '0.8rem'
                                    }} />
                                )}
                                <InputSwitch 
                                    checked={isMonitoring} 
                                    onChange={async (e) => {
                                        setIsTogglingMonitor(true);
                                        try {
                                            await onToggleMonitoring(e.value);
                                        } finally {
                                            setIsTogglingMonitor(false);
                                        }
                                    }}
                                    disabled={isTogglingMonitor}
                                    style={{ opacity: isTogglingMonitor ? 0.7 : 1 }}
                                    tooltip={isMonitoring ? "File Monitoring Active" : "Enable File Monitoring"}
                                />
                            </div>
                        </div>
                    )}

                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Crawler</span>
                    <Button
                        label={isCrawlerActive ? "Stop" : "Start"}
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
                        tooltip={
                            isTogglingCrawler
                                ? "Processing..."
                                : (isCrawlerActive ? "Stop Crawler" : "Start Crawler")
                        }
                    />

                    <Badge
                        value={
                            isTogglingCrawler
                                ? "Processing..."
                                : (isCrawlerActive
                                    ? getCrawlerPhaseLabel(crawlerStatus)
                                    : "Stopped")
                        }
                        severity={
                            isTogglingCrawler
                                ? "info"
                                : (isCrawlerActive ? "warning" : "danger")
                        }
                    />
                </div>

                <Button
                    icon="fa-solid fa-gear"
                    rounded
                    text
                    severity="secondary"
                    aria-label="Settings"
                    onClick={onSettingsClick}
                    tooltip="Settings"
                    tooltipOptions={
                        {
                            position: 'left',
                        }
                    }
                    style={{
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                        e.currentTarget.style.transform = 'rotate(45deg)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '';
                        e.currentTarget.style.transform = 'rotate(0deg)';
                    }}
                />
            </div>
        </header>
    );
};

// Helper function to get crawler phase label
function getCrawlerPhaseLabel(crawlerStatus?: any): string {
    if (!crawlerStatus) return "Active";
    
    const phase = crawlerStatus.current_phase;
    switch (phase) {
        case 'verifying':
            const vProgress = crawlerStatus.verification_progress || 0;
            return `Verifying (${vProgress}%)`;
        case 'discovering':
            return "Discovering...";
        case 'indexing':
            return "Indexing...";

        case 'idle':
            return "Idle";
        default:
            return "Active";
    }
}
