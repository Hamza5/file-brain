'use client';
import React from 'react';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { InputSwitch } from 'primereact/inputswitch';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Chart } from 'primereact/chart';
import { SelectButton } from 'primereact/selectbutton';
import Image from 'next/image';
import logo from '@/app/icon.svg';
import { centerTextPlugin } from '@file-brain/shared';

export const AppMockup: React.FC = () => {
    // File Types Chart Data (total should match indexed count: 1,248)
    const fileTypesData = {
        labels: ['.pdf', '.xlsx', '.docx', '.pptx', '.jpg', 'Other'],
        datasets: [
            {
                data: [420, 298, 230, 168, 82, 50],
                backgroundColor: [
                    '#42A5F5', '#66BB6A', '#FFA726', '#AB47BC', '#26C6DA', '#9E9E9E'
                ],
                borderWidth: 2,
                borderColor: '#ffffff',
            }
        ]
    };

    const fileTypesOptions = {
        cutout: '65%',
        plugins: {
            centerText: {
                value: '1,248'
            },
            legend: {
                display: true,
                position: 'right' as const,
                labels: {
                    usePointStyle: true,
                    padding: 15
                }
            }
        },
        maintainAspectRatio: true,
        responsive: true
    };

    // Processing Activity Chart Data
    const activityData = {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
        datasets: [{
            label: 'Files Processed',
            data: [12, 19, 15, 25, 22, 30],
            fill: true,
            backgroundColor: 'rgba(66, 165, 245, 0.2)',
            borderColor: '#42A5F5',
            tension: 0.4,
        }]
    };

    const activityOptions = {
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { stepSize: 5 } },
        },
        maintainAspectRatio: false,
        responsive: true,
    };

    // Sample recent files
    const recentFiles = [
        { name: 'Project_Report_2024.pdf', size: '2.4 MB', time: '5 min ago', ext: '.pdf' },
        { name: 'Budget_Analysis.xlsx', size: '856 KB', time: '12 min ago', ext: '.xlsx' },
        { name: 'Meeting_Notes.docx', size: '124 KB', time: '1 hour ago', ext: '.docx' },
        { name: 'Presentation.pptx', size: '5.2 MB', time: '2 hours ago', ext: '.pptx' },
        { name: 'Photo_2024.jpg', size: '3.1 MB', time: '3 hours ago', ext: '.jpg' },
    ];

    const getFileIcon = (ext: string) => {
        const iconMap: Record<string, string> = {
            '.pdf': 'fa-file-pdf',
            '.xlsx': 'fa-file-excel',
            '.docx': 'fa-file-word',
            '.pptx': 'fa-file-powerpoint',
            '.jpg': 'fa-file-image',
        };
        return `fa-solid ${iconMap[ext] || 'fa-file'}`;
    };

    return (
        <section className="app-mockup-section pb-8 pt-2" style={{ position: 'relative', zIndex: 10 }}>
            <div className="landing-container">
                <div className="relative mx-auto" style={{ maxWidth: '1200px' }}>
                    {/* Shadow/Glow effect */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-2xl blur opacity-20 transition duration-1000 group-hover:opacity-100"></div>
                    
                    {/* Mockup Container */}
                    <div className="relative p-1 surface-card border-round-2xl shadow-8">
                        <div className="surface-card border-round-xl overflow-hidden flex flex-column" style={{ minHeight: '40rem', position: 'relative' }}>
                            {/* Transparent overlay to prevent interaction */}
                            <div style={{ position: 'absolute', inset: 0, zIndex: 999, cursor: 'default' }} />
                            
                            {/* App Header */}
                            <header className="flex align-items-center justify-content-between px-4 py-3 border-bottom-1 surface-border surface-card">
                                <div className="flex align-items-center gap-2">
                                    <Image src={logo} alt="Logo" width={32} height={32} />
                                    <span className="font-bold text-xl text-color">File Brain</span>
                                </div>
                                <div className="flex-1 flex justify-content-center px-4">
                                    <div className="relative w-full max-w-30rem">
                                        <i className="fa-solid fa-magnifying-glass" style={{
                                            position: 'absolute',
                                            left: '0.75rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: '#94a3b8',
                                            fontSize: '0.875rem',
                                            zIndex: 1
                                        }} />
                                        <InputText 
                                            placeholder="Search your files..." 
                                            className="w-full pl-7 pr-7 py-2 border-round-lg border-1 border-300 text-sm"
                                            style={{ 
                                                backgroundColor: 'white', 
                                                opacity: 1,
                                                paddingLeft: '2.5rem',
                                                paddingRight: '5.5rem',
                                                height: '2.5rem'
                                            }}
                                        />
                                        <Button
                                            icon="fa-solid fa-search"
                                            rounded
                                            className="p-button-text"
                                            style={{
                                                position: 'absolute',
                                                right: '2.5rem',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: '2rem',
                                                height: '2rem',
                                                color: 'var(--primary-color)',
                                            }}
                                        />
                                        <Button
                                            icon="fa-solid fa-times"
                                            rounded
                                            className="p-button-text"
                                            style={{
                                                position: 'absolute',
                                                right: '0.25rem',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: '2rem',
                                                height: '2rem',
                                                color: '#94a3b8',
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="flex align-items-center gap-3">
                                    {/* Auto-Index Toggle */}
                                    <div className="p-inputgroup">
                                        <div className="p-inputgroup-addon p-2 flex align-items-center gap-2">
                                            <InputSwitch checked={true} />
                                            <label className="flex align-items-center gap-2">
                                                <span className="text-sm font-medium text-700 hidden lg:block">Auto-Index</span>
                                                <i className="fa-solid fa-circle-question text-600 text-xs cursor-help hidden lg:inline" />
                                            </label>
                                        </div>
                                    </div>

                                    {/* Index Button */}
                                    <div className="flex align-items-center gap-2">
                                        <Button
                                            label="Index"
                                            icon="fa-solid fa-play"
                                            size="small"
                                            severity="success"
                                        />
                                        <Tag
                                            value="Ready"
                                            severity="success"
                                            className="text-xs"
                                        />
                                    </div>

                                    {/* Theme Switcher */}
                                    <Button
                                        icon="fa-solid fa-circle-half-stroke"
                                        rounded
                                        text
                                        className="text-600"
                                    />
                                </div>
                            </header>
                            
                            {/* App Content */}
                            <div className="flex-1 surface-ground p-4">
                                <div className="max-w-full mx-auto">
                                    {/* Stat Cards */}
                                    <div className="grid mb-4">
                                        <div className="col-6 md:col-3">
                                            <Card className="surface-card border-round-2xl p-3 shadow-2 flex flex-column align-items-center justify-content-center text-center h-full gap-1">
                                                <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-xl">
                                                    <i className="fa-solid fa-file-circle-check text-3xl text-primary" />
                                                </div>
                                                <div className="text-2xl font-bold text-color">1,248</div>
                                                <div className="flex align-items-center gap-1">
                                                    <span className="text-xs text-color-secondary font-semibold uppercase tracking-wider">Indexed</span>
                                                    <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help" />
                                                </div>
                                            </Card>
                                        </div>
                                        <div className="col-6 md:col-3">
                                            <Card className="surface-card border-round-2xl p-3 shadow-2 flex flex-column align-items-center justify-content-center text-center h-full gap-1">
                                                <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-xl">
                                                    <i className="fa-solid fa-magnifying-glass text-3xl text-primary" />
                                                </div>
                                                <div className="text-2xl font-bold text-color">3,142</div>
                                                <div className="flex align-items-center gap-1">
                                                    <span className="text-xs text-color-secondary font-semibold uppercase tracking-wider">Discovered</span>
                                                    <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help" />
                                                </div>
                                            </Card>
                                        </div>
                                        <div className="col-6 md:col-3">
                                            <Card className="surface-card border-round-2xl p-3 shadow-2 flex flex-column align-items-center justify-content-center text-center h-full gap-1">
                                                <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-xl">
                                                    <i className="fa-solid fa-database text-3xl text-primary" />
                                                </div>
                                                <div className="text-2xl font-bold text-color">1.2 GB</div>
                                                <div className="flex align-items-center gap-1">
                                                    <span className="text-xs text-color-secondary font-semibold uppercase tracking-wider">Storage</span>
                                                    <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help" />
                                                </div>
                                            </Card>
                                        </div>
                                        <div className="col-6 md:col-3">
                                            <Card className="surface-card border-round-2xl p-3 shadow-2 flex flex-column align-items-center justify-content-center text-center h-full gap-1">
                                                <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-xl">
                                                    <i className="fa-solid fa-folder-open text-3xl text-primary" />
                                                </div>
                                                <div className="text-2xl font-bold text-color">5</div>
                                                <div className="flex align-items-center gap-1">
                                                    <span className="text-xs text-color-secondary font-semibold uppercase tracking-wider">Folders</span>
                                                    <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help" />
                                                </div>
                                                <div className="text-xs text-color-secondary opacity-70" style={{ fontSize: '10px' }}>Watching</div>
                                            </Card>
                                        </div>
                                    </div>
                                    
                                    {/* Charts and Recent Files */}
                                    <div className="grid">
                                        {/* Left Column: Charts */}
                                        <div className="col-12 xl:col-8">
                                            <div className="grid">
                                                {/* Processing Activity Chart */}
                                                <div className="col-12 lg:col-6">
                                                    <Card className="surface-card h-full border-round-2xl shadow-2" style={{ padding: '0.75rem' }}>
                                                        <div className="flex justify-content-between align-items-center mb-3">
                                                            <div className="flex align-items-center gap-1">
                                                                <span className="font-semibold text-color">Processing Activity</span>
                                                                <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help" />
                                                            </div>
                                                            <SelectButton
                                                                value="24h"
                                                                options={[{ label: '24h', value: '24h' }, { label: '7d', value: '7d' }]}
                                                                style={{ fontSize: '0.75rem' }}
                                                                pt={{
                                                                    button: { style: { padding: '0.25rem 0.5rem', fontSize: '0.75rem' } }
                                                                }}
                                                            />
                                                        </div>
                                                        <div style={{ height: '200px' }}>
                                                            <Chart type="line" data={activityData} options={activityOptions} />
                                                        </div>
                                                    </Card>
                                                </div>

                                                {/* File Types Chart */}
                                                <div className="col-12 lg:col-6">
                                                    <Card className="surface-card h-full border-round-2xl shadow-2" style={{ padding: '0.75rem' }}>
                                                        <div className="flex justify-content-between align-items-center mb-3">
                                                            <div className="flex align-items-center gap-1">
                                                                <span className="font-semibold text-color">File Types</span>
                                                                <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help" />
                                                            </div>
                                                            <SelectButton
                                                                value="count"
                                                                options={[{ label: 'Count', value: 'count' }, { label: 'Size', value: 'size' }]}
                                                                style={{ fontSize: '0.75rem' }}
                                                                pt={{
                                                                    button: { style: { padding: '0.25rem 0.5rem', fontSize: '0.75rem' } }
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="flex justify-content-center">
                                                            <div style={{ maxWidth: '280px', width: '100%' }}>
                                                                <Chart 
                                                                    type="doughnut" 
                                                                    data={fileTypesData} 
                                                                    options={fileTypesOptions}
                                                                    plugins={[centerTextPlugin]}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="text-center text-xs text-color-secondary mt-2 opacity-70">
                                                            Click on a segment to explore files
                                                        </div>
                                                    </Card>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Column: Recent Files */}
                                        <div className="col-12 xl:col-4">
                                            <div className="surface-card border-round-2xl p-3 shadow-2 h-full flex flex-column gap-3">
                                                <div className="flex align-items-center justify-content-between">
                                                    <span className="font-bold text-lg text-color">Recently Indexed</span>
                                                    <span className="text-xs text-color-secondary">{recentFiles.length} files</span>
                                                </div>
                                                <div className="flex flex-column gap-2 overflow-y-auto pr-1" style={{ flex: '1 1 0', minHeight: '300px' }}>
                                                    {recentFiles.map((file, index) => (
                                                        <div
                                                            key={index}
                                                            className="flex align-items-center gap-3 p-2 border-round-xl surface-card border-1 border-transparent shadow-1 hover:shadow-2 hover:border-primary"
                                                            style={{ transition: "all 0.2s ease" }}
                                                        >
                                                            <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-lg" style={{ width: '36px', height: '36px', flexShrink: 0 }}>
                                                                <i className={`${getFileIcon(file.ext)} text-lg text-primary`} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-semibold text-sm text-overflow-ellipsis white-space-nowrap overflow-hidden text-color" title={file.name}>
                                                                    {file.name}
                                                                </div>
                                                                <div className="text-xs text-color-secondary mt-0 flex align-items-center gap-1 opacity-80" style={{ fontSize: '11px' }}>
                                                                    <span>{file.size}</span>
                                                                    <span className="opacity-50">•</span>
                                                                    <span>{file.time}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex align-items-center">
                                                                <Button
                                                                    icon="fas fa-external-link-alt"
                                                                    className="p-button-text p-button-sm w-auto p-1"
                                                                />
                                                                <Button
                                                                    icon="fas fa-folder-open"
                                                                    className="p-button-text p-button-sm w-auto p-1"
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Status Bar */}
                            <div 
                                className="px-4 py-3 border-top-1 surface-border surface-card"
                                style={{ backdropFilter: 'blur(8px)' }}
                            >
                                <div className="flex align-items-center justify-content-between gap-3">
                                    {/* Left: Status message with icon */}
                                    <div className="flex align-items-center gap-2 flex-shrink-0">
                                        <i className="fas fa-check-circle text-green-500" />
                                        <span className="font-medium text-color-secondary text-sm">
                                            Ready • 1,248 files indexed
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
