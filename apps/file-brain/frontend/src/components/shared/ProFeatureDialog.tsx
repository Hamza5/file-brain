import React from "react";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { openExternalUrl } from "../../api/client";
import { usePostHog } from "../../context/PostHogProvider";

interface ProFeatureDialogProps {
  visible: boolean;
  onHide: () => void;
  featureName: string;
  minimumTier?: string;
}

export const ProFeatureDialog: React.FC<ProFeatureDialogProps> = ({
  visible,
  onHide,
  featureName,
  minimumTier,
}) => {
  const posthog = usePostHog();

  React.useEffect(() => {
    if (visible && posthog) {
      posthog.capture("pro_feature_requested", {
        feature_name: featureName,
        minimum_tier: minimumTier || "Pro",
      });
    }
  }, [visible, posthog, featureName, minimumTier]);

  const handleLearnMore = () => {
    if (posthog) {
      posthog.capture("pro_feature_learn_more_clicked", {
        feature_name: featureName,
        minimum_tier: minimumTier || "Pro",
      });
    }
    openExternalUrl("https://file-brain.com/#pro-version");
  };

  return (
    <Dialog
      visible={visible}
      onHide={onHide}
      header="File Brain Pro Feature"
      style={{ width: "90vw", maxWidth: "450px" }}
      breakpoints={{ "960px": "75vw", "641px": "90vw" }}
    >
      <div className="flex flex-column align-items-center text-center gap-4 py-2">
        <i
          className="fas fa-crown text-6xl"
          style={{ color: "var(--primary-color)" }}
        />
        <div>
          <h3 className="m-0 mb-3 text-xl">{featureName}</h3>
          <p className="m-0 text-color-secondary line-height-3">
            This feature is available in <strong>File Brain Pro</strong>. 
            Upgrade to the <strong>{minimumTier || "Pro"}</strong> tier or higher to unlock advanced conversational AI, secure cloud connectivity, and more!
          </p>
        </div>
        <div className="flex w-full gap-3 mt-3">
          <Button
            label="Cancel"
            icon="fas fa-times"
            className="flex-1 p-button-outlined p-button-secondary"
            onClick={onHide}
          />
          <Button
            label="Learn More"
            icon="fas fa-external-link-alt"
            className="flex-1"
            onClick={handleLearnMore}
          />
        </div>
      </div>
    </Dialog>
  );
};
