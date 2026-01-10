import React, { useEffect, useState } from 'react';
import { Tooltip } from 'primereact/tooltip';
import { getIndexStorage } from '../../api/client';
import { formatBytes } from '../../utils/fileUtils';

interface IndexStorageCardProps {
  onClick?: () => void;
}

export const IndexStorageCard: React.FC<IndexStorageCardProps> = ({ onClick }) => {
  const [indexStorage, setIndexStorage] = useState<number>(0);

  useEffect(() => {
    const fetchIndexStorage = async () => {
      try {
        const result = await getIndexStorage();
        setIndexStorage(result.index_memory_bytes);
      } catch {
        // Failed to fetch index storage - silent failure
      }
    };

    fetchIndexStorage();
    const interval = setInterval(fetchIndexStorage, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div 
        className={`surface-card border-round-2xl p-3 shadow-2 flex flex-column align-items-center justify-content-center text-center h-full gap-1 relative ${onClick ? 'cursor-pointer hover:shadow-4 surface-hover transition-all transition-duration-200' : ''}`}
        onClick={onClick}
      >
        <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-xl">
          <i className="fa-solid fa-database text-3xl text-primary" />
        </div>
        <div className="text-2xl font-bold text-color">{formatBytes(indexStorage)}</div>
        <div className="flex align-items-center gap-1">
          <span className="text-xs text-color-secondary font-semibold uppercase tracking-wider">Index Size</span>
          <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help help-storage" />
        </div>
        <div className="text-xs text-color-secondary opacity-70" style={{ fontSize: '10px' }}>Search Engine</div>
      </div>
      
      <Tooltip target=".help-storage" position="bottom" className="text-sm" style={{ maxWidth: '220px' }}>
        Memory used by the search engine to store your searchable index. Click to manage index.
      </Tooltip>
    </>
  );
};
