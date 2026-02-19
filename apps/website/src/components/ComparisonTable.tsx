import React from 'react';

export interface ComparisonRow {
    feature: string;
    fileBrain: string;
    fileBrainHighlight?: boolean;
    competitors: string[];
}

interface ComparisonTableProps {
    headers: string[];   // e.g. ['Feature', 'File Brain', 'Everything / Listary', 'Windows Search', 'Copernic']
    rows: ComparisonRow[];
    caption?: string;
}

/**
 * Styled competitor comparison table for SEO articles.
 * Uses site CSS variables for consistent theming.
 */
export const ComparisonTable: React.FC<ComparisonTableProps> = ({ headers, rows, caption }) => {
    return (
        <div className="comparison-table-wrapper" role="region" aria-label={caption ?? 'Comparison table'}>
            {caption && (
                <p className="text-sm text-center mb-2" style={{ color: 'var(--text-color-secondary)' }}>
                    {caption}
                </p>
            )}
            <table className="comparison-table">
                <thead>
                    <tr>
                        {headers.map((header, i) => (
                            <th
                                key={i}
                                className="comparison-th"
                                style={i === 1 ? { color: 'var(--primary-color)' } : undefined}
                            >
                                {i === 1 && (
                                    <i className="fa-solid fa-star mr-1 text-xs" style={{ color: 'var(--primary-color)' }} />
                                )}
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'comparison-row-even' : 'comparison-row-odd'}>
                            <td className="comparison-td comparison-td-feature">
                                {row.feature}
                            </td>
                            <td
                                className="comparison-td comparison-td-highlight"
                                style={row.fileBrainHighlight ? { color: 'var(--primary-color)', fontWeight: 700 } : undefined}
                            >
                                {row.fileBrainHighlight && (
                                    <i className="fa-solid fa-check mr-1 text-xs" />
                                )}
                                {row.fileBrain}
                            </td>
                            {row.competitors.map((val, colIdx) => (
                                <td key={colIdx} className="comparison-td">
                                    {val}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
