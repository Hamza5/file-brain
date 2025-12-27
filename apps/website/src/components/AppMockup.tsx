'use client';
import React from 'react';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { InputSwitch } from 'primereact/inputswitch';
import { Badge } from 'primereact/badge';
import { Chart } from 'primereact/chart';
import Image from 'next/image';
import logo from '@/app/icon.svg';

const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function (chart: { 
        config: { type: string; options: { plugins: { centerText: { value: number } } } }; 
        ctx: CanvasRenderingContext2D; 
        chartArea: { top: number; left: number; width: number; height: number } 
    }) {
        if (chart.config.type !== 'doughnut') return;
        const { ctx, chartArea: { top, left, width, height } } = chart;
        ctx.save();
        const x = left + width / 2;
        const y = top + height / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "bold 1.5rem sans-serif";
        ctx.fillStyle = '#1e293b'; // var(--900) equivalent
        const text1 = chart.config.options.plugins.centerText?.value.toString() || "0";
        ctx.fillText(text1, x, y - 10);
        ctx.font = "bold 0.7rem sans-serif";
        ctx.fillStyle = '#64748b'; // var(--500) equivalent
        const text2 = "Total Files";
        ctx.fillText(text2, x, y + 10);
        ctx.restore();
    }
};

export const AppMockup: React.FC = () => {
    const chartData = {
        labels: ['.pdf', '.xlsx', '.docx', '.pptx', '.jpg', 'Other'],
        datasets: [
            {
                data: [450, 320, 248, 180, 50, 0],
                backgroundColor: [
                    '#42A5F5', '#66BB6A', '#FFA726', '#AB47BC', '#26C6DA', '#9E9E9E'
                ],
                hoverBackgroundColor: [
                    '#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DD0E1', '#BDBDBD'
                ]
            }
        ]
    };

    const chartOptions = {
        cutout: '65%',
        plugins: {
            centerText: {
                value: 1248
            },
            legend: {
                display: true,
                position: 'right',
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                    font: {
                        size: 10
                    }
                }
            }
        }
    };

    return (
        <section className="app-mockup-section pb-8 pt-2" style={{ position: 'relative', zIndex: 10 }}>
            <div className="landing-container">
                <div className="relative mx-auto" style={{ maxWidth: '1000px' }}>
                    {/* Shadow/Glow effect */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-2xl blur opacity-20 transition duration-1000 group-hover:opacity-100"></div>
                    
                    {/* Mockup Container */}
                    <div className="relative p-1 bg-white border-round-2xl shadow-8 border-1 border-gray-100">
                        <div className="bg-white border-round-xl overflow-hidden flex flex-column" style={{ minHeight: '35rem' }}>
                            {/* App Header */}
                            <header className="flex align-items-center justify-content-between px-4 py-3 border-bottom-1 border-200 bg-white">
                                <div className="flex align-items-center gap-2">
                                    <Image src={logo} alt="Logo" width={32} height={32} />
                                    <span className="font-bold text-xl text-900">File Brain</span>
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
                                            placeholder="Search files..." 
                                            className="w-full pl-7 pr-7 py-2 border-round-lg border-1 border-300 text-sm" 
                                            disabled
                                            style={{ 
                                                backgroundColor: 'white', 
                                                opacity: 1,
                                                paddingLeft: '2.5rem',
                                                paddingRight: '2.5rem',
                                                height: '2.5rem'
                                            }}
                                        />
                                        <i className="fa-solid fa-search" style={{
                                            position: 'absolute',
                                            right: '0.75rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: 'var(--primary-color)',
                                            fontSize: '0.875rem',
                                            zIndex: 1
                                        }} />
                                    </div>
                                </div>
                                <div className="flex align-items-center gap-3">
                                    <div className="flex align-items-center gap-2">
                                        <span className="text-sm font-medium text-700">Crawler</span>
                                        <InputSwitch checked={true} disabled />
                                        <Badge value="Indexing..." severity="info" className="text-xs font-bold" />
                                    </div>
                                    <i className="fa-solid fa-gear text-600 cursor-pointer text-lg"></i>
                                </div>
                            </header>
                            
                            {/* App Content */}
                            <div className="flex-1 bg-gray-50 p-4">
                                <div className="max-w-4xl mx-auto flex flex-column align-items-center">
                                    <div className="text-center mb-6">
                                        <h3 className="text-2xl font-bold text-900 mb-1">Welcome to File Brain</h3>
                                        <p className="text-600">Start typing to search your indexed files.</p>
                                    </div>
                                    
                                    <div className="grid w-full mb-4">
                                        <div className="col-12 md:col-4 p-2">
                                            <Card className="text-center border-1 border-100 shadow-none py-3 h-full">
                                                <div className="text-xs font-bold text-500 uppercase mb-3">Discovered</div>
                                                <div className="text-3xl font-bold text-cyan-500 mb-2">3,142</div>
                                                <div className="text-xs text-500">Files found on disk</div>
                                            </Card>
                                        </div>
                                        <div className="col-12 md:col-4 p-2">
                                            <Card className="text-center border-1 border-100 shadow-none py-3 h-full flex flex-column justify-content-center">
                                                <div className="text-xs font-bold text-500 uppercase mb-3">Indexed</div>
                                                <div className="text-3xl font-bold text-cyan-500">1,248</div>
                                            </Card>
                                        </div>
                                        <div className="col-12 md:col-4 p-2">
                                            <Card className="text-center border-1 border-100 shadow-none py-3 h-full flex flex-column justify-content-center">
                                                <div className="text-xs font-bold text-500 uppercase mb-3">Indexing Progress</div>
                                                <div className="text-3xl font-bold text-cyan-500 mb-2">40%</div>
                                                <div className="w-full bg-gray-200 border-round overflow-hidden" style={{ height: '6px' }}>
                                                    <div className="h-full bg-cyan-500" style={{ width: '40%' }}></div>
                                                </div>
                                                <div className="text-xs text-500 mt-2">1,248 of 3,142 files</div>
                                            </Card>
                                        </div>
                                    </div>
                                    
                                    <div className="w-full">
                                        <Card className="border-1 border-100 shadow-none p-2">
                                            <div className="text-center font-bold text-900 mb-4">File Type Distribution</div>
                                            <div className="flex align-items-center justify-content-center">
                                                <div style={{ position: 'relative', width: '220px', height: '220px', margin: '0 auto' }}>
                                                    <Chart 
                                                        type="doughnut" 
                                                        data={chartData} 
                                                        options={chartOptions} 
                                                        plugins={[centerTextPlugin]}
                                                    />
                                                </div>
                                            </div>
                                        </Card>
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
