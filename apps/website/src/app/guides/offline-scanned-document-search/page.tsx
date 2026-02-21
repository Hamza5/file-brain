import { ArticleLayout } from '@/components/ArticleLayout';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'A Practical Guide to Searching Scanned Documents and PDFs Offline | File Brain',
    description: 'Learn how to find specific information inside scanned documents and images using local Optical Character Recognition (OCR) and semantic search — entirely offline, ensuring absolute data privacy.',
    keywords: [
        'offline document search engine',
        'find lost scanned invoice',
        'extract text from offline scanned PDFs on Windows',
        'local OCR search',
        'scanned PDF search',
        'privacy-first search',
        'desktop document retrieval'
    ],
    authors: [{ name: 'Hamza Abbad' }],
    openGraph: {
        type: 'article',
        title: 'A Practical Guide to Searching Scanned Documents and PDFs Offline',
        description: 'How to index and search your scanned files offline using local OCR and semantic search.',
        url: 'https://file-brain.com/guides/offline-scanned-document-search/',
        siteName: 'File Brain',
        images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'A Practical Guide to Searching Scanned Documents and PDFs Offline',
        description: 'How to index and search your scanned files offline using local OCR and semantic search.',
        images: ['/og-image.png'],
    },
    alternates: {
        canonical: 'https://file-brain.com/guides/offline-scanned-document-search/',
    },
};

export const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Search Scanned Documents and PDFs Offline',
    description: 'A step-by-step guide to setting up a local document search engine that uses OCR to find text inside scanned files without uploading them to the cloud.',
    step: [
        {
            '@type': 'HowToStep',
            name: 'Initialization',
            text: 'Run the File Brain setup wizard to perform a system check, download necessary components, and initialize the local containerized engine.',
        },
        {
            '@type': 'HowToStep',
            name: 'Indexing',
            text: 'Add the folders you want to search through and manually click the "Index" button to begin extracting text and creating vector embeddings locally.',
        },
        {
            '@type': 'HowToStep',
            name: 'The First Search',
            text: 'Type a conceptual phrase (like "Flight ticket") in the search bar to find documents based on their meaning, even if they are scanned images or poorly named.',
        },
    ],
};

export const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'File Brain',
    applicationCategory: 'DesktopEnvironmentApplication',
    operatingSystem: 'Windows, macOS, Linux',
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
    },
};

const meta = {
    title: 'A Practical Guide to Searching Scanned Documents and PDFs Offline',
    description: 'Finding specific information inside scanned documents and images requires Optical Character Recognition (OCR). This practical guide explains how to index and search your scanned files entirely offline.',
    datePublished: '2026-02-21',
    keywords: [
        'offline document search engine',
        'find lost scanned invoice',
        'extract text from offline scanned PDFs on Windows',
        'local OCR search',
    ],
};



