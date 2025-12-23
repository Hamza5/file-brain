/**
 * File operations service for frontend - handles API communication for file operations
 */

// Reuse the same requestJSON helper pattern as the existing API client
const API_BASE = ""; // Same as in client.ts

async function requestJSON<T>(input: string, init?: RequestInit): Promise<T> {
  const url = input.startsWith("http") ? input : `${API_BASE}${input}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  if (res.status === 204) {
    // No Content
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

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

export interface MultipleFileOperationRequest {
  file_paths: string[];
  operation: 'file' | 'folder' | 'delete' | 'forget';
}

export interface MultipleFileOperationResponse {
  success: boolean;
  processed: number;
  total_requested: number;
  errors: string[];
  operation?: string;
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
    return await requestJSON<FileOperationResponse>("/api/files/open", {
      method: "POST",
      body: JSON.stringify({
        file_path: filePath,
        operation: 'file'
      }),
    });
  } catch (error) {
    console.error('Error opening file:', error);
    return {
      success: false,
      error: 'Failed to open file. Please check if the file exists and you have the necessary permissions.'
    };
  }
}

export async function openFolder(filePath: string): Promise<FileOperationResponse> {
  try {
    return await requestJSON<FileOperationResponse>("/api/files/open", {
      method: "POST",
      body: JSON.stringify({
        file_path: filePath,
        operation: 'folder'
      }),
    });
  } catch (error) {
    console.error('Error opening folder:', error);
    return {
      success: false,
      error: 'Failed to open folder. Please check if the file exists and you have the necessary permissions.'
    };
  }
}

export async function openMultipleFiles(filePaths: string[]): Promise<MultipleFileOperationResponse> {
  try {
    return await requestJSON<MultipleFileOperationResponse>("/api/files/open-multiple", {
      method: "POST",
      body: JSON.stringify({
        file_paths: filePaths,
        operation: 'file'
      }),
    });
  } catch (error) {
    console.error('Error opening multiple files:', error);
    return {
      success: false,
      processed: 0,
      total_requested: filePaths.length,
      errors: ['Failed to open files']
    };
  }
}

export async function getSystemInfo(): Promise<SystemInfoResponse> {
  try {
    return await requestJSON<SystemInfoResponse>("/api/files/info");
  } catch (error) {
    console.error('Error getting system info:', error);
    return {
      system: 'Unknown',
      supported: false,
      operations: []
    };
  }
}

export async function deleteFile(filePath: string): Promise<FileOperationResponse> {
  try {
    return await requestJSON<FileOperationResponse>("/api/files/delete", {
      method: "POST",
      body: JSON.stringify({
        file_path: filePath,
        operation: 'delete'
      }),
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    return {
      success: false,
      error: 'Failed to delete file. Please check if the file exists and you have the necessary permissions.'
    };
  }
}

export async function forgetFile(filePath: string): Promise<FileOperationResponse> {
  try {
    return await requestJSON<FileOperationResponse>("/api/files/forget", {
      method: "POST",
      body: JSON.stringify({
        file_path: filePath,
        operation: 'forget'
      }),
    });
  } catch (error) {
    console.error('Error forgetting file:', error);
    return {
      success: false,
      error: 'Failed to remove file from search index.'
    };
  }
}

export async function deleteMultipleFiles(filePaths: string[]): Promise<MultipleFileOperationResponse> {
  try {
    return await requestJSON<MultipleFileOperationResponse>("/api/files/delete-multiple", {
      method: "POST",
      body: JSON.stringify({
        file_paths: filePaths,
        operation: 'delete'
      }),
    });
  } catch (error) {
    console.error('Error deleting multiple files:', error);
    return {
      success: false,
      processed: 0,
      total_requested: filePaths.length,
      errors: ['Failed to delete files']
    };
  }
}

export async function forgetMultipleFiles(filePaths: string[]): Promise<MultipleFileOperationResponse> {
  try {
    return await requestJSON<MultipleFileOperationResponse>("/api/files/forget-multiple", {
      method: "POST",
      body: JSON.stringify({
        file_paths: filePaths,
        operation: 'forget'
      }),
    });
  } catch (error) {
    console.error('Error forgetting multiple files:', error);
    return {
      success: false,
      processed: 0,
      total_requested: filePaths.length,
      errors: ['Failed to remove files from search index']
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
// Backwards compatibility class for any existing code
class FileOperationsService {
  async openFile(filePath: string): Promise<FileOperationResponse> {
    return openFile(filePath);
  }

  async openFolder(filePath: string): Promise<FileOperationResponse> {
    return openFolder(filePath);
  }

  async openMultipleFiles(filePaths: string[]): Promise<MultipleFileOperationResponse> {
    return openMultipleFiles(filePaths);
  }

  async deleteFile(filePath: string): Promise<FileOperationResponse> {
    return deleteFile(filePath);
  }

  async forgetFile(filePath: string): Promise<FileOperationResponse> {
    return forgetFile(filePath);
  }

  async deleteMultipleFiles(filePaths: string[]): Promise<MultipleFileOperationResponse> {
    return deleteMultipleFiles(filePaths);
  }

  async forgetMultipleFiles(filePaths: string[]): Promise<MultipleFileOperationResponse> {
    return forgetMultipleFiles(filePaths);
  }

  async getSystemInfo(): Promise<SystemInfoResponse> {
    return getSystemInfo();
  }

  isValidFilePath(filePath: string): boolean {
    return isValidFilePath(filePath);
  }

  getFileName(filePath: string): string {
    return getFileName(filePath);
  }

  getDirectory(filePath: string): string {
    return getDirectory(filePath);
  }
}


export const fileOperationsService = new FileOperationsService();