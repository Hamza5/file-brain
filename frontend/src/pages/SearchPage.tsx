import React, { useRef } from 'react';
import { Hits, SearchBox, Pagination, Configure, useInstantSearch } from "react-instantsearch";
import { Card } from "primereact/card";
import { useClickOutside } from 'primereact/hooks';
import { FileInteractionHit } from '../components/FileInteractionHit';
import { FileSelectionProvider, useFileSelection } from '../context/FileSelectionContext';
import { useNotification } from '../context/NotificationContext';

type HitType = {
  file_name: string;
  file_path: string;  // Fixed: was 'path'
  file_extension?: string;
  mime_type?: string;
  file_size?: number;
  modified_time?: number;
  content?: string;
  // Enhanced metadata from Tika extraction
  title?: string;
  author?: string;
  description?: string;
  subject?: string;
  language?: string;
  producer?: string;
  application?: string;
  keywords?: string[];
  extraction_method?: string;
};

function HybridSemanticConfigure() {
  const { uiState } = useInstantSearch();
  const indexState = uiState.files || {};
  const query = (indexState.query as string | undefined) || "";
  const hasQuery = query.trim().length > 0;

  type TypesenseConfigureProps = React.ComponentProps<typeof Configure> & {
    typesenseVectorQuery?: string;
  };

  const configureProps: TypesenseConfigureProps = hasQuery
    ? { typesenseVectorQuery: "embedding:([], k:50)" }
    : { typesenseVectorQuery: undefined };

  return <Configure {...configureProps} />;
}

// Interactive Hit component that uses file interaction features
function InteractiveHit({ hit }: { hit: HitType }) {
  const { setHoverFile } = useFileSelection();
  
  // Transform hit to include 'path' property for FileInteractionHit compatibility
  const transformedHit = {
    ...hit,
    path: hit.file_path  // Map file_path to path for compatibility
  };
  
  return (
    <FileInteractionHit
      hit={transformedHit}
      onHover={setHoverFile}
    />
  );
}

// Main search page content with selection handling
function SearchPageContent() {
  const { clearSelection } = useFileSelection();
  const { showInfo } = useNotification();
  
  // Ref for the search results container
  const searchResultsRef = useRef<HTMLDivElement>(null);

  // Handle keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
        showInfo('Selection Cleared', 'All file selections have been cleared');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        showInfo('Select All', 'Select all functionality would be implemented here');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, showInfo]);

  // Use PrimeReact useClickOutside hook to clear selection
  useClickOutside(searchResultsRef as React.RefObject<Element>, () => {
    clearSelection();
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 600,
            color: "var(--text-color)",
          }}
        >
          Search
        </h1>
        <p
          style={{
            margin: "0.5rem 0 0 0",
            fontSize: "0.9rem",
            color: "var(--text-color-secondary)",
          }}
        >
          Query your indexed files with full-text and semantic-powered search.
          Click to select, double-click to open files, or right-click for context menu.
        </p>
      </div>

      {/* Search box */}
      <Card style={{ border: "1px solid var(--surface-border)" }}>
        <div style={{ position: "relative" }}>
          <SearchBox
            placeholder="Search by file name, path, or content..."
            classNames={{
              root: "",
              form: "",
              input: "ais-SearchBox-input",
              submit: "hidden",
              reset: "hidden",
            }}
            onSubmit={() => clearSelection()} // Clear selection on new search
          />
        </div>
      </Card>

      {/* Hybrid semantic search configuration */}
      <HybridSemanticConfigure />

      {/* Results Grid */}
      <div
        ref={searchResultsRef}
        style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        <Hits<HitType> hitComponent={InteractiveHit} />
      </div>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          paddingTop: "1rem",
        }}
      >
        <Pagination
          classNames={{
            root: "p-d-flex",
            list: "p-d-flex",
            item: "p-px-2 p-py-1",
            selectedItem: "p-px-2 p-py-1",
            disabledItem: "p-px-2 p-py-1",
            link: "",
          }}
          onChange={() => clearSelection()} // Clear selection on page change
        />
      </div>
    </div>
  );
}

// Main SearchPage component that wraps everything with providers
export function SearchPage() {
  return (
    <FileSelectionProvider>
      <SearchPageContent />
    </FileSelectionProvider>
  );
}
