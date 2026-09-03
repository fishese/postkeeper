import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { t } from '../i18n';

/** Native dialog supplies focus containment, Escape handling and focus restoration. */
export function Sheet({
  open,
  onClose,
  title,
  id,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  id: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={`${id}-title`}
      onCancel={onClose}
      onClose={onClose}
    >
      <header className="sheet-header">
        <h2 id={`${id}-title`}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('common.close')}
          onClick={onClose}
          autoFocus
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
