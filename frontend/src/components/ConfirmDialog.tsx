import { Dialog } from './Dialog';

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Apple-style alert: centered text, Cancel and a destructive action side by side. */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <Dialog onClose={onCancel} className="alert-dialog" role="alertdialog" labelledBy="confirm-title">
      <div className="alert-text">
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
      </div>
      <div className="alert-actions">
        <button className="alert-btn" onClick={onCancel} data-autofocus>
          Cancel
        </button>
        <button className="alert-btn destructive" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
