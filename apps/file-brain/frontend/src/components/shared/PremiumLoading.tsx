interface PremiumLoadingProps {
  message?: string;
  subMessage?: string;
}

export function PremiumLoading({ message, subMessage }: PremiumLoadingProps) {
  return (
    <div className="flex flex-column align-items-center justify-content-center h-screen gap-5">
      <div 
        className="p-6 border-round-xl shadow-4 flex flex-column align-items-center"
        style={{ 
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--surface-border)',
          maxWidth: '450px',
          width: '90%'
        }}
      >
        <div className="relative mb-5" style={{ width: '64px', height: '64px' }}>
          <div className="premium-loader-outer"></div>
          <div className="premium-loader-inner"></div>
        </div>
        
        {message && (
          <h1 className="text-xl font-semibold m-0 mb-2 text-center" style={{ letterSpacing: '-0.025em' }}>
            {message}
          </h1>
        )}
        
        {subMessage && (
          <p className="text-600 m-0 text-center pulse-text">
            {subMessage}
          </p>
        )}
      </div>
    </div>
  );
}
