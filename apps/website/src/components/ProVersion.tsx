'use client';
import React from 'react';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Badge } from 'primereact/badge';

export const ProVersion = () => {
    return (
        <section className="py-8" style={{ backgroundColor: 'var(--surface-ground)' }}>
            <div className="landing-container">
                <div className="text-center mb-8">
                    <div className="mb-3">
                        <Tag value="GO PRO" rounded severity="info" className="text-sm font-bold tracking-widest px-3 py-2" style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)', color: 'var(--primary-color)' }}></Tag>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-bold mt-2" style={{ color: 'var(--text-color)' }}>
                        Want more of <span style={{ color: 'var(--primary-color)' }}>File Brain</span>?
                    </h2>
                    <p className="text-xl mt-4 max-w-2xl mx-auto" style={{ color: 'var(--text-color-secondary)' }}>
                        Check out the <Tag value="Pro" rounded severity="info" className="px-2 py-0 text-base align-middle mx-1 uppercase" style={{ backgroundColor: 'var(--primary-color)', color: 'white' }}></Tag> version for advanced capabilities like chatting with files and video search.
                    </p>
                </div>

                <div className="grid">
                    <div className="col-12 lg:col-6 p-4">
                        <div className="flex flex-column gap-6">
                            <div className="flex gap-4">
                                <div className="w-4rem h-4rem border-round-xl flex align-items-center justify-content-center flex-shrink-0" style={{ backgroundColor: 'white', color: 'var(--primary-color)', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }}>
                                    <i className="fa-solid fa-comments text-2xl"></i>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-color)' }}>Chat with Files</h3>
                                    <p className="m-0" style={{ color: 'var(--text-color-secondary)' }}>
                                        Instead of just searching, have a conversation with your documents. <b style={{ color: 'var(--primary-color)' }}>File Brain</b><sup><Badge value="PRO" severity="info" className="text-xs px-1" style={{ backgroundColor: 'var(--primary-color)', color: 'white', transform: 'scale(0.8)' }}></Badge></sup> reads relevant files and answers your questions directly.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-4rem h-4rem border-round-xl flex align-items-center justify-content-center flex-shrink-0" style={{ backgroundColor: 'white', color: 'var(--primary-color)', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }}>
                                    <i className="fa-solid fa-file-invoice text-2xl"></i>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-color)' }}>Search by File</h3>
                                    <p className="m-0" style={{ color: 'var(--text-color-secondary)' }}>
                                        Select a file to find semantically similar documents instantly. Perfect for finding related research or documentation.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-4rem h-4rem border-round-xl flex align-items-center justify-content-center flex-shrink-0" style={{ backgroundColor: 'white', color: 'var(--primary-color)', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }}>
                                    <i className="fa-solid fa-video text-2xl"></i>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-color)' }}>Video Search</h3>
                                    <p className="m-0" style={{ color: 'var(--text-color-secondary)' }}>
                                        Find specific scenes in your video collection using text queries or even image inputs.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-4rem h-4rem border-round-xl flex align-items-center justify-content-center flex-shrink-0" style={{ backgroundColor: 'white', color: 'var(--primary-color)', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }}>
                                    <i className="fa-solid fa-cloud text-2xl"></i>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-color)' }}>Cloud & Network Drives</h3>
                                    <p className="m-0" style={{ color: 'var(--text-color-secondary)' }}>
                                        Connect popular cloud providers like Google Drive, Dropbox, and Box, or add any network drive to your search index.
                                    </p>
                                </div>
                            </div>

                             <div className="flex gap-4">
                                <div className="w-4rem h-4rem border-round-xl flex align-items-center justify-content-center flex-shrink-0" style={{ backgroundColor: 'white', color: 'var(--primary-color)', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }}>
                                    <i className="fa-solid fa-wand-magic-sparkles text-2xl"></i>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-color)' }}>Preorder Bonus</h3>
                                    <p className="m-0" style={{ color: 'var(--text-color-secondary)' }}>
                                        Get your custom feature requests prioritized during the preorder period.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-12 lg:col-6 p-4">
                        <div className="h-full p-6 border-round-2xl text-center flex flex-column justify-content-center align-items-center" 
                             style={{ backgroundColor: 'white', boxShadow: '0 8px 30px rgba(0,0,0,0.04)' }}>
                            <div className="mb-4">
                                <Tag value="LIMITED TIME OFFER" rounded severity="warning" className="text-sm font-bold tracking-widest px-3 py-2"></Tag>
                            </div>
                            <h3 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-color)' }}>Lifetime Deal</h3>
                            <p className="text-lg mb-6 max-w-sm mx-auto" style={{ color: 'var(--text-color-secondary)' }}>
                                Available only for preorder users. After launch, <b style={{ color: 'var(--primary-color)' }}>File Brain</b><sup><Badge value="PRO" severity="info" className="text-xs font-bold px-1" style={{ backgroundColor: 'var(--primary-color)', color: 'white', transform: 'scale(0.8)' }}></Badge></sup> will be a subscription-based product.
                            </p>
                            
                            <Button
                                label="Contact to Preorder"
                                icon="fa-solid fa-envelope"
                                className="p-button-rounded p-button-lg shadow-2"
                                onClick={() => window.location.href = 'mailto:contact@filebrain.com?subject=File%20Brain%20Pro%20Preorder'}
                            />
                            
                            <p className="mt-4 text-sm" style={{ color: 'var(--text-color-secondary)' }}>
                                Secure your lifetime access today
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
