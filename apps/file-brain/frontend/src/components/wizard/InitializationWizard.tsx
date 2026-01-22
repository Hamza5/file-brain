import { useState } from 'react';
import { Steps } from 'primereact/steps';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { completeWizard } from '../../api/client';
import { ThemeSwitcher } from '../layout/ThemeSwitcher';
import { DockerCheckStep } from './steps/DockerCheckStep';
import { ImagePullStep } from './steps/ImagePullStep';
import { ServiceStartStep } from './steps/ServiceStartStep';
import { ModelDownloadStep } from './steps/ModelDownloadStep';
import { CollectionCreateStep } from './steps/CollectionCreateStep';

interface InitializationWizardProps {
  onComplete: () => void;
  startStep?: number;
  isUpgrade?: boolean;
}

export function InitializationWizard({ onComplete, startStep = 0, isUpgrade = false }: InitializationWizardProps) {
  const [activeStep, setActiveStep] = useState(startStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = [
    { label: 'System Check' },
    { label: 'Download Components' },
    { label: 'Initialize Engine' },
    { label: 'Download Embedding (AI) Model' },
    { label: 'Finalize Setup' },
    { label: 'Complete' },
  ];

  const handleStepComplete = (nextStep: number) => {
    setActiveStep(nextStep);
  };

  const handleComplete = async () => {
    setLoading(true);
    setError(null);
    try {
      await completeWizard();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete wizard');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return <DockerCheckStep onComplete={() => handleStepComplete(1)} />;

      case 1:
        return <ImagePullStep onComplete={() => handleStepComplete(2)} />;

      case 2:
        return <ServiceStartStep onComplete={() => handleStepComplete(3)} />;

      case 3:
        return <ModelDownloadStep onComplete={() => handleStepComplete(4)} />;

      case 4:
        return <CollectionCreateStep onComplete={() => handleStepComplete(5)} />;

      case 5:
        return (
          <div className="flex flex-column gap-3 align-items-center text-center">
            <i className="fas fa-check-circle text-6xl text-green-500" />
            <h2 className="mt-0">Setup Complete!</h2>
            <p className="text-600 mt-0 mb-4">
              Your file search system is ready to use. Click below to start using the application.
            </p>
            <Button
              label="Start Using File Brain"
              icon="fas fa-rocket"
              onClick={handleComplete}
              size="large"
              severity="success"
              loading={loading}
            />
            {error && <Message severity="error" text={error} className="mt-3" />}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-column h-full p-4 overflow-y-auto">
      <ConfirmDialog />
      
      {/* Theme Switcher - Positioned in top right */}
      <div className="fixed top-0 right-0 m-3" style={{ zIndex: 1000 }}>
        <ThemeSwitcher />
      </div>

      <div className="flex flex-column align-items-center mb-4">
        <h1 className="text-4xl font-bold text-primary mb-2">
          <i className="fas fa-screwdriver-wrench mr-2" />
          {isUpgrade ? 'File Brain Update' : 'File Brain Setup'}
        </h1>
        <p className="text-600 text-center max-w-30rem">
          {isUpgrade 
            ? 'An update is required to complete the setup. This wizard will guide you through the necessary steps.'
            : 'Welcome! Let\'s set up your intelligent file search system. This wizard will guide you through the installation process.'}
        </p>
      </div>

      <Card className="max-w-50rem w-full mx-auto">
        <Steps model={steps} activeIndex={activeStep} className="mb-4" />
        <div className="mt-4">
          {renderStepContent()}
        </div>
      </Card>

      <div className="text-center mt-4 text-sm text-600">
        <i className="fas fa-info-circle mr-1" />
        Step {activeStep + 1} of {steps.length}
      </div>
    </div>
  );
}
