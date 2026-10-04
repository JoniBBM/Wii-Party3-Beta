import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { Button, IconButton } from './basics.tsx';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`card flex max-h-[92dvh] w-full ${width} flex-col overflow-hidden rounded-b-none shadow-lifted sm:rounded-b-[22px]`}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <h2 className="text-lg font-semibold">{title}</h2>
              <IconButton label="Schließen" onClick={onClose}>
                <X className="size-5" />
              </IconButton>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface ConfirmRequest {
  title: string;
  text?: ReactNode;
  confirm?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirm = create<{ req: ConfirmRequest | null }>(() => ({ req: null }));

/** Bestätigungsdialog als Promise: `if (await confirm({...})) …` */
export function confirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirm.setState({ req: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const req = useConfirm((s) => s.req);
  const [last, setLast] = useState<ConfirmRequest | null>(null);
  useEffect(() => {
    if (req) setLast(req);
  }, [req]);
  const close = (ok: boolean) => {
    req?.resolve(ok);
    useConfirm.setState({ req: null });
  };
  const shown = req ?? last;
  return (
    <Modal
      open={!!req}
      onClose={() => close(false)}
      title={shown?.title ?? ''}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Abbrechen
          </Button>
          <Button variant={shown?.danger ? 'bad' : 'primary'} onClick={() => close(true)} autoFocus>
            {shown?.confirm ?? 'OK'}
          </Button>
        </>
      }
    >
      <div className="text-ink-2">{shown?.text}</div>
    </Modal>
  );
}
