import React, { useEffect, useState } from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Paginator } from 'primereact/paginator';
import { Tooltip } from 'primereact/tooltip';
import { getFilesByType, type RecentFile } from '../../api/client';
import { FileContextMenu } from '../modals/FileContextMenu';
import { FileItem } from '../common/FileItem';
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
                <FileItem
                  file={file}
                  onContextMenu={handleContextMenu}
                  onFileOperation={handleFileOperation}
                />
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
