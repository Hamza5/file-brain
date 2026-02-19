/**
 * Required by @next/mdx. Maps MDX HTML elements to styled React components
 * so articles inherit the site's visual design system.
 */
import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
    return {
        // Headings — use site CSS variables for color consistency
        h1: ({ children, ...props }) => (
            <h1 className="text-4xl font-bold mb-4 mt-0" style={{ color: 'var(--text-color)' }} {...props}>
                {children}
            </h1>
        ),
        h2: ({ children, ...props }) => (
            <h2 className="text-3xl font-semibold mb-3 mt-6" style={{ color: 'var(--text-color)' }} {...props}>
                {children}
            </h2>
        ),
        h3: ({ children, ...props }) => (
            <h3 className="text-2xl font-semibold mb-2 mt-5" style={{ color: 'var(--text-color)' }} {...props}>
                {children}
            </h3>
        ),
        h4: ({ children, ...props }) => (
            <h4 className="text-xl font-semibold mb-2 mt-4" style={{ color: 'var(--text-color)' }} {...props}>
                {children}
            </h4>
        ),
        // Paragraphs
        p: ({ children, ...props }) => (
            <p className="mb-4 article-prose" {...props}>
                {children}
            </p>
        ),
        // Lists
        ul: ({ children, ...props }) => (
            <ul className="mb-4 pl-4 article-list" {...props}>
                {children}
            </ul>
        ),
        ol: ({ children, ...props }) => (
            <ol className="mb-4 pl-4 article-list" {...props}>
                {children}
            </ol>
        ),
        li: ({ children, ...props }) => (
            <li className="mb-1" {...props}>
                {children}
            </li>
        ),
        // Blockquote
        blockquote: ({ children, ...props }) => (
            <blockquote className="article-blockquote" {...props}>
                {children}
            </blockquote>
        ),
        // Inline code
        code: ({ children, ...props }) => (
            <code className="article-inline-code" {...props}>
                {children}
            </code>
        ),
        // Code block
        pre: ({ children, ...props }) => (
            <pre className="article-code-block" {...props}>
                {children}
            </pre>
        ),
        // Tables (GFM)
        table: ({ children, ...props }) => (
            <div className="article-table-wrapper">
                <table className="article-table" {...props}>
                    {children}
                </table>
            </div>
        ),
        thead: ({ children, ...props }) => (
            <thead style={{ backgroundColor: 'var(--surface-100)' }} {...props}>
                {children}
            </thead>
        ),
        th: ({ children, ...props }) => (
            <th className="article-th" {...props}>
                {children}
            </th>
        ),
        td: ({ children, ...props }) => (
            <td className="article-td" {...props}>
                {children}
            </td>
        ),
        // Horizontal rule
        hr: (props) => (
            <hr className="my-6" style={{ borderColor: 'var(--surface-border)' }} {...props} />
        ),
        // Links
        a: ({ children, href, ...props }) => (
            <a
                href={href}
                className="article-link"
                {...(href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                {...props}
            >
                {children}
            </a>
        ),
        // Strong / em
        strong: ({ children, ...props }) => (
            <strong style={{ color: 'var(--text-color)', fontWeight: 700 }} {...props}>
                {children}
            </strong>
        ),
        ...components,
    };
}
