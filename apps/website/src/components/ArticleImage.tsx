import React from 'react';

interface ArticleImageProps {
    /** Short label shown above the hint, e.g. "Screenshot" or "Diagram" */
    label: string;
    /** Guidance text telling the author what image to place here */
    hint: string;
    /** Approximate aspect ratio hint for the placeholder height */
    aspectRatio?: '16/9' | '4/3' | '1/1' | '3/2';
}

const ASPECT_PADDING: Record<string, string> = {
    '16/9': '56.25%',
    '4/3': '75%',
    '1/1': '100%',
    '3/2': '66.67%',
};

/**
 * Placeholder shown in development / before a real image is added.
 * Replace this component with a real <Image> once the screenshot is ready.
 *
 * Usage:
 *   <ArticleImage
 *     label="Screenshot"
 *     hint="Add a screenshot of File Brain's search results here."
 *   />
 */
export const ArticleImage: React.FC<ArticleImageProps> = ({
    label,
    hint,
    aspectRatio = '16/9',
}) => {
    return (
        <div
            className="article-image-placeholder"
            style={{ minHeight: `calc(${ASPECT_PADDING[aspectRatio]} * 0.6)` }}
            role="img"
            aria-label={`Image placeholder: ${hint}`}
        >
            <i className="fa-regular fa-image article-image-placeholder-icon" />
            <span className="article-image-placeholder-label">{label}</span>
            <p className="article-image-placeholder-hint">{hint}</p>
        </div>
    );
};
