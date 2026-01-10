/**
 * File operations service for frontend - handles API communication for file operations
 */

import { requestJSON } from '../api/client';

export interface FileOperationRequest {
  file_path: string;
  operation: 'file' | 'folder' | 'delete' | 'forget';
}

export interface FileOperationResponse {
  success: boolean;
  message?: string;
  error?: string;
  operation?: string;
  file_path?: string;
}

export interface SystemInfoResponse {
  system: string;
  supported: boolean;
  operations: Array<{
    operation: string;
    description: string;
    command?: string | null;
  }>;
}

export async function openFile(filePath: string): Promise<FileOperationResponse> {
  try {
    return await requestJSON<FileOperationResponse>("/api/v1/files/open", {
      method: "POST",
      body: JSON.stringify({
        file_path: filePath,
        operation: 'file'
      }),
    });
  } catch {
    return {
      success: false,
      error: 'Failed to open file. Please check if the file exists and you have the necessary permissions.'
    };
  }
}

export async function openFolder(filePath: string): Promise<FileOperationResponse> {
  try {
    return await requestJSON<FileOperationResponse>("/api/v1/files/open", {
      method: "POST",
      body: JSON.stringify({
        file_path: filePath,
        operation: 'folder'
      }),
    });
  } catch {
    return {
      success: false,
      error: 'Failed to open folder. Please check if the file exists and you have the necessary permissions.'
    };
  }
}

export async function getSystemInfo(): Promise<SystemInfoResponse> {
  try {
    return await requestJSON<SystemInfoResponse>("/api/v1/files/info");
  } catch {
    return {
      system: 'Unknown',
      supported: false,
      operations: []
    };
  }
}

export async function deleteFile(filePath: string): Promise<FileOperationResponse> {
  try {
    return await requestJSON<FileOperationResponse>("/api/v1/files/delete", {
      method: "POST",
      body: JSON.stringify({
        file_path: filePath,
        operation: 'delete'
      }),
    });
  } catch {
    return {
      success: false,
      error: 'Failed to delete file. Please check if the file exists and you have the necessary permissions.'
    };
  }
}

export async function forgetFile(filePath: string): Promise<FileOperationResponse> {
  try {
    return await requestJSON<FileOperationResponse>("/api/v1/files/forget", {
      method: "POST",
      body: JSON.stringify({
        file_path: filePath,
        operation: 'forget'
      }),
    });
  } catch {
    return {
      success: false,
      error: 'Failed to remove file from search index.'
    };
  }
}



// Utility functions
export function isValidFilePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  
  // Basic validation - ensure it doesn't contain directory traversal attempts
  if (filePath.includes('..') || filePath.includes('~/')) {
    return false;
  }
  
  // Should be a valid path format
  return filePath.length > 0 && !filePath.startsWith('/');
}

export function getFileName(filePath: string): string {
  if (!filePath) return '';
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

export function getDirectory(filePath: string): string {
  if (!filePath) return '';
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSlash > -1 ? filePath.substring(0, lastSlash) : '';
}

// Export a simple object with all file operation functions for backwards compatibility
export const fileOperationsService = {
  openFile,
  openFolder,
  deleteFile,
  forgetFile,
  getSystemInfo,
  isValidFilePath,
  getFileName,
  getDirectory,
};