import { ArticleLayout } from '@/components/ArticleLayout';
import { ComparisonTable } from '@/components/ComparisonTable';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Local Semantic Search: A Practical Guide | File Brain',
    description: 'Learn how local semantic search transforms document retrieval by matching queries to concepts rather than keywords. Discover how File Brain uses vector embeddings and OCR to find your files privately and offline.',
    keywords: [
        'local semantic search',
        'desktop document retrieval',
        'offline OCR',
        'vector embeddings',
        'file search engine',
        'semantic search vs keyword search',
        'privacy-first search',
        'local AI search',
    ],
    authors: [{ name: 'Hamza Abbad' }],
    openGraph: {
        type: 'article',
        title: 'Local Semantic Search: A Practical Guide',
        description: 'How File Brain uses vector embeddings and OCR to find your files privately and offline.',
        url: 'https://file-brain.com/guides/local-semantic-search/',
        siteName: 'File Brain',
        images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Local Semantic Search: A Practical Guide',
        description: 'How File Brain uses vector embeddings and OCR to find your files privately and offline.',
        images: ['/og-image.png'],
    },
    alternates: {
        canonical: 'https://file-brain.com/guides/local-semantic-search/',
    },
};

export const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'What is local semantic search?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Local semantic search transforms document retrieval by matching queries to concepts rather than just keywords. Unlike traditional tools that rely on exact filenames, it uses vector embeddings to understand the meaning of your files entirely on your own machine, without sending data to the cloud.',
            },
        },
        {
            '@type': 'Question',
            name: 'How is semantic search different from keyword search?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Keyword (lexical) search matches exact text strings. If you search for "ticket" but the file is named "invoice", you find nothing. Semantic search maps queries to a vector space of meaning, so searching for "airplane ticket" finds a file named "booking_conf.pdf" because the engine understands the context of the document.',
            },
        },
        {
            '@type': 'Question',
            name: 'Is File Brain completely offline?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. File Brain runs 100% locally on your machine. No data ever leaves your computer. It uses a local containerized engine (Typesense + Apache Tika) to achieve AI-powered search without any cloud dependency.',
            },
        },
        {
            '@type': 'Question',
            name: 'Does File Brain support scanned documents and images?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. File Brain has built-in OCR (Optical Character Recognition) powered by Apache Tika, which can extract text from scanned PDFs and over 1,000 file formats. The Pro version adds image understanding, allowing you to search photos by their visual content.',
            },
        },
    ],
};

const meta = {
    title: 'Local Semantic Search: A Practical Guide',
    description: 'Local semantic search transforms document retrieval by matching queries to concepts rather than just keywords. File Brain uses vector embeddings and OCR to understand the meaning of your files — entirely offline.',
    datePublished: '2026-02-18',
    keywords: [
        'local semantic search',
        'desktop document retrieval',
        'offline OCR',
        'vector embeddings',
        'privacy-first search',
    ],
};

const comparisonHeaders = ['Feature', 'File Brain', 'Everything / Listary', 'Windows Search', 'Copernic'];
const comparisonRows = [
    {
        feature: 'Search Type',
        fileBrain: 'Semantic (Meaning)',
        fileBrainHighlight: true,
        competitors: ['Lexical (Filename)', 'Metadata / Lexical', 'Partial Content'],
    },
    {
        feature: 'OCR Support',
        fileBrain: 'Yes (Built-in)',
        fileBrainHighlight: true,
        competitors: ['No', 'Limited', 'Paid Only'],
    },
    {
        feature: 'Privacy',
        fileBrain: '100% Local',
        fileBrainHighlight: false,
        competitors: ['Local', 'Local', 'Local'],
    },
    {
        feature: 'Format Support',
        fileBrain: '1,000+ Formats',
        fileBrainHighlight: true,
        competitors: ['Filenames Only', 'Limited', '~170 Formats'],
    },
    {
        feature: 'AI-Powered',
        fileBrain: 'Yes (Vector Embeddings)',
        fileBrainHighlight: true,
        competitors: ['No', 'No', 'No'],
    },
    {
        feature: 'Cost',
        fileBrain: 'Free & Open Source',
        fileBrainHighlight: true,
        competitors: ['Free / Paid', 'Free (Windows)', 'Paid'],
    },
];

