import { useRef, useState } from 'react';
import { Camera, ImageUp, Trash2 } from 'lucide-react';
import { downscaleImage } from '../lib/image.ts';
import { Button } from './basics.tsx';

/**
 * Selfie aufnehmen oder Bild wählen. `capture="user"` öffnet auf Handys direkt die Frontkamera
 * und funktioniert auch ohne HTTPS (im Gegensatz zu getUserMedia).
 */
export function PhotoPicker({
  current,
  emoji,
  onPick,
  onRemove,
  busy,
}: {
  current: string | null;
  emoji: string;
  onPick: (blob: Blob) => void | Promise<void>;
  onRemove?: () => void;
  busy?: boolean;
}) {
  const cam = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handle = async (f: File | undefined) => {
    if (!f) return;
    const blob = await downscaleImage(f);
    setPreview(URL.createObjectURL(blob));
    await onPick(blob);
  };

  const shown = preview ?? current;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative grid size-40 place-items-center overflow-hidden rounded-full border-4 border-white bg-accent-soft shadow-lifted">
        {shown ? <img src={shown} alt="Dein Foto" className="size-full object-cover" /> : <span className="text-7xl">{emoji}</span>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" icon={<Camera className="size-5" />} loading={busy} onClick={() => cam.current?.click()}>
          Selfie
        </Button>
        <Button variant="soft" icon={<ImageUp className="size-5" />} disabled={busy} onClick={() => file.current?.click()}>
          Bild wählen
        </Button>
        {shown && onRemove && (
          <Button
            variant="ghost"
            icon={<Trash2 className="size-5" />}
            disabled={busy}
            onClick={() => {
              setPreview(null);
              onRemove();
            }}
          >
            Entfernen
          </Button>
        )}
      </div>
      <input ref={cam} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => void handle(e.target.files?.[0])} />
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void handle(e.target.files?.[0])} />
    </div>
  );
}
