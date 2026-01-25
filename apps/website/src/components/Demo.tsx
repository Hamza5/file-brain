'use client';
import React from 'react';
import { Button } from 'primereact/button';
import posthog from 'posthog-js';
import { useSectionTracking } from '@/hooks/useSectionTracking';

export const Demo: React.FC = () => {
    const sectionRef = useSectionTracking('demo');

    return (
        <section id="demo" ref={sectionRef} className="demo-section py-8" style={{ backgroundColor: 'var(--surface-section)' }}>
            <div className="landing-container">
                <div className="text-center mb-6">
                    <span className="font-bold uppercase tracking-widest text-sm" style={{ color: 'var(--primary-color)' }}>See it in action</span>
                    <h2 className="text-4xl md:text-5xl font-bold mt-2 mb-4" style={{ color: 'var(--text-color)' }}>
                        Experience the Power of <span style={{ color: 'var(--primary-color)' }}>Semantic Search</span>
                    </h2>
                    <p className="text-xl mb-6 max-w-40rem mx-auto" style={{ color: 'var(--text-color-secondary)' }}>
                        Stop searching for filenames. Watch how File Brain finds exactly what you mean, indexing your documents, photos, and spreadsheets locally and privately.
                    </p>
                </div>

                <div className="flex justify-content-center px-2 md:px-0">
                    <div className="relative w-full max-w-5xl shadow-8 border-round-2xl overflow-hidden bg-black-alpha-90 border-1 border-white-alpha-10" style={{ 
                        aspectRatio: '16/9',
                        boxShadow: '0 25px 50px -12px rgba(0, 122, 255, 0.25)'
                    }}>
                        <iframe
                            width="100%"
                            height="100%"
                            src="https://www.youtube.com/embed/XinfAjYiKSc?autoplay=0&rel=0"
                            title="File Brain Demo"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="absolute top-0 left-0 w-full h-full"
                            onClick={() => {
                                posthog.capture('video_demo_click_to_play', {
                                    video_url: 'https://youtu.be/XinfAjYiKSc'
                                });
                            }}
                        ></iframe>
                    </div>
                </div>

                <div className="text-center mt-8">
                    <div className="p-5 surface-card border-round-2xl border-1 border-surface-border shadow-2 inline-flex flex-column align-items-center">
                        <h3 className="text-2xl font-bold mb-3">Ready to master your data?</h3>
                        <p className="mb-4 text-color-secondary">Join thousands of users who have reclaimed their digital life.</p>
                        <Button
                            label="Get Started Now"
                            icon="fa-brands fa-github"
                            className="p-button-rounded p-button-lg shadow-4"
                            onClick={() => {
                                posthog.capture('cta_demo_bottom_get_started_clicked', {
                                    location: 'demo_section',
                                    destination_url: 'https://github.com/Hamza5/file-brain',
                                });
                                window.location.href = 'https://github.com/Hamza5/file-brain';
                            }}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
};
