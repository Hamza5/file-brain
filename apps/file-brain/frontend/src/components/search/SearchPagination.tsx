import React from 'react';
import { usePagination } from 'react-instantsearch';
import { Paginator } from 'primereact/paginator';

interface SearchPaginationProps {
    className?: string;
}

export const SearchPagination: React.FC<SearchPaginationProps> = ({ className }) => {
    const {
        currentRefinement,
        nbPages,
        nbHits,
        refine
    } = usePagination();

    // hitsPerPage is typically 24 as configured in SearchClientWrapper
    const rows = 24; 

    // Calculate 'first' (index of first record on current page)
    const first = currentRefinement * rows;

    if (nbPages <= 1) {
        return null;
    }

    return (
        <div className={className} style={{ width: '100%', borderTop: '1px solid var(--surface-border)' }}>
            <Paginator
                first={first}
                rows={rows}
                totalRecords={Math.min(nbHits, 1000)} // Typesense/Algolia often limit max hits
                onPageChange={(e) => {
                    refine(e.page);
                }}
                template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
                className="border-none"
            />
        </div>
    );
};
