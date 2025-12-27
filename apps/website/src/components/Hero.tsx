'use client';
import React from 'react';
import { Button } from 'primereact/button';

export const Hero: React.FC = () => {
    return (
        <section className="hero-section text-center py-4">
            <div className="landing-container">
                <div className="flex flex-column align-items-center">
                    <div className="inline-flex align-items-center px-3 py-1 border-round-3xl bg-cyan-50 border-1 border-cyan-100 mb-4">
                        <span className="text-cyan-600 font-semibold text-xs uppercase tracking-wider">Unlock your productivity potential</span>
                    </div>
                    <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight" style={{ color: 'var(--text-color)', lineHeight: 1.1 }}>
                        Master Your Data with <span className="text-cyan-500">File Brain</span>
                    </h1>
                    <p className="text-xl text-64748b mb-6 max-w-30rem mx-auto" style={{ color: 'var(--text-color-secondary)' }}>
                        Empower your file search with AI-backed semantic intelligence. Find anything, anywhere, instantly.
                    </p>
                    <div className="flex gap-3 justify-content-center mb-6">
                        <Button label="Get Started" className="p-button-rounded p-button-lg shadow-2" style={{ backgroundColor: 'var(--primary-color)', borderColor: 'var(--primary-color)' }} />
                        <Button label="See it in Action" className="p-button-rounded p-button-outlined p-button-lg" style={{ color: 'var(--primary-color)' }} />
                    </div>
                </div>
            </div>
        </section>
    );
};
