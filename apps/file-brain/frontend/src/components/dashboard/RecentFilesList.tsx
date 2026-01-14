import React, { useEffect, useState } from 'react';
import { Tooltip } from 'primereact/tooltip';
import { getRecentFiles, type RecentFile } from '../../api/client';
import { FileContextMenu } from '../modals/FileContextMenu';
import { FileItem } from '../common/FileItem';
import { useFileOperations } from '../../hooks/useFileOperations';

interface RecentFilesListProps {
  onRefresh?: () => void;
}

export const RecentFilesList: React.FC<RecentFilesListProps> = ({ onRefresh }) => {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  const { contextMenu, handleContextMenu, closeContextMenu, handleFileOperation } = useFileOperations({
    onSuccess: () => {
      // Refresh the list after delete/forget
      fetchRecent();
    },
  });

  // Fetch recent files
  const fetchRecent = async () => {
    try {
      const result = await getRecentFiles(10);
      setRecentFiles(result.files);
      onRefresh?.();
    } catch {
      // Failed to fetch recent files - silent failure
    }
  };

  useEffect(() => {
    fetchRecent();
    const interval = setInterval(fetchRecent, 30000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  return (
    <div className="surface-card border-round-2xl p-3 shadow-2 h-full flex flex-column gap-3">
      <div className="flex align-items-center justify-content-between">
        <span className="font-bold text-lg text-color">Recently Indexed</span>
        <span className="text-xs text-color-secondary">{recentFiles.length} files</span>
      </div>
      <div className="flex flex-column gap-2 overflow-y-auto pr-1" style={{ flex: '1 1 0', minHeight: '300px' }}>
        {recentFiles.length === 0 ? (
          <div className="flex flex-column align-items-center justify-content-center h-full text-color-secondary opacity-70">
            <i className="fa-regular fa-clock text-4xl mb-2"></i>
            <span>No recently indexed files</span>
          </div>
        ) : (
          recentFiles.map((file, index) => (
            <FileItem
              key={file.file_path || index}
              file={file}
              onContextMenu={handleContextMenu}
              onFileOperation={handleFileOperation}
            />
          ))
        )}
      </div>

      <Tooltip target=".hero-action-tooltip" />

      <FileContextMenu
        isOpen={contextMenu.visible}
        position={contextMenu.position}
        filePath={contextMenu.filePath}
        onClose={closeContextMenu}
        onFileOperation={handleFileOperation}
      />
    </div>
  );
};
