import React, { useMemo, useRef } from 'react';
import { Card } from 'primereact/card';
import { Chart } from 'primereact/chart';
import { useStatus } from '../context/StatusContext';

const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function (chart: { config: { type: string; options: { plugins: { centerText?: { value: number } } } }; ctx: CanvasRenderingContext2D; chartArea: { top: number; left: number; width: number; height: number } }) {
        if (chart.config.type !== 'doughnut') return;

        const { ctx, chartArea: { top, left, width, height } } = chart;

        ctx.save();

        const x = left + width / 2;
        const y = top + height / 2;

        // Get colors from CSS variables
        const style = getComputedStyle(document.documentElement);
        const textColor = style.getPropertyValue('--text-color').trim() || '#495057';
        const textColorSecondary = style.getPropertyValue('--text-color-secondary').trim() || '#6c757d';

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw Number
        ctx.font = "bold 1.25rem sans-serif";
        ctx.fillStyle = textColor;
        const text1 = String(chart.config.options.plugins.centerText?.value || "0");
        ctx.fillText(text1, x, y - 10);

        // Draw Label
        ctx.font = "0.7rem sans-serif";
        ctx.fillStyle = textColorSecondary;
        const text2 = "Total Files";
        ctx.fillText(text2, x, y + 10);

        ctx.restore();
    }
};


