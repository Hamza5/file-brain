import React, { createContext, useContext, useState, type ReactNode } from "react";

export type SearchMode = "hybrid" | "full-text" | "semantic";

interface SearchContextType {
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  fuzzySearchEnabled: boolean;
  setFuzzySearchEnabled: (enabled: boolean) => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

interface SearchProviderProps {
  children: ReactNode;
}

export const SearchProvider: React.FC<SearchProviderProps> = ({ children }) => {
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [fuzzySearchEnabled, setFuzzySearchEnabled] = useState<boolean>(true);

  return (
    <SearchContext.Provider
      value={{
        searchMode,
        setSearchMode,
        fuzzySearchEnabled,
        setFuzzySearchEnabled,
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
