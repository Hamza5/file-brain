/**
 * File selection context for managing file selections and interactions
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

interface FileSelectionContextType {
  selectedFiles: Set<string>;
  hoverFile: string | null;
  selectFile: (filePath: string) => void;
  toggleFileSelection: (filePath: string) => void;
  clearSelection: () => void;
  selectMultipleFiles: (filePaths: string[]) => void;
  setHoverFile: (filePath: string | null) => void;
  isFileSelected: (filePath: string) => boolean;
  getSelectedFilesCount: () => number;
  hasSelection: () => boolean;
}

const FileSelectionContext = createContext<FileSelectionContextType | undefined>(undefined);

export function FileSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [hoverFile, setHoverFile] = useState<string | null>(null);

  const selectFile = useCallback((filePath: string) => {
    console.log('selectFile called with:', filePath);
    setSelectedFiles(new Set([filePath]));
  }, []);

  const toggleFileSelection = useCallback((filePath: string) => {
    console.log('toggleFileSelection called with:', filePath);
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      console.log('New selected files:', Array.from(newSet));
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    console.log('clearSelection called');
    setSelectedFiles(new Set());
  }, []);

  const selectMultipleFiles = useCallback((filePaths: string[]) => {
    setSelectedFiles(new Set(filePaths));
  }, []);

  const isFileSelected = useCallback((filePath: string) => {
    const result = selectedFiles.has(filePath);
    console.log('isFileSelected for', filePath, ':', result);
    return result;
  }, [selectedFiles]);

  const getSelectedFilesCount = useCallback(() => {
    return selectedFiles.size;
  }, [selectedFiles]);

  const hasSelection = useCallback(() => {
    return selectedFiles.size > 0;
  }, [selectedFiles]);

  const value: FileSelectionContextType = {
    selectedFiles,
    hoverFile,
    selectFile,
    toggleFileSelection,
    clearSelection,
    selectMultipleFiles,
    setHoverFile,
    isFileSelected,
    getSelectedFilesCount,
    hasSelection
  };

  return (
    <FileSelectionContext.Provider value={value}>
      {children}
    </FileSelectionContext.Provider>
  );
}

export function useFileSelection() {
  const context = useContext(FileSelectionContext);
  if (context === undefined) {
    throw new Error('useFileSelection must be used within a FileSelectionProvider');
  }
  return context;
}