import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Guides — Local Search & Document Retrieval | File Brain',
    description: 'In-depth guides on local semantic search, document retrieval, OCR, and privacy-first file management. Learn how to find any file on your computer instantly.',
    openGraph: {
        title: 'Guides — Local Search & Document Retrieval | File Brain',
        description: 'In-depth guides on local semantic search, document retrieval, OCR, and privacy-first file management.',
        url: 'https://file-brain.com/guides/',
        siteName: 'File Brain',
    },
    alternates: {
        canonical: 'https://file-brain.com/guides/',
    },
};

interface GuideCard {
    href: string;
    title: string;
    description: string;
    date: string;
    tags: string[];
    readTime: string;
}

const GUIDES: GuideCard[] = [
    {
        href: '/guides/local-semantic-search/',
        title: 'The Ultimate Guide to Local Semantic Search',
        description: 'Learn how local semantic search transforms document retrieval by matching queries to concepts rather than keywords. Discover how File Brain uses vector embeddings and OCR to find your files privately and offline.',
        date: '2026-02-18',
        tags: ['Semantic Search', 'Privacy', 'OCR'],
        readTime: '8 min read',
    },
    // Add new guides here as they are published
];

export default function GuidesIndex() {
    return (
        <main className="guides-page">
            {/* Header */}
            <header className="guides-header landing-container">
                <nav aria-label="Breadcrumb" className="mb-4">
                    <ol className="flex align-items-center gap-2 list-none p-0 m-0">
                        <li>
                            <Link href="/" className="text-500 hover:text-900 transition-colors text-sm">
                                Home
                            </Link>
                        </li>
                        <li className="text-500 text-sm" aria-hidden="true">
                            <i className="fa-solid fa-chevron-right text-xs" />
                        </li>
                        <li>
                            <span className="text-sm font-medium" style={{ color: 'var(--primary-color)' }}>
                                Guides
                            </span>
                        </li>
                    </ol>
                </nav>

                <h1 className="text-4xl font-bold mb-3" style={{ color: 'var(--text-color)' }}>
                    Guides
                </h1>
                <p className="text-xl" style={{ color: 'var(--text-color-secondary)', maxWidth: '600px' }}>
                    In-depth guides on local semantic search, document retrieval, OCR, and privacy-first file management.
                </p>
            </header>

            {/* Guide Cards */}
            <section className="landing-container" aria-label="All guides">
                {GUIDES.map((guide) => (
                    <Link key={guide.href} href={guide.href} className="guide-card">
                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mb-3">
                            {guide.tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="text-xs font-semibold px-2 py-1"
                                    style={{
                                        backgroundColor: 'var(--surface-100)',
                                        color: 'var(--primary-color)',
                                        borderRadius: '4px',
                                        border: '1px solid var(--surface-border)',
                                    }}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>

                        {/* Title */}
                        <h2
                            className="text-2xl font-bold mb-2"
                            style={{ color: 'var(--text-color)', lineHeight: 1.3 }}
                        >
                            {guide.title}
                        </h2>

                        {/* Description */}
                        <p className="mb-3" style={{ color: 'var(--text-color-secondary)', lineHeight: 1.6 }}>
                            {guide.description}
                        </p>

                        {/* Meta */}
                        <div className="flex align-items-center gap-3 text-sm" style={{ color: 'var(--text-color-secondary)' }}>
                            <span>
                                <i className="fa-regular fa-calendar mr-1" />
                                {new Date(guide.date).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                            </span>
                            <span>·</span>
                            <span>
                                <i className="fa-regular fa-clock mr-1" />
                                {guide.readTime}
                            </span>
                            <span className="ml-auto font-semibold" style={{ color: 'var(--primary-color)' }}>
                                Read guide <i className="fa-solid fa-arrow-right ml-1 text-xs" />
                            </span>
                        </div>
                    </Link>
                ))}
            </section>
        </main>
    );
}
