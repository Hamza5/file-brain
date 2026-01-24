'use client';
import React from 'react';
import { useSectionTracking } from '@/hooks/useSectionTracking';

const features = [
    {
        icon: 'fa-solid fa-wand-magic-sparkles',
        title: 'Typo Resistance',
        description: 'Robust against typos. Search for "iphone" even if you typed "ipnone" and still get perfect results.'
    },
    {
        icon: 'fa-solid fa-brain',
        title: 'Semantic Intelligence',
        description: 'Search by concepts, meanings, and context—not just matching exact keywords.'
    },
    {
        icon: 'fa-solid fa-file-circle-check',
        title: 'Extensive Format Support',
        description: 'Supports over 1400+ file formats including documents, archives, and binary files.'
    },
    {
        icon: 'fa-solid fa-language',
        title: 'Cross-Language Search',
        description: 'Search in one language and find documents written in another automatically.'
    },
    {
        icon: 'fa-solid fa-expand',
        title: 'OCR & Image Analysis',
        description: 'Find text inside screenshots, scanned documents, and images effortlessly.'
    },
    {
        icon: 'fa-solid fa-shield-halved',
        title: 'Privacy First',
        description: 'Your data never leaves your machine. All indexing and processing stays local and secure.'
    }
];

export const Features: React.FC = () => {
    const sectionRef = useSectionTracking('features');

    return (
        <section id="features" ref={sectionRef} className="features-section py-8" style={{ backgroundColor: 'var(--surface-ground)' }}>
            <div className="landing-container">
                <div className="text-center mb-8">
                    <span className="font-bold uppercase tracking-widest text-sm" style={{ color: 'var(--primary-color)' }}>Powerful Capabilities</span>
                    <h2 className="text-4xl md:text-5xl font-bold mt-2" style={{ color: 'var(--text-color)' }}>
                        Everything you need to <span style={{ color: 'var(--primary-color)' }}>master your data</span>
                    </h2>
                </div>
                <div className="grid">
                    {features.map((feature, index) => (
                        <div key={index} className="col-12 md:col-6 lg:col-4 p-3">
                            <div className="p-4 bg-white border-round-xl shadow-1 hover:shadow-3 transition-all transition-duration-300 h-full border-1 border-transparent flex flex-column align-items-center text-center">
                                <div className="w-4rem h-4rem border-round-2xl flex align-items-center justify-content-center mb-4" style={{ backgroundColor: 'var(--surface-ground)', color: 'var(--primary-color)' }}>
                                    <i className={`${feature.icon} text-2xl`} style={{ color: 'var(--primary-color)' }}></i>
                                </div>
                                <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-color)' }}>{feature.title}</h3>
                                <p className="mb-0" style={{ color: 'var(--text-color-secondary)' }}>{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
