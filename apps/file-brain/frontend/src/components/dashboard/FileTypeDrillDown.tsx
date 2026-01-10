import React, { useEffect, useState } from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import { Paginator } from 'primereact/paginator';
import { Tooltip } from 'primereact/tooltip';
import { getFilesByType, type RecentFile } from '../../api/client';
import { FileContextMenu } from '../modals/FileContextMenu';
import { formatBytes, formatRelativeTime, getFileName, getFileIcon } from '../../utils/fileUtils';
import { useFileOperations } from '../../hooks/useFileOperations';

interface FileTypeDrillDownProps {
  visible: boolean;
  fileExtension: string;
  onHide: () => void;
}

export const FileTypeDrillDown: React.FC<FileTypeDrillDownProps> = ({ visible, fileExtension, onHide }) => {
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadFiles = async (ext: string, pageNum: number) => {
    setLoading(true);
    try {
      const result = await getFilesByType(ext, pageNum);
      setFiles(result.files);
      setTotal(result.total);
    } catch {
      // Failed to load files - silent failure
    } finally {
      setLoading(false);
    }
  };

  const { contextMenu, handleContextMenu, closeContextMenu, handleFileOperation } = useFileOperations({
    onSuccess: () => {
      // Reload the current page after delete/forget
      loadFiles(fileExtension, page + 1);
    },
  });

  useEffect(() => {
    if (visible && fileExtension) {
      setPage(0);
      loadFiles(fileExtension, 1);
    }
  }, [visible, fileExtension]);

  return (
    <Sidebar
      visible={visible}
      position="bottom"
      onHide={onHide}
      style={{ height: 'auto', minHeight: '400px' }}
      header={
        <div className="flex align-items-center gap-2">
          <i className="fa-solid fa-folder-open text-primary text-xl" />
          <span className="font-bold text-xl">Files: {fileExtension}</span>
          <span className="text-sm text-color-secondary ml-2">{total} items</span>
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-content-center py-8">
          <i className="fa fa-spinner fa-spin text-4xl text-primary" />
        </div>
      ) : (
        <div className="flex flex-column h-full">
          <div className="grid mt-2">
            {files.map((file, idx) => (
              <div key={file.file_path || idx} className="col-12 md:col-6 lg:col-4 xl:col-3">
                <div 
                  className="flex align-items-center gap-3 p-2 border-round-xl bg-white border-1 border-transparent shadow-1 hover:shadow-2 hover:border-primary transition-all"
                  onContextMenu={(e) => handleContextMenu(e, file.file_path)}
                >
                  <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-lg" style={{ width: '40px', height: '40px', flexShrink: 0 }}>
                    <i className={`${getFileIcon(file.file_extension)} text-xl text-primary`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-overflow-ellipsis white-space-nowrap overflow-hidden text-color" title={getFileName(file.file_path)}>
                      {getFileName(file.file_path)}
                    </div>
                    <div className="text-xs text-color-secondary mt-1 flex align-items-center gap-1 opacity-80" style={{ fontSize: '11px' }}>
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
              </div>
            ))}
          </div>

          <div className="mt-auto flex justify-content-center">
            <Paginator
              first={page * 20}
              rows={20}
              totalRecords={total}
              onPageChange={(e) => {
                setPage(e.page);
                loadFiles(fileExtension, e.page + 1);
              }}
            />
          </div>
        </div>
      )}

      <Tooltip target=".drill-action-tooltip" />
      
      <FileContextMenu
        isOpen={contextMenu.visible}
        position={contextMenu.position}
        filePath={contextMenu.filePath}
        onClose={closeContextMenu}
        onFileOperation={handleFileOperation}
      />
    </Sidebar>
  );
};