export default function OfflineScannedDocumentSearchGuide() {
    return (
        <>
            {/* Structured Data JSON-LD */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
            />
            
            <ArticleLayout meta={meta}>
                {/* ── A. The Executive Summary (AI Search Hook) ── */}
                <section aria-label="Executive Summary">
                    <blockquote>
                        <p>
                            Finding specific information inside scanned documents and images requires <strong>Optical Character Recognition (OCR)</strong>.
                            Traditional operating system searches cannot read text inside image-based PDFs, causing professionals to lose vital documents.
                            File Brain solves this by combining local OCR with semantic search, automatically extracting text from over 1,000 file formats on your machine.
                            This practical guide explains how to index and search your scanned files entirely offline, ensuring absolute data privacy.
                        </p>
                    </blockquote>
                </section>

                <p className="text-xl mb-5" style={{ color: 'var(--text-color-secondary)' }}>
                    We&apos;ve all been there: you know exactly what a document contains, but finding it feels impossible.
                    This is especially true for older contracts, physical invoices, or hastily scanned PDFs.
                </p>

                <div style={{ margin: '2rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'center', backgroundColor: 'var(--surface-50)' }}>
                    <Image
                        src="/invisible_text_problem.png"
                        alt="Abstract digital illustration representing the invisible text problem in scanned documents"
                        width={1024}
                        height={1024}
                        style={{ maxWidth: '100%', height: 'auto', maxHeight: '500px', objectFit: 'contain' }}
                    />
                </div>

                {/* ── B. The Pain Point: The &quot;Invisible&quot; Text Problem ── */}
                <h2>The Pain Point: The &quot;Invisible&quot; Text Problem</h2>

                <p>
                    Standard OS tools — like Windows Search or macOS Spotlight — and fast third-party apps — like <strong>Everything</strong> — rely almost entirely on file names or superficial metadata.
                    They look at the <em>shell</em> of the document, not its contents.
                </p>

                <p>
                    Imagine you need to find a specific <strong>&quot;liability clause&quot;</strong> in a scanned court document, or an urgent <strong>&quot;invoice&quot;</strong> from an old contractor.
                    If the file happens to be named <code>scan_00142_final.pdf</code> or <code>IMG_8392.jpg</code>, native search tools will return zero results.
                    To these tools, the text inside the image is effectively invisible. You are forced to manually open dozens of files, hoping you stumble upon the right one.
                </p>



                {/* ── C. The Local Solution & The Privacy Guarantee ── */}
                <h2>The Local Solution &amp; The Privacy Guarantee</h2>

                <p>
                    To solve this, a search engine needs to &quot;read&quot; the images using Optical Character Recognition (OCR).
                    While many cloud services offer this, uploading confidential invoices or legal contracts to a third-party server represents a significant privacy and security risk.
                </p>

                <h3>How File Brain Works</h3>
                <p>
                    Once installed, File Brain runs silently in the background. It utilizes an embedded version of <strong>Apache Tika</strong>
                    — an industry-standard toolkit for content detection and analysis — to process your files.
                </p>

                <div style={{ margin: '2rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'center', backgroundColor: 'var(--surface-50)' }}>
                    <Image
                        src="/local_processing_flowchart.png"
                        alt="Diagram showing scanned documents passing through Apache Tika (OCR) and being indexed by Typesense locally"
                        width={1024}
                        height={1024}
                        style={{ maxWidth: '100%', height: 'auto', maxHeight: '500px', objectFit: 'contain' }}
                    />
                </div>

                <h3>Reframing the Installation</h3>
                <p>
                    You will notice that File Brain requires Docker Desktop and Python 3.11+. This is undeniably more complex than installing a standard, lightweight app.
                    However, <strong>this friction is the ultimate privacy feature</strong>.
                </p>

                <p>
                    To achieve enterprise-grade OCR without uploading your sensitive data to the cloud, File Brain uses a local containerized engine.
                    This setup ensures absolute data sovereignty: your files never leave your machine, and your searches remain completely private.
                </p>

                {/* ── D. Step-by-Step Execution ── */}
                <h2>Step-by-Step Execution</h2>

                <p>
                    Setting up your private, OCR-capable search engine involves a straightforward initial process:
                </p>

                <h3>1. Initialization</h3>
                <p>
                    Upon launching File Brain for the first time, you are guided through a setup wizard.
                    This wizard performs a System Check, downloads the necessary Docker components, and initializes the local search engine.
                </p>

                <div style={{ margin: '2rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                    <Image
                        src="https://raw.githubusercontent.com/hamza5/file-brain/main/docs/images/wizard.png"
                        alt="File Brain initialization wizard performing system checks and downloading dependencies"
                        width={1200}
                        height={750}
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                    />
                </div>

                <h3>2. Managing Expectations: The Initial Indexing</h3>
                <p>
                    Once setup is complete, you will need to add the folders you want to search through and manually click the <strong>&quot;Index&quot;</strong> button to begin.
                    Because File Brain is performing complex OCR and generating vector embeddings locally, this initial process requires computational overhead and may take some time depending on the size of your document library.
                    <strong>Crucially, this is a one-time operation.</strong> Once indexed, future searches are practically instantaneous, and you can enable Auto-Index to keep things updated in the background.
                </p>

                <div style={{ margin: '2rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                    <Image
                        src="https://raw.githubusercontent.com/hamza5/file-brain/main/docs/images/dashboard.png"
                        alt="File Brain dashboard showing indexing progress and selected folders"
                        width={1200}
                        height={750}
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                    />
                </div>

                <h3>3. The First Search</h3>
                <p>
                    Now for the magic. Instead of trying to remember the exact file name, simply type a conceptual phrase into the search bar — like <code>&quot;Flight ticket&quot;</code>.
                    File Brain will instantly retrieve the correct document, even if it is a poorly named scanned PDF like <code>scan_00142_final.pdf</code>.
                </p>

                <div style={{ margin: '2rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                    <Image
                        src="https://raw.githubusercontent.com/hamza5/file-brain/main/docs/images/search.png"
                        alt="File Brain search interface retrieving relevant documents based on semantic meaning"
                        width={1200}
                        height={750}
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                        priority
                    />
                </div>

                {/* ── E. Contextual Upsell: Transitioning to the Pro Tier ── */}
                <h2>Beyond Text: The Media Suite Pro</h2>

                <p>
                    File Brain&apos;s free tier easily extracts readable text from your scanned documents. However, modern workflows often involve visual assets that contain no text at all.
                </p>

                <p>
                    If you need to search for evidentiary photographs, design assets, or specific video scenes, the <Link href="/#pro" className="article-link"><strong>Media Suite Pro</strong></Link> upgrades the engine to understand visual content.
                    This allows you to search for <code>&quot;birthday cake&quot;</code> and instantly retrieve photos containing a cake, even with absolutely no text metadata attached to the image files.
                </p>
                
                <p>
                    To ensure complete peace of mind, the Pro tier is offered as a <strong>perpetual license (a one-time payment)</strong>.
                    It is not a mandatory SaaS subscription, meaning you own the upgrade forever without recurring financial anxiety.
                </p>

                <hr style={{ margin: '3rem 0', borderColor: 'var(--surface-border)' }} />

                {/* ── F. Internal Linking ── */}
                <p>
                    <em>Want to learn more about the underlying technology? Read our comprehensive guide on <Link href="/guides/local-semantic-search/" className="article-link">Local Semantic Search</Link>.</em>
                </p>

            </ArticleLayout>
        </>
    );
}
