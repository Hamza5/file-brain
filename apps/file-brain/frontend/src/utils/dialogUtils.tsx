import { confirmDialog, type ConfirmDialogProps } from 'primereact/confirmdialog';

export function showConfirmDialog(options: ConfirmDialogProps) {
  let formattedMessage = options.message;

  if (typeof options.message === 'string') {
    // Intelligent split: separate main question from explanation
    const matches = options.message.match(/[^.!?]+[.!?]+/g);

    if (matches && matches.length > 1) {
      formattedMessage = (
        <div className="flex flex-column gap-3 mt-2">
          <p className="m-0 font-medium text-color line-height-3 text-lg">
            {matches[0].trim()}
          </p>
          <div className="text-color-secondary line-height-3 text-sm">
            {matches.slice(1).map((sentence, i) => (
              <p key={i} className="m-0 mb-1">
                {sentence.trim()}
              </p>
            ))}
          </div>
        </div>
      );
    } else {
      formattedMessage = (
        <p className="m-0 mt-2 font-medium text-color line-height-3 text-lg">
          {options.message}
        </p>
      );
    }
  }

  return confirmDialog({
    defaultFocus: 'reject',
    ...options,
    message: formattedMessage,
  });
}
