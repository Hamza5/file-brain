"use client";
import React, { useState } from "react";

interface SectionAnchorProps {
  id: string;
  className?: string;
  color?: string;
}

export const SectionAnchor: React.FC<SectionAnchorProps> = ({
  id,
  className = "",
  color = "var(--text-color-secondary)",
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Copy URL to clipboard
    const url = `${window.location.origin}/#${id}`;
    navigator.clipboard.writeText(url).then(() => {
      // Show tooltip
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 2000);
      
      // Also update URL in browser without scrolling
      window.history.pushState(null, "", `#${id}`);
    });
  };

  return (
    <a
      href={`#${id}`}
      onClick={handleClick}
      className={`inline-flex align-items-center justify-content-center cursor-pointer transition-colors transition-duration-200 no-underline ml-2 relative group ${className}`}
      style={{ 
        color: color, 
        verticalAlign: "middle",
        opacity: 0.5,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
      aria-label="Copy link to section"
    >
      <i className="fa-solid fa-link text-lg"></i>
      
      {/* Tooltip */}
      <div
        className={`absolute left-50 bottom-100 mb-2 px-2 py-1 border-round text-xs font-bold shadow-2 transition-all transition-duration-200 ${
          showTooltip ? "opacity-100 scale-100" : "opacity-0 scale-0"
        }`}
        style={{
          transform: `translateX(-50%) ${showTooltip ? "scale(1)" : "scale(0.8)"}`,
          backgroundColor: "var(--surface-900)",
          color: "var(--surface-0)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        Copied!
        <div 
          className="absolute left-50 top-100 border-x-transparent border-b-transparent"
          style={{
            transform: "translateX(-50%)",
            borderWidth: "4px",
            borderStyle: "solid",
            borderColor: "var(--surface-900) transparent transparent transparent"
          }}
        ></div>
      </div>
    </a>
  );
};
