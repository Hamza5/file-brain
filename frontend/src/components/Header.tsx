import React, { useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { InputSwitch } from 'primereact/inputswitch';
import { Badge } from 'primereact/badge';
import { useSearchBox } from 'react-instantsearch';

interface HeaderProps {
    onSettingsClick: () => void;
    isCrawlerActive: boolean;
    onToggleCrawler: (value: boolean) => void;
    crawlerStatus?: any;
    hasIndexedFiles?: boolean;
    hasFoldersConfigured?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
    onSettingsClick,
    isCrawlerActive,
    onToggleCrawler,
    crawlerStatus,
    hasIndexedFiles = true,
    hasFoldersConfigured = false
}) => {
    const { query, refine } = useSearchBox();
    const [searchValue, setSearchValue] = useState(query);

    // Debounce search
    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (query !== searchValue) {
                refine(searchValue);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchValue, refine, query]);

    const handleClear = () => {
        setSearchValue('');
        refine('');
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
                        onChange={(e) => hasIndexedFiles && setSearchValue(e.target.value)}
                        placeholder={getPlaceholder()}
                        disabled={!hasIndexedFiles}
                        style={{
                            width: '100%',
                            paddingLeft: '2.5rem',
                            paddingRight: '2.5rem',
                            cursor: hasIndexedFiles ? 'text' : 'not-allowed',
                            opacity: hasIndexedFiles ? 1 : 0.6
                        }}
                        tooltip={searchDisabledMessage}
                        tooltipOptions={{
                            position: 'bottom',
                            showDelay: 300
                        }}
                    />
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
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Crawler</span>
                    <InputSwitch
                        checked={isCrawlerActive}
                        onChange={(e) => onToggleCrawler(e.value)}
                        tooltip={isCrawlerActive ? "Stop Crawler" : "Start Crawler"}
                    />
                    <Badge
                        value={
                            isCrawlerActive
                                ? (crawlerStatus?.files_discovered === 0
                                    ? "Discovering..."
                                    : (crawlerStatus?.discovery_progress < 100
                                        ? "Discovering..."
                                        : "Indexing..."))
                                : "Stopped"
                        }
                        severity={isCrawlerActive ? "warning" : "danger"}
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