export const HeroStats: React.FC = () => {
    const { status, stats, watchPaths } = useStatus();
    const hasFoldersConfigured = watchPaths.length > 0;
    const hasRenderedChart = useRef(false);

    // Memoize chart data to prevent unnecessary rerenders - only update when file_types actually changes
    const chartConfig = useMemo(() => {
        if (!stats?.file_types) {
            return { chartData: null, chartOptions: null, totalFiles: 0 };
        }

        const TOP_COUNT = 5;
        const allFileTypes = Object.entries(stats.file_types).sort((a, b) => b[1] - a[1]);
        const topFileTypes = allFileTypes.slice(0, TOP_COUNT);
        const otherCount = allFileTypes.slice(TOP_COUNT).reduce((sum, [, count]) => sum + count, 0);

        const fileTypeData = [...topFileTypes];
        if (otherCount > 0) {
            fileTypeData.push(['Other', otherCount]);
        }

        const total = fileTypeData.reduce((sum, [, count]) => sum + count, 0);

        const data = {
            labels: fileTypeData.map(([ext]) => ext || 'Unknown'),
            datasets: [
                {
                    data: fileTypeData.map(([, count]) => count),
                    backgroundColor: [
                        '#42A5F5', // blue
                        '#66BB6A', // green
                        '#FFA726', // orange
                        '#AB47BC', // purple
                        '#26C6DA', // cyan
                        '#9E9E9E', // gray for "Other"
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }
            ]
        };

        // Determine if we should animate (only on first render)
        const shouldAnimate = !hasRenderedChart.current;
        if (!hasRenderedChart.current) {
            hasRenderedChart.current = true;
        }

        const options = {
            plugins: {
                centerText: {
                    value: total
                },
                legend: {
                    display: true,
                    position: 'right' as const,
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12
                        },
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#495057'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context: { label?: string; parsed?: number }) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                            return `${label}: ${value} files (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '65%',
            maintainAspectRatio: true,
            responsive: true,
            animation: shouldAnimate ? {
                animateRotate: true,
                animateScale: false,
                duration: 1000
            } : false, // Disable animation after first render
            transitions: {
                active: {
                    animation: {
                        duration: 0
                    }
                }
            }
        };

        return { chartData: data, chartOptions: options, totalFiles: total };
    }, [stats?.file_types]); // Only recompute when file_types changes

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '0.75rem',
            padding: '1rem',
            overflowY: 'auto'
        }}>
            <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: 'var(--text-color)',
                    marginBottom: '0.25rem',
                    letterSpacing: '-0.02em'
                }}>
                    Welcome to File Brain
                </h1>
                <p style={{
                    fontSize: '0.95rem',
                    color: 'var(--text-color-secondary)',
                    lineHeight: 1.4
                }}>
                    Start typing to search your indexed files.
                </p>
            </div>

            {/* Stats Cards - Compact */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.75rem',
                width: '100%',
                maxWidth: '50rem'
            }}>
                {/* Discovered Files Card */}
                <Card
                    style={{
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        cursor: 'default'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '';
                    }}
                >
                    <div style={{ marginBottom: '0.35rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-color-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Discovered
                    </div>
                    <p style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: stats?.totals.discovered && stats.totals.discovered > 0 ? 'var(--primary-color)' : 'var(--text-color-secondary)',
                        margin: 0
                    }}>
                        {stats && stats.totals.discovered > 0 ? stats.totals.discovered.toLocaleString() : '—'}
                    </p>
                    {(!stats || stats.totals.discovered === 0) && (
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-color-secondary)', marginTop: '0.2rem' }}>
                            Start crawler to discover files
                        </p>
                    )}
                </Card>

                {/* Indexed Card */}
                <Card
                    style={{
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        cursor: 'default'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '';
                    }}
                >
                    <div style={{ marginBottom: '0.35rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-color-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Indexed
                    </div>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)', margin: 0 }}>
                        {stats ? stats.totals.indexed.toLocaleString() : '0'}
                    </p>
                </Card>

                {/* Indexing Progress Card - Only show when running OR when work is pending, but NOT during verification */}
                {stats && status && status.current_phase !== 'verifying' && stats.totals.discovered > 0 && (stats.runtime.running || stats.totals.indexed < stats.totals.discovered) && (
                    <Card
                        style={{
                            textAlign: 'center',
                            transition: 'all 0.2s ease',
                            cursor: 'default'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '';
                        }}
                    >
                        <div style={{ marginBottom: '0.35rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-color-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Indexing Progress
                        </div>
                        <div style={{ marginBottom: '0.2rem' }}>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)', margin: 0 }}>
                                {Math.round((stats.totals.indexed / stats.totals.discovered) * 100)}%
                            </p>
                        </div>
                        <div style={{
                            width: '100%',
                            height: '6px',
                            backgroundColor: 'var(--surface-border)',
                            borderRadius: '3px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${Math.min((stats.totals.indexed / stats.totals.discovered) * 100, 100)}%`,
                                height: '100%',
                                backgroundColor: 'var(--primary-color)',
                                transition: 'width 0.5s ease',
                                borderRadius: '3px'
                            }} />
                        </div>
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-color-secondary)', marginTop: '0.2rem' }}>
                            {stats.totals.indexed.toLocaleString()} of {stats.totals.discovered.toLocaleString()} files
                        </p>
                    </Card>
                )}
            </div>

            {/* Empty State Message */}
            {(!stats || stats.totals.indexed === 0) && (
                <Card
                    style={{
                        width: '100%',
                        maxWidth: '45rem',
                        textAlign: 'center',
                        backgroundColor: 'var(--blue-50)',
                        border: '2px dashed var(--primary-color)'
                    }}>
                    <i className={hasFoldersConfigured ? "fa-solid fa-play-circle" : "fa-solid fa-folder-plus"} style={{
                        fontSize: '2rem',
                        color: 'var(--primary-color)',
                        marginBottom: '0.5rem'
                    }} />
                    <h3 style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--text-color)',
                        marginBottom: '0.4rem'
                    }}>
                        {hasFoldersConfigured ? 'Ready to Index Your Files' : 'Get Started with File Brain'}
                    </h3>
                    <p style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-color-secondary)',
                        marginBottom: '0.75rem',
                        lineHeight: 1.4
                    }}>
                        {hasFoldersConfigured
                            ? 'You have folders configured but no files indexed yet. Start the crawler to begin indexing:'
                            : 'No files indexed yet. To start searching your files:'}
                    </p>
                    {hasFoldersConfigured ? (
                        <ol style={{
                            textAlign: 'left',
                            display: 'inline-block',
                            fontSize: '0.8rem',
                            color: 'var(--text-color)',
                            lineHeight: 1.5,
                            marginBottom: '0.75rem'
                        }}>
                            <li>Enable the <strong>Monitor</strong> toggle to track changes</li>
                            <li>Enable the <strong>Crawler</strong> toggle to start indexing your configured folders</li>
                            <li>Wait for the crawler to discover and index your files</li>
                        </ol>
                    ) : (
                        <ol style={{
                            textAlign: 'left',
                            display: 'inline-block',
                            fontSize: '0.8rem',
                            color: 'var(--text-color)',
                            lineHeight: 1.5,
                            marginBottom: '0.75rem'
                        }}>
                            <li>Click the <i className="fa-solid fa-gear" style={{ color: 'var(--primary-color)' }} /> <strong>Settings</strong> icon in the top right</li>
                            <li>Add folders you want to watch and index</li>
                            <li>Enable the <strong>Monitor</strong> toggle to track file changes</li>
                            <li>Enable the <strong>Crawler</strong> toggle to start indexing</li>
                        </ol>
                    )}

                    <p style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-color-secondary)',
                        fontStyle: 'italic'
                    }}>
                        Once some files are indexed, you'll be able to search through them instantly!
                    </p>
                </Card>
            )}

            {/* File Type Distribution Chart */}
            {chartConfig.totalFiles > 0 && chartConfig.chartData && (
                <Card
                    style={{
                        width: '100%',
                        maxWidth: '45rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                    }}>
                    <div style={{
                        marginBottom: '0.5rem',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: 'var(--text-color)',
                        textAlign: 'center',
                        letterSpacing: '-0.01em'
                    }}>
                        File Type Distribution
                    </div>
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div style={{ position: 'relative', maxWidth: '280px', width: '100%', margin: '0 auto' }}>
                            <Chart
                                type="doughnut"
                                data={chartConfig.chartData}
                                options={chartConfig.chartOptions}
                                plugins={[centerTextPlugin]}
                            />
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};
