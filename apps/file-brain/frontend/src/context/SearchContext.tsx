import React, { createContext, useContext, useState, type ReactNode } from "react";

export type SearchMode = "hybrid" | "full-text" | "semantic";

interface SearchContextType {
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  fuzzySearchEnabled: boolean;
  setFuzzySearchEnabled: (enabled: boolean) => void;
  hasSearchSubmitted: boolean;
  setHasSearchSubmitted: (submitted: boolean) => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

interface SearchProviderProps {
  children: ReactNode;
}

export const SearchProvider: React.FC<SearchProviderProps> = ({ children }) => {
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [fuzzySearchEnabled, setFuzzySearchEnabled] = useState<boolean>(true);
  const [hasSearchSubmitted, setHasSearchSubmitted] = useState<boolean>(false);

  return (
    <SearchContext.Provider
      value={{
        searchMode,
        setSearchMode,
        fuzzySearchEnabled,
        setFuzzySearchEnabled,
        hasSearchSubmitted,
        setHasSearchSubmitted,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
};
