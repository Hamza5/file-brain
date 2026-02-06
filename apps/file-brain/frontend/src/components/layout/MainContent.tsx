import React from 'react';
import { HeroStats } from '../dashboard/HeroStats';
import { type SearchHit } from '../../types/search';
import { ResultsGrid } from '../search/ResultsGrid';
import { SearchSidebar } from '../search/SearchSidebar';
import { useSearchBox } from 'react-instantsearch';

interface MainContentProps {
    onResultClick: (result: SearchHit) => void;
    isCrawlerActive?: boolean;
}

export const MainContent: React.FC<MainContentProps> = ({ onResultClick, isCrawlerActive = false }) => {
    const { query } = useSearchBox();
    const hasQuery = query && query.trim().length > 0;

    return (
        <main style={{
            flex: 1,
            overflowY: 'hidden', // Changed from auto to hidden to manage scroll in children
            backgroundColor: 'var(--surface-ground)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {!hasQuery ? (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <HeroStats />
                </div>
            ) : (
                <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                    <SearchSidebar />
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 1rem' }}>
                        <ResultsGrid onResultClick={onResultClick} isCrawlerActive={isCrawlerActive} />
                    </div>
                </div>
            )}
        </main>
    );
};

