'use client';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import logo from '@/app/icon.svg';

export interface ArticleMeta {
    title: string;
    description: string;
    author?: string;
    datePublished: string;
    dateModified?: string;
    keywords?: string[];
}

interface ArticleLayoutProps {
    meta: ArticleMeta;
    children: React.ReactNode;
}

/**
 * Reusable layout wrapper for all SEO articles.
 * Provides breadcrumbs, article header, JSON-LD structured data, and a CTA footer.
 */
export const ArticleLayout: React.FC<ArticleLayoutProps> = ({ meta, children }) => {
    const {
        title,
        description,
        author = 'Hamza Abbad',
        datePublished,
        dateModified,
        keywords = [],
    } = meta;

    const articleJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description,
        author: {
            '@type': 'Person',
            name: author,
        },
        publisher: {
            '@type': 'Organization',
            name: 'File Brain',
            logo: {
                '@type': 'ImageObject',
                url: 'https://file-brain.com/icon.svg',
            },
        },
        datePublished,
        dateModified: dateModified ?? datePublished,
        keywords: keywords.join(', '),
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': 'https://file-brain.com',
        },
    };

    return (
        <>
            {/* JSON-LD Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
            />

            <div className="article-page">
                {/* Breadcrumb */}
                <nav className="article-breadcrumb landing-container" aria-label="Breadcrumb">
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
                            <Link href="/guides/" className="text-500 hover:text-900 transition-colors text-sm">
                                Guides
                            </Link>
                        </li>
                        <li className="text-500 text-sm" aria-hidden="true">
                            <i className="fa-solid fa-chevron-right text-xs" />
                        </li>
                        <li>
                            <span className="text-sm font-medium" style={{ color: 'var(--primary-color)' }}>
                                {title}
                            </span>
                        </li>
                    </ol>
                </nav>

                {/* Article Header */}
                <header className="article-header landing-container">
                    <h1 className="article-title">{title}</h1>
                    <p className="article-description">{description}</p>
                    <div className="flex align-items-center gap-3 mt-4">
                        <Image src={logo} alt="File Brain logo" width={28} height={28} />
                        <div>
                            <span className="font-semibold text-sm" style={{ color: 'var(--text-color)' }}>
                                {author}
                            </span>
                            <span className="text-500 text-sm ml-2">·</span>
                            <time
                                dateTime={datePublished}
                                className="text-500 text-sm ml-2"
                            >
                                {new Date(datePublished).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                            </time>
                        </div>
                    </div>
                </header>

                {/* Article Body */}
                <article className="article-body landing-container">
                    {children}
                </article>

                {/* CTA Footer */}
                <aside className="article-cta landing-container">
                    <div className="article-cta-inner">
                        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-color)' }}>
                            Ready to search smarter?
                        </h2>
                        <p className="mb-4" style={{ color: 'var(--text-color-secondary)' }}>
                            File Brain is free and open-source. Start indexing your drive today.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <a
                                href="https://github.com/Hamza5/file-brain"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="article-cta-btn-primary"
                            >
                                <i className="fa-brands fa-github mr-2" />
                                Get Started Free
                            </a>
                            <Link href="/" className="article-cta-btn-secondary">
                                Learn More
                            </Link>
                        </div>
                    </div>
                </aside>
            </div>
        </>
    );
};
