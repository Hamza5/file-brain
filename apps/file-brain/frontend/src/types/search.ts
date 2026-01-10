/**
 * Type definitions for Typesense search results
 * These interfaces match the structure returned by Typesense search API via InstantSearch
 */

export interface SearchHighlight {
  field: string;
  snippet?: string;
  snippets?: string[];
  matched_tokens?: string[];
}

/**
 * Represents a search hit from Typesense/InstantSearch
 */
export interface SearchHit {
  // InstantSearch required properties
  objectID: string;
  __position: number;
  __queryID?: string;
  
  // Typesense/our custom fields
  file_name: string;
  file_path: string;
  file_extension?: string;
  mime_type?: string;
  file_size?: number;
  modified_time?: number;
  indexed_at?: string;
  
  // Content and metadata
  content?: string;
  title?: string;
  author?: string;
  subject?: string;
  language?: string;
  keywords?: string[];
  extraction_method?: string;
  
  // InstantSearch highlighting/snippet results
  _highlightResult?: {
    [key: string]: {
      value: string;
      matchLevel: 'none' | 'partial' | 'full';
      matchedWords?: string[];
    };
  };
  
  _snippetResult?: {
    [key: string]: {
      value: string;
      matchLevel: 'none' | 'partial' | 'full';
    };
  };
  
  _rankingInfo?: {
    promoted?: boolean;
    nbTypos?: number;
    firstMatchedWord?: number;
    proximityDistance?: number;
    geoDistance?: number;
    geoPrecision?: number;
    nbExactWords?: number;
    words?: number;
    filters?: number;
  };
  
  _distinctSeqID?: number;
  _geoloc?: {
    lat: number;
    lng: number;
  };
}

export interface SearchResponse {
  facet_counts?: unknown[];
  found: number;
  hits: SearchHit[];
  out_of: number;
  page: number;
  request_params: {
    collection_name: string;
    per_page: number;
    q: string;
  };
  search_time_ms: number;
  search_cutoff?: boolean;
}

