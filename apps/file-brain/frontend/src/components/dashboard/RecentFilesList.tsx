import React, { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Tooltip } from 'primereact/tooltip';
import { getRecentFiles, type RecentFile } from '../../api/client';
import { FileContextMenu } from '../modals/FileContextMenu';
import { formatBytes, formatRelativeTime, getFileName, getFileIcon } from '../../utils/fileUtils';
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

  if (recentFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-column gap-3 h-full">
      <div className="flex align-items-center justify-content-between px-2">
        <span className="font-bold text-lg text-color">Recent Activity</span>
        <span className="text-xs text-color-secondary">{recentFiles.length} items</span>
      </div>
      <div className="flex flex-column gap-2 overflow-y-auto pr-1" style={{ flex: '1 1 0', minHeight: '300px' }}>
        {recentFiles.map((file, index) => (
          <div
            key={file.file_path || index}
            className="flex align-items-center gap-3 p-2 border-round-xl bg-white border-1 border-transparent shadow-1 hover:shadow-2 hover:border-primary"
            style={{ transition: "all 0.2s ease" }}
            onContextMenu={(e) => handleContextMenu(e, file.file_path)}
          >
            <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-lg" style={{ width: '36px', height: '36px' }}>
              <i className={`${getFileIcon(file.file_extension)} text-lg text-primary`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-overflow-ellipsis white-space-nowrap overflow-hidden text-color">
                {getFileName(file.file_path)}
              </div>
              <div className="text-xs text-color-secondary mt-0 flex align-items-center gap-1 opacity-80" style={{ fontSize: '11px' }}>
                <span>{formatBytes(file.file_size)}</span>
                <span className="opacity-50">•</span>
                <span>{formatRelativeTime(file.indexed_at)}</span>
              </div>
            </div>
            <div className="flex align-items-center">
              <Button
                icon="fas fa-external-link-alt"
                className="p-button-text p-button-sm w-auto p-1"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleFileOperation({ file_path: file.file_path, operation: 'file' });
                }}
                tooltip="Open file"
                tooltipOptions={{ position: 'top' }}
              />
              <Button
                icon="fas fa-folder-open"
                className="p-button-text p-button-sm w-auto p-1"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleFileOperation({ file_path: file.file_path, operation: 'folder' });
                }}
                tooltip="Open containing folder"
                tooltipOptions={{ position: 'top' }}
              />
            </div>
          </div>
        ))}
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
