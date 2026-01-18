import React from 'react';
import { Button } from 'primereact/button';
import { type RecentFile } from '../../api/client';
import { formatBytes, formatRelativeTime, getFileName, getFileIcon } from '../../utils/fileUtils';
import { type FileOperationRequest } from '../../services/fileOperations';

interface FileItemProps {
  file: RecentFile;
  onContextMenu: (e: React.MouseEvent, filePath: string) => void;
  onFileOperation: (request: FileOperationRequest) => void;
}

/**
 * Shared file item component used in RecentFilesList and FileTypeDrillDown.
 * Displays file icon, name, size, timestamp, and action buttons.
 * Supports dark mode via surface-card background.
 */
export const FileItem: React.FC<FileItemProps> = ({ file, onContextMenu, onFileOperation }) => {
  return (
    <div
      className="flex align-items-center gap-3 p-2 border-round-xl surface-card border-1 border-transparent shadow-1 hover:shadow-2 hover:border-primary"
      style={{ transition: "all 0.2s ease" }}
      onContextMenu={(e) => onContextMenu(e, file.file_path)}
    >
      <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-lg" style={{ width: '36px', height: '36px', flexShrink: 0 }}>
        <i className={`${getFileIcon(file.file_extension)} text-lg text-primary`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-overflow-ellipsis white-space-nowrap overflow-hidden text-color" title={getFileName(file.file_path)} data-private>
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
            onFileOperation({ file_path: file.file_path, operation: 'file' });
          }}
          tooltip="Open file"
          tooltipOptions={{ position: 'top' }}
        />
        <Button
          icon="fas fa-folder-open"
          className="p-button-text p-button-sm w-auto p-1"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onFileOperation({ file_path: file.file_path, operation: 'folder' });
          }}
          tooltip="Open containing folder"
          tooltipOptions={{ position: 'top' }}
        />
      </div>
    </div>
  );
};
