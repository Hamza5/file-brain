import { ConfirmDialog, type ConfirmDialogProps } from 'primereact/confirmdialog';

export function SharedConfirmDialog(props: ConfirmDialogProps) {
  return (
    <ConfirmDialog
      style={{ width: '450px', maxWidth: '90vw' }}
      {...props}
    />
  );
}