export default function LocalSemanticSearchGuide() {
    return (
        <>
            {/* FAQ JSON-LD */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
            <ArticleLayout meta={meta}>
                {/* ── A. Executive Summary ── */}
                <section aria-label="Executive Summary">
                    <blockquote>
                        <p>
                            Local semantic search transforms document retrieval by matching queries to <strong>concepts</strong> rather than just keywords.
                            Unlike traditional tools that rely on exact filenames, File Brain uses <strong>vector embeddings</strong> and <strong>optical character recognition (OCR)</strong> to understand the meaning of your files — entirely offline.
                            This ensures enterprise-grade retrieval speed and absolute data privacy without uploading sensitive documents to the cloud.
                        </p>
                    </blockquote>
                </section>

                {/* Hero screenshot — File Brain search interface */}
                <div style={{ margin: '1.5rem 0 2rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                    <Image
                        src="https://raw.githubusercontent.com/hamza5/file-brain/main/docs/images/search.png"
                        alt="File Brain search interface showing semantic search results"
                        width={1200}
                        height={750}
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                        priority
                    />
                </div>

                {/* ── B. The Problem ── */}
                <h2>The Problem: Lexical vs. Semantic Search</h2>

                <p>
                    Professionals spend minutes — or hours — searching for files because they can&apos;t remember the exact filename.
                    This is not a personal failing. It is a fundamental limitation of how traditional search tools work.
                </p>

                <h3>Why Traditional Tools Fail</h3>

                <p>
                    Standard OS search (Windows Search, macOS Spotlight) and popular tools like <strong>Everything</strong> or <strong>Listary</strong> rely on <strong>lexical search</strong> — they match exact text strings.
                    If you search for <code>ticket</code> but the file is named <code>invoice_2024.pdf</code>, you find nothing.
                    If you search for <code>liability clause</code> but the document is a scanned image, the search engine cannot read it at all.
                </p>

                <h3>The Semantic Search Solution</h3>

                <p>
                    Semantic search maps both your query and your documents into a <strong>vector space of meaning</strong>.
                    Words and concepts that are related end up close together in this space.
                    Searching for <code>airplane ticket</code> finds a file named <code>booking_conf.pdf</code> because the engine understands the <em>context</em> of the document — not just its filename.
                </p>

                <p>
                    This is the technology that powers File Brain. Every document you index is converted into a vector embedding that captures its meaning.
                    When you search, your query is converted into the same vector space, and the closest documents are returned — regardless of what they are named.
                </p>

                {/* Diagram: vector space / semantic search concept */}
                <div style={{ margin: '2rem auto', maxWidth: '800px', padding: '1rem', background: 'var(--surface-card)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                    <Image
                        src="/semantic-search-diagram.svg"
                        alt="Diagram showing semantic vector space: query and document points are close together based on meaning"
                        width={1200}
                        height={675}
                        style={{ width: '100%', height: 'auto' }}
                    />
                    <p className="text-sm text-center text-500 mt-3" style={{ color: 'var(--text-color-secondary)' }}>
                        Concept: Documents and queries are mapped to a vector space where meaning determines distance.
                    </p>
                </div>

                {/* ── C. Local-First Architecture ── */}
                <h2>Local-First Architecture: Privacy &amp; Speed</h2>

                <p>
                    Most AI-powered search tools achieve their intelligence by sending your documents to a cloud server.
                    File Brain takes a fundamentally different approach: <strong>everything runs on your machine</strong>.
                </p>

                <h3>Why Privacy Matters</h3>

                <p>
                    For legal professionals, medical practitioners, researchers, and developers, the documents on their computers are often confidential.
                    Uploading them to a third-party server — even for the purpose of indexing — is a significant security and compliance risk.
                </p>

                <p>
                    File Brain&apos;s local-first architecture means:
                </p>

                <ul>
                    <li><strong>No data leaves your machine.</strong> Your documents are indexed and searched entirely on your own hardware.</li>
                    <li><strong>No account required.</strong> There is no cloud service to sign up for or pay a subscription to.</li>
                    <li><strong>Works offline.</strong> File Brain functions without an internet connection after the initial setup.</li>
                </ul>

                <h3>The Local Engine: Typesense + Apache Tika</h3>

                <p>
                    To achieve AI-powered search without a cloud server, File Brain uses a local containerized engine running via Docker:
                </p>

                <ul>
                    <li><strong>Apache Tika</strong> — extracts text from over 1,000 file formats, including scanned PDFs (via OCR), Word documents, spreadsheets, and more.</li>
                    <li><strong>Typesense</strong> — a fast, open-source search engine that stores and queries the vector embeddings generated from your documents.</li>
                </ul>

                <p>
                    The Docker requirement is a feature, not a bug. It is the mechanism that allows File Brain to run a powerful AI search engine locally, with complete data sovereignty.
                    Think of it as installing a private search engine on your own computer.
                </p>

                {/* ── D. Comparison Table ── */}
                <h2>How File Brain Compares</h2>

                <p>
                    The table below compares File Brain to the most popular desktop search alternatives.
                    File Brain is the only tool in this category that combines semantic search, built-in OCR, and 100% local processing for free.
                </p>

                <ComparisonTable
                    headers={comparisonHeaders}
                    rows={comparisonRows}
                    caption="Feature comparison of popular desktop search tools (February 2026)"
                />

                {/* App UI screenshot — showing the search results list */}
                {/* ── E. Use Cases ── */}
                <h2>Who Benefits Most from Local Semantic Search?</h2>

                <p>
                    File Brain is built for anyone who manages a large collection of documents. Here are the personas who benefit most:
                </p>

                <h3>Legal Professionals</h3>
                <p>
                    Find <em>liability clauses</em> in scanned evidence without knowing the exact wording. Search across hundreds of case files by concept, not filename.
                    File Brain&apos;s OCR support means even scanned court documents become fully searchable.
                </p>

                <h3>Academics &amp; Researchers</h3>
                <p>
                    Search a library of 1,000+ unnamed PDFs for a specific theory or author argument.
                    Stop wasting time manually opening files to find the one that contains the quote you need.
                </p>

                <h3>Business Professionals</h3>
                <p>
                    Find contracts, invoices, and reports by their content — not by remembering what you named them three years ago.
                    File Brain works across all your folders, drives, and document types simultaneously.
                </p>

                {/* ── F. Soft Sell ── */}
                <h2>Going Further: The Media Suite Pro</h2>

                <p>
                    The free version of File Brain extracts text from documents and makes them semantically searchable.
                    The <Link href="/#pro" className="article-link"><strong>Media Suite Pro</strong></Link> upgrade extends this capability to visual content:
                </p>

                <ul>
                    <li>Search for <code>birthday cake</code> and find photos that contain a cake — even if they have no filename or text metadata.</li>
                    <li>Index screenshots, diagrams, and presentation slides by their visual content.</li>
                    <li>Combine text and image search in a single query.</li>
                </ul>

                <p>
                    Pro is available as a <strong>one-time payment</strong> (perpetual license) — not a recurring subscription.
                    You pay once and own it forever. <Link href="/#pro" className="article-link">Learn more about Pro →</Link>
                </p>

                {/* ── G. FAQ ── */}
                <h2>Frequently Asked Questions</h2>

                <h3>What is local semantic search?</h3>
                <p>
                    Local semantic search transforms document retrieval by matching queries to concepts rather than just keywords.
                    Unlike traditional tools that rely on exact filenames, it uses vector embeddings to understand the meaning of your files entirely on your own machine, without sending data to the cloud.
                </p>

                <h3>How is semantic search different from keyword search?</h3>
                <p>
                    Keyword (lexical) search matches exact text strings. If you search for <code>ticket</code> but the file is named <code>invoice</code>, you find nothing.
                    Semantic search maps queries to a vector space of meaning, so searching for <code>airplane ticket</code> finds a file named <code>booking_conf.pdf</code> because the engine understands the context of the document.
                </p>

                <h3>Is File Brain completely offline?</h3>
                <p>
                    Yes. File Brain runs 100% locally on your machine. No data ever leaves your computer.
                    It uses a local containerized engine (Typesense + Apache Tika) to achieve AI-powered search without any cloud dependency.
                </p>

                <h3>Does File Brain support scanned documents and images?</h3>
                <p>
                    Yes. File Brain has built-in OCR powered by Apache Tika, which can extract text from scanned PDFs and over 1,000 file formats.
                    The <Link href="/#pro" className="article-link">Pro version</Link> adds image understanding, allowing you to search photos by their visual content.
                </p>

                <hr style={{ margin: '3rem 0', borderColor: 'var(--surface-border)' }} />

                <p>
                    <em>Setting up OCR search for the first time? Read our <Link href="/guides/offline-scanned-document-search/" className="article-link">Practical Guide to Searching Scanned Documents and PDFs Offline</Link>.</em>
                </p>
            </ArticleLayout>
        </>
    );
}
