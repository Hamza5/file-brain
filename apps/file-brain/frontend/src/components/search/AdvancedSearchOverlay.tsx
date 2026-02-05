import React from 'react';
import { OverlayPanel } from 'primereact/overlaypanel';
import { Dropdown } from 'primereact/dropdown';
import { InputSwitch } from 'primereact/inputswitch';
import { useSearch, type SearchMode } from '../../context/SearchContext';
import { usePostHog } from '../../context/PostHogProvider';

interface AdvancedSearchOverlayProps {
    overlayRef: React.RefObject<OverlayPanel | null>;
}

export const AdvancedSearchOverlay: React.FC<AdvancedSearchOverlayProps> = ({ overlayRef }) => {
    const { searchMode, setSearchMode, fuzzySearchEnabled, setFuzzySearchEnabled } = useSearch();
    const posthog = usePostHog();

    const searchModeOptions = [
        { label: 'Hybrid (Recommended)', value: 'hybrid' as SearchMode, icon: 'fa-solid fa-layer-group' },
        { label: 'Full-Text', value: 'full-text' as SearchMode, icon: 'fa-solid fa-font' },
        { label: 'Semantic', value: 'semantic' as SearchMode, icon: 'fa-solid fa-brain' },
    ];

    const handleSearchModeChange = (mode: SearchMode) => {
        setSearchMode(mode);
        if (posthog) {
            posthog.capture('search_mode_changed', { mode });
        }
    };

    const handleFuzzyToggle = (enabled: boolean) => {
        setFuzzySearchEnabled(enabled);
        if (posthog) {
            posthog.capture('fuzzy_search_toggled', { enabled, mode: searchMode });
        }
    };

    const showFuzzyToggle = searchMode !== 'semantic';

    const searchModeTemplate = (option: typeof searchModeOptions[0]) => {
        return (
            <div className="flex align-items-center gap-2">
                <i className={option.icon} style={{ fontSize: '0.875rem' }} />
                <span>{option.label}</span>
            </div>
        );
    };

    return (
        <OverlayPanel ref={overlayRef} style={{ width: '320px' }}>
            <div className="flex flex-column gap-4 p-2">
                {/* Header */}
                <div className="flex align-items-center gap-2 pb-2 border-bottom-1 surface-border">
                    <i className="fa-solid fa-sliders text-primary" />
                    <span className="font-semibold text-color">Search Options</span>
                </div>

                {/* Search Mode Selector */}
                <div className="flex flex-column gap-2">
                    <label htmlFor="search-mode" className="text-sm font-medium text-color">
                        Search Mode
                    </label>
                    <Dropdown
                        id="search-mode"
                        value={searchMode}
                        options={searchModeOptions}
                        onChange={(e) => handleSearchModeChange(e.value)}
                        itemTemplate={searchModeTemplate}
                        valueTemplate={searchModeTemplate}
                        className="w-full"
                    />
                    <div className="text-xs text-color-secondary">
                        {searchMode === 'hybrid' && 'Combines keyword matching with semantic understanding for best results.'}
                        {searchMode === 'full-text' && 'Searches based on exact keywords and text matching.'}
                        {searchMode === 'semantic' && 'Searches based on meaning and context using AI embeddings.'}
                    </div>
                </div>

                {/* Fuzzy Search Toggle */}
                {showFuzzyToggle && (
                    <div className="flex flex-column gap-2">
                        <div className="flex align-items-center justify-content-between">
                            <label htmlFor="fuzzy-search" className="text-sm font-medium text-color">
                                Fuzzy Search
                            </label>
                            <InputSwitch
                                id="fuzzy-search"
                                checked={fuzzySearchEnabled}
                                onChange={(e) => handleFuzzyToggle(e.value)}
                            />
                        </div>
                        <div className="text-xs text-color-secondary">
                            {fuzzySearchEnabled
                                ? 'Tolerates typos and spelling variations in search queries.'
                                : 'Requires exact spelling matches.'}
                        </div>
                    </div>
                )}
            </div>
        </OverlayPanel>
    );
};
