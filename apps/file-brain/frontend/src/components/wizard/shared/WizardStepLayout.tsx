import React from 'react';

interface WizardStepLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Unified layout component for wizard steps.
 * Provides consistent structure, spacing, and styling across all wizard steps.
 */
export const WizardStepLayout: React.FC<WizardStepLayoutProps> = ({
  title,
  description,
  children,
  actions,
}) => {
  return (
    <div className="flex flex-column gap-3">
      <h3 className="mt-0">{title}</h3>
      {description && <p className="text-600 mt-0">{description}</p>}
      <div className="flex flex-column gap-3">
        {children}
      </div>
      {actions && (
        <div className="flex gap-3 justify-content-end">
          {actions}
        </div>
      )}
    </div>
  );
};
