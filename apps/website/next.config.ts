import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '',
  trailingSlash: true,
  pageExtensions: ['ts', 'tsx', 'mdx'],
  images: {
    unoptimized: true,
  },
};

const withMDX = createMDX({
  options: {
    // Pass plugin names as strings for Turbopack serialization compatibility
    remarkPlugins: [['remark-gfm']],
    rehypePlugins: [
      ['rehype-slug'],
      ['rehype-autolink-headings', { behavior: 'wrap' }],
    ],
  },
});

export default withMDX(nextConfig);
