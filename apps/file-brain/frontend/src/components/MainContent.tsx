import React from 'react';
import { HeroStats } from './HeroStats';
import { ResultsGrid } from './ResultsGrid';
import { useSearchBox } from 'react-instantsearch';

interface MainContentProps {
    onResultClick: (result: any) => void;
    isCrawlerActive?: boolean;
}

export const MainContent: React.FC<MainContentProps> = ({ onResultClick, isCrawlerActive = false }) => {
    const { query } = useSearchBox();
    const hasQuery = query && query.trim().length > 0;

    return (
        <main style={{
            flex: 1,
            overflowY: 'auto',
            backgroundColor: 'var(--surface-ground)',
        }}>
            {!hasQuery ? (
                <HeroStats />
            ) : (
                <ResultsGrid onResultClick={onResultClick} isCrawlerActive={isCrawlerActive} />
            )}
        </main>
    );
};

