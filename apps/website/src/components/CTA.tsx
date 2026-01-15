'use client';
import React from 'react';
import { Button } from 'primereact/button';

export const CTA: React.FC = () => {
    return (
        <section className="cta-section py-8 text-center" style={{ backgroundColor: 'var(--primary-color)', color: 'var(--primary-color-text)' }}>
            <div className="landing-container">
                <div className="flex flex-column align-items-center">
                    <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">Ready to master your data?</h2>
                    <p className="text-xl mb-6 max-w-30rem mx-auto">
                        Get started with File Brain today and experience the future of local file search.
                    </p>
                    <div className="flex gap-3 justify-content-center">
                        <Button
                            label="Check Installation Instructions"
                            icon="fa-brands fa-github"
                            className="p-button-rounded p-button-lg shadow-4"
                            onClick={() => window.location.href = 'https://github.com/Hamza5/file-brain'}
                        />
                        <Button
                            label="Contact Us"
                            icon="fa-solid fa-envelope"
                            className="p-button-rounded p-button-lg shadow-4"
                            onClick={() => window.location.href = `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}?subject=File%20Brain%20Inquiry`}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
};
