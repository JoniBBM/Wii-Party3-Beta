/** Foto vor dem Hochladen verkleinern (spart Zeit im WLAN). */
export async function downscaleImage(file: File, max = 720): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.86));
  } catch {
    return file;
  }
}

export async function uploadPhoto(blob: Blob, token: string | null, playerId?: string): Promise<string> {
  const form = new FormData();
  if (playerId) form.append('playerId', playerId);
  form.append('photo', blob, 'foto.jpg');
  const res = await fetch('/api/media/photo', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { photo?: string; error?: string };
  if (!res.ok || !data.photo) throw new Error(data.error ?? 'Foto konnte nicht hochgeladen werden');
  return data.photo;
}
