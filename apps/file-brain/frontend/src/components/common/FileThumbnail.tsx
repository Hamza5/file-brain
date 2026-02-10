import { useState } from 'react';
import { getPreviewUrl } from '../../api/client';

interface FileThumbnailProps {
  filePath: string;
  maxSize?: number;
  iconClass: string;
  alt?: string;
  style?: React.CSSProperties;
}

/**
 * Component that displays a file thumbnail from the OS cache, or falls back to an icon.
 */
export function FileThumbnail({
  filePath,
  maxSize = 300,
  iconClass,
  alt = 'File thumbnail',
  style = {},
}: FileThumbnailProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const previewUrl = getPreviewUrl(filePath, maxSize);

  if (imageError) {
    // Fallback to icon if thumbnail not available
    return (
      <i
        className={iconClass}
        aria-hidden="true"
        style={style}
      />
    );
  }

  return (
    <div style={{ position: 'relative', ...style }}>
      {imageLoading && (
        <i
          className={iconClass}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            opacity: 0.3,
          }}
        />
      )}
      <img
        src={previewUrl}
        alt={alt}
        loading="lazy"
        style={{
          width: '100%',
          height: '100%',
          objectFit: style.objectFit || 'cover',
          opacity: imageLoading ? 0 : 1,
          transition: 'opacity 0.2s',
        }}
        onLoad={() => setImageLoading(false)}
        onError={() => {
          setImageError(true);
          setImageLoading(false);
        }}
      />
    </div>
  );
}
