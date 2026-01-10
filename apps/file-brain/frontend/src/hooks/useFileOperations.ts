import { useState } from 'react';
import { confirmDialog } from 'primereact/confirmdialog';
import { fileOperationsService } from '../services/fileOperations';

interface ContextMenuState {
  visible: boolean;
  position: { x: number; y: number };
  filePath: string;
}

interface UseFileOperationsOptions {
  onSuccess?: () => void;
}

export const useFileOperations = (options?: UseFileOperationsOptions) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    position: { x: 0, y: 0 },
    filePath: "",
  });

  const handleContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    setContextMenu({ visible: true, position: { x: e.clientX, y: e.clientY }, filePath });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleFileOperation = async (request: { file_path: string; operation: string }) => {
    if (request.operation === 'file') {
      await fileOperationsService.openFile(request.file_path);
    } else if (request.operation === 'folder') {
      await fileOperationsService.openFolder(request.file_path);
    } else if (request.operation === 'delete') {
      confirmDialog({
        message: "Delete this file permanently?",
        header: "Confirm Delete",
        icon: "fa fa-exclamation-triangle",
        acceptClassName: "p-button-danger",
        accept: async () => {
          await fileOperationsService.deleteFile(request.file_path);
          options?.onSuccess?.();
        },
      });
    } else if (request.operation === 'forget') {
      confirmDialog({
        message: "Remove this file from the search index? The file will remain on disk.",
        header: "Remove from Index",
        icon: "fa fa-exclamation-triangle",
        acceptClassName: "p-button-warning",
        accept: async () => {
          await fileOperationsService.forgetFile(request.file_path);
          options?.onSuccess?.();
        },
      });
    }
  };

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
    handleFileOperation,
  };
};
