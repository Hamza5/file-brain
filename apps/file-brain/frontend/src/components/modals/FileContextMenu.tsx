/**
 * File context menu component with FontAwesome icons
 */
import { useEffect, useRef } from 'react';
import type { FileOperationRequest } from '../../services/fileOperations';

interface FileContextMenuProps {
  filePath: string;
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onFileOperation: (request: FileOperationRequest) => void;
}

export function FileContextMenu({
  filePath,
  isOpen,
  position,
  onClose,
  onFileOperation
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle clicks outside the menu to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileOperation = (operation: 'file' | 'folder' | 'delete' | 'forget') => {
    onFileOperation({ file_path: filePath, operation });
    onClose();
  };

  // Ensure menu doesn't go off-screen
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 200), // Assuming menu width around 200px
    y: Math.min(position.y, window.innerHeight - 240) // Assuming menu height around 240px (4 items)
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 1000,
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--surface-border)',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '4px 0',
        minWidth: '180px',
        fontSize: '0.875rem'
      }}
      onContextMenu={(e) => e.preventDefault()} // Prevent default context menu
    >
      <div
        style={{
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          color: 'var(--text-color)',
          transition: 'background-color 0.15s ease'
        }}
        onClick={() => handleFileOperation('file')}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <i 
          className="fas fa-external-link-alt" 
          style={{ 
            width: '16px',
            color: 'var(--primary-color)'
          }} 
        />
        <span>Open File</span>
      </div>
      
      <div
        style={{
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          color: 'var(--text-color)',
          transition: 'background-color 0.15s ease'
        }}
        onClick={() => handleFileOperation('folder')}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <i 
          className="fas fa-folder-open" 
          style={{ 
            width: '16px',
            color: 'var(--primary-color)'
          }} 
        />
        <span>Open Folder</span>
      </div>

      {/* Divider */}
      <div style={{
        height: '1px',
        backgroundColor: 'var(--surface-border)',
        margin: '4px 8px'
      }} />
      
      {/* Delete File */}
      <div
        style={{
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          color: 'var(--text-color)',
          transition: 'background-color 0.15s ease'
        }}
        onClick={() => handleFileOperation('delete')}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <i
          className="fas fa-trash"
          style={{
            width: '16px',
            color: '#dc3545' // Red for delete operation
          }}
        />
        <span>Delete File</span>
      </div>
      
      {/* Forget from Index */}
      <div
        style={{
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          color: 'var(--text-color)',
          transition: 'background-color 0.15s ease'
        }}
        onClick={() => handleFileOperation('forget')}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <i
          className="fas fa-eraser"
          style={{
            width: '16px',
            color: '#6c757d' // Gray for forget operation
          }}
        />
        <span>Forget</span>
      </div>
    </div>
  );
}
