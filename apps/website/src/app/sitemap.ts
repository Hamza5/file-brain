import type { MetadataRoute } from 'next';

// Required for Next.js static export (output: 'export') mode
export const dynamic = 'force-static';

/**
 * Automatically generates sitemap.xml at build time.
 * Add new guide slugs to GUIDES as you publish new articles.
 * The sitemap will be output to /sitemap.xml by Next.js.
 */

interface GuideEntry {
    slug: string;
    lastModified: string;
    priority: number;
}

const GUIDES: GuideEntry[] = [
    {
        slug: 'local-semantic-search',
        lastModified: '2026-02-18',
        priority: 0.8,
    },
    // Add new guides here as they are published:
    // { slug: 'ocr-document-search', lastModified: '2026-03-01', priority: 0.8 },
];

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = 'https://file-brain.com';

    const homePage: MetadataRoute.Sitemap[number] = {
        url: baseUrl,
        lastModified: new Date().toISOString().split('T')[0],
        changeFrequency: 'monthly',
        priority: 1.0,
    };

    const guidesIndex: MetadataRoute.Sitemap[number] = {
        url: `${baseUrl}/guides/`,
        lastModified: GUIDES.reduce((latest, g) => (g.lastModified > latest ? g.lastModified : latest), '2026-01-01'),
        changeFrequency: 'weekly',
        priority: 0.9,
    };

    const guidePages: MetadataRoute.Sitemap = GUIDES.map((guide) => ({
        url: `${baseUrl}/guides/${guide.slug}/`,
        lastModified: guide.lastModified,
        changeFrequency: 'monthly' as const,
        priority: guide.priority,
    }));

    return [homePage, guidesIndex, ...guidePages];
}
