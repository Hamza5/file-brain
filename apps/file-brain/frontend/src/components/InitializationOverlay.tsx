import { useEffect, useState } from 'react';
import { ProgressBar } from 'primereact/progressbar';
import { useStatus } from '../context/StatusContext';
import { ServiceStatusCard } from './ServiceStatusCard';
import { type ServiceInitStatus } from '../api/client';

export function InitializationOverlay() {
  const { systemInitialization, isInitializationComplete } = useStatus();
  const [visible, setVisible] = useState(true);

  // Automatically hide when complete, but allow viewing if failed
  useEffect(() => {
    if (isInitializationComplete) {
      // Small delay to show 100% before hiding
      const timer = setTimeout(() => {
        setVisible(false);
      }, 800);
      return () => clearTimeout(timer);
    } else {
       setVisible(true);
    }
  }, [isInitializationComplete]);
  
  // If we don't have initialization data yet, don't show anything (or show generic loader)
  if (!systemInitialization) {
    // Maybe checking API? 
    // Usually we want to block until we know the status.
    // If context is still loading, maybe return null or a simple spinner
    return null;
  }

  // If we are done and visible is false, don't render
  if (isInitializationComplete && !visible) {
    return null;
  }

  return (
    <div 
      className="fixed top-0 left-0 w-full h-full z-5 flex align-items-center justify-content-center surface-ground fadein animation-duration-300"
      style={{ 
        backgroundColor: 'rgba(248, 249, 250, 0.95)',
        backdropFilter: 'blur(5px)'
      }}
    >
      <div 
        className="surface-card p-5 shadow-4 border-round-2xl flex flex-column"
        style={{ width: '600px', maxWidth: '90vw' }}
      >
        <div className="text-center mb-5">
          <i className="pi pi-bolt text-5xl text-primary mb-3"></i>
          <h1 className="text-3xl font-bold m-0 text-900 mb-2">Starting File Brain</h1>
          <p className="text-600 m-0">Initializing system services and models...</p>
        </div>

        <div className="mb-5">
          <div className="flex justify-content-between mb-2">
            <span className="font-semibold text-700">Overall Progress</span>
            <span className="font-bold text-primary">{systemInitialization.initialization_progress.toFixed(0)}%</span>
          </div>
          <ProgressBar 
            value={systemInitialization.initialization_progress} 
            style={{ height: '12px' }}
            className="border-round-lg"
          />
          <p className="text-center text-sm text-500 mt-2">{systemInitialization.message}</p>
        </div>

        <div className="flex flex-column gap-2" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
          {Object.values(systemInitialization.services).map((service) => (
            <ServiceStatusCard key={service.name as string} service={service as unknown as ServiceInitStatus} />
          ))}
        </div>
      </div>
    </div>
  );
}
