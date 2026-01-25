'use client';
import React from 'react';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import posthog from 'posthog-js';
import { GithubStars } from './GithubStars';

export const Hero: React.FC = () => {
    return (
        <section className="hero-section text-center py-4">
            <div className="landing-container">
                <div className="flex flex-column align-items-center">
                    <div className="mb-4">
                        <Tag value="UNLOCK YOUR PRODUCTIVITY POTENTIAL" rounded severity="info" className="text-xs font-semibold tracking-wider px-3 py-2" style={{ backgroundColor: 'var(--surface-ground)', color: 'var(--primary-color)', border: '1px solid var(--surface-border)' }}></Tag>
                    </div>
                    
                    <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight" style={{ color: 'var(--text-color)', lineHeight: 1.1 }}>
                        Master Your Data with <span style={{ color: 'var(--primary-color)' }}>File Brain</span>
                    </h1>
                    
                    <p className="text-xl mb-6 max-w-30rem mx-auto" style={{ color: 'var(--text-color-secondary)' }}>
                        Empower your file search with AI-backed semantic intelligence. Find anything, anywhere, instantly.
                    </p>
                    
                    <div className="flex gap-3 justify-content-center mb-6">
                        <Button
                            label="Get Started"
                            icon="fa-brands fa-github"
                            className="p-button-rounded p-button-lg shadow-2"
                            onClick={() => {
                                posthog.capture('cta_get_started_clicked', {
                                    location: 'hero_section',
                                    destination_url: 'https://github.com/Hamza5/file-brain',
                                });
                                window.location.href = 'https://github.com/Hamza5/file-brain';
                            }}
                        />
                        <Button
                            label="Explore Features"
                            icon="fa-solid fa-arrow-down"
                            className="p-button-rounded p-button-outlined p-button-lg"
                            style={{ color: 'var(--primary-color)' }}
                            onClick={() => {
                                posthog.capture('cta_explore_features_clicked', {
                                    location: 'hero_section',
                                    target_section: 'features',
                                });
                                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                        />
                        <Button
                            label="See File Brain in Action"
                            icon="fa-solid fa-play"
                            className="p-button-rounded p-button-outlined p-button-lg"
                            style={{ color: 'var(--primary-color)' }}
                            onClick={() => {
                                posthog.capture('cta_see_action_clicked', {
                                    location: 'hero_section',
                                    target_section: 'demo',
                                });
                                document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                        />
                    </div>

                    <div className="mt-2 animate-fade-in transition-all transition-duration-500">
                        <GithubStars />
                    </div>
                </div>
            </div>
        </section>
    );
};
