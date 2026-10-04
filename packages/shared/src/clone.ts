/** Tiefe Kopie (structuredClone gibt es in Node und allen Browsern, nur nicht im ES-Typ-Lib). */
export function clone<T>(value: T): T {
  return (globalThis as unknown as { structuredClone: <V>(v: V) => V }).structuredClone(value);
}
