import { useState, useCallback, useEffect } from 'react';
import { type SearchHit } from '../types/search';

export interface UseSelectionExportReturn {
    selectedIds: Set<string>;
    selectedHits: SearchHit[];
    isAllSelected: (hits: SearchHit[]) => boolean;
    isSelected: (id: string) => boolean;
    toggleSelect: (hit: SearchHit) => void;
    toggleSelectAll: (hits: SearchHit[]) => void;
    clearSelection: () => void;
    selectionCount: number;
}

/**
 * Manages selection state for search result hits.
 * Automatically clears the selection whenever the query string changes.
 */
export function useSelectionExport(query: string): UseSelectionExportReturn {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedHits, setSelectedHits] = useState<SearchHit[]>([]);

    // Reset selection on every new query / page change
    useEffect(() => {
        setSelectedIds(new Set());
        setSelectedHits([]);
    }, [query]);

    const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

    const isAllSelected = useCallback(
        (hits: SearchHit[]) => hits.length > 0 && hits.every((h) => selectedIds.has(h.objectID)),
        [selectedIds],
    );

    const toggleSelect = useCallback((hit: SearchHit) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(hit.objectID)) {
                next.delete(hit.objectID);
            } else {
                next.add(hit.objectID);
            }
            return next;
        });
        setSelectedHits((prev) => {
            const exists = prev.some((h) => h.objectID === hit.objectID);
            return exists ? prev.filter((h) => h.objectID !== hit.objectID) : [...prev, hit];
        });
    }, []);

    const toggleSelectAll = useCallback((hits: SearchHit[]) => {
        const allSelected = hits.length > 0 && hits.every((h) => selectedIds.has(h.objectID));
        if (allSelected) {
            // Deselect all hits on the current page (keep hits from other pages)
            const pageIds = new Set(hits.map((h) => h.objectID));
            setSelectedIds((prev) => {
                const next = new Set(prev);
                pageIds.forEach((id) => next.delete(id));
                return next;
            });
            setSelectedHits((prev) => prev.filter((h) => !pageIds.has(h.objectID)));
        } else {
            // Select all on current page
            setSelectedIds((prev) => {
                const next = new Set(prev);
                hits.forEach((h) => next.add(h.objectID));
                return next;
            });
            setSelectedHits((prev) => {
                const existingIds = new Set(prev.map((h) => h.objectID));
                const newHits = hits.filter((h) => !existingIds.has(h.objectID));
                return [...prev, ...newHits];
            });
        }
    }, [selectedIds]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setSelectedHits([]);
    }, []);

    return {
        selectedIds,
        selectedHits,
        isAllSelected,
        isSelected,
        toggleSelect,
        toggleSelectAll,
        clearSelection,
        selectionCount: selectedIds.size,
    };
}
