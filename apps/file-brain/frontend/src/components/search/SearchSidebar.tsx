import React from 'react';
import { useRefinementList } from 'react-instantsearch';
import { Checkbox } from 'primereact/checkbox';
import { Badge } from 'primereact/badge';

interface SearchSidebarProps {
    className?: string;
}

export const SearchSidebar: React.FC<SearchSidebarProps> = ({ className }) => {
    const { items, refine } = useRefinementList({
        attribute: 'file_extension',
        sortBy: ['count:desc', 'name:asc'],
        limit: 10
    });

    if (items.length === 0) {
        return null;
    }

    return (
        <div className={className} style={{
            width: '250px',
            minWidth: '250px',
            padding: '1rem',
            borderRight: '1px solid var(--surface-border)',
            backgroundColor: 'var(--surface-card)',
            height: '100%',
            overflowY: 'auto'
        }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    marginBottom: '1rem',
                    color: 'var(--text-color)'
                }}>
                    File Type
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {items.map((item) => (
                        <div
                            key={item.label}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                cursor: 'pointer',
                                padding: '0.25rem 0'
                            }}
                            onClick={(event) => {
                                event.preventDefault();
                                refine(item.value);
                            }}
                        >
                            <Checkbox 
                                checked={item.isRefined} 
                                onChange={() => refine(item.value)}
                                onClick={(e) => e.stopPropagation()} // Prevent double trigger with parent div
                            />
                            <span style={{
                                color: 'var(--text-color)',
                                fontSize: '0.9rem',
                                flex: 1
                            }}>
                                {item.label.replace('.', '').toUpperCase()}
                            </span>
                            <Badge value={item.count} severity="secondary" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
