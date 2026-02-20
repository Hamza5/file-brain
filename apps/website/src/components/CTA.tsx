'use client';
import React from 'react';
import { Button } from 'primereact/button';
import posthog from 'posthog-js';
import { useSectionTracking } from '@/hooks/useSectionTracking';

export const CTA: React.FC = () => {
    const sectionRef = useSectionTracking('cta');

    return (
        <section ref={sectionRef} className="cta-section py-8 text-center" style={{ backgroundColor: 'var(--primary-color)', color: 'var(--primary-color-text)' }}>
            <div className="landing-container">
                <div className="flex flex-column align-items-center">
                    <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--primary-color-text)' }}>Ready to find your files?</h2>
                    <p className="text-xl mb-6 max-w-30rem mx-auto">
                        Get started with File Brain today and experience the future of local file search.
                    </p>
                    <div className="flex flex-column sm:flex-row gap-3 justify-content-center w-full px-3">
                        <Button
                            label="Check Installation Instructions"
                            icon="fa-brands fa-github"
                            className="p-button-rounded p-button-lg shadow-4 w-full sm:w-auto"
                            onClick={() => {
                                posthog.capture('cta_check_installation_clicked', {
                                    location: 'cta_section',
                                    destination_url: 'https://github.com/Hamza5/file-brain',
                                });
                                window.location.href = 'https://github.com/Hamza5/file-brain';
                            }}
                        />
                        <Button
                            label="Contact Us"
                            icon="fa-solid fa-envelope"
                            className="p-button-rounded p-button-lg shadow-4 w-full sm:w-auto"
                            onClick={() => {
                                posthog.capture('cta_contact_us_clicked', {
                                    location: 'cta_section',
                                    subject: 'File Brain Inquiry',
                                });
                                window.location.href = `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}?subject=File%20Brain%20Inquiry`;
                            }}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
};
