import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { create } from 'zustand';

interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let seq = 0;

function push(kind: ToastItem['kind'], text: string, ms = kind === 'error' ? 5000 : 2600) {
  const id = ++seq;
  useToasts.setState((s) => ({ items: [...s.items.slice(-3), { id, kind, text }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), ms);
}

export const toast = {
  success: (t: string) => push('success', t),
  error: (t: string) => push('error', t),
  info: (t: string) => push('info', t),
};

const ICON = { success: CheckCircle2, error: XCircle, info: Info };
const COLOR = { success: 'text-good', error: 'text-bad', info: 'text-accent' };

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {items.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="card pointer-events-auto flex max-w-md items-center gap-3 px-4 py-3 text-sm font-semibold shadow-lifted"
              role={t.kind === 'error' ? 'alert' : 'status'}
            >
              <Icon className={`size-5 shrink-0 ${COLOR[t.kind]}`} />
              <span>{t.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
