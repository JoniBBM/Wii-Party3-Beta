/** Bibliothek: Sammlungen mit Spielen und Fragen verwalten, importieren, exportieren. */
import { useRef, useState } from 'react';
import { Copy, Download, FolderPlus, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { CONTENT_KIND_INFO, PLAYER_COUNT_LABEL, type Collection, type ContentItem, type ContentItemInput } from '@insel/shared';
import { api, downloadFile } from '../../lib/api.ts';
import { useAsync } from '../../lib/hooks.ts';
import { reloadLibrary, useLibrary } from '../../lib/library.ts';
import { Badge, Button, Card, EmptyState, IconButton } from '../../ui/basics.tsx';
import { confirm, Modal } from '../../ui/overlay.tsx';
import { toast } from '../../ui/toast.tsx';
import { ItemEditor } from './ItemEditor.tsx';

export function LibraryPage() {
  const { collections, items, loaded } = useLibrary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editColl, setEditColl] = useState<Collection | 'new' | null>(null);
  const [editItem, setEditItem] = useState<ContentItem | 'new' | null>(null);
  const [q, setQ] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const { busy, run } = useAsync();

  const selected = collections.find((c) => c.id === selectedId) ?? collections[0] ?? null;
  const list = items.filter((i) => i.collectionId === selected?.id).filter((i) => {
    if (!q) return true;
    return `${i.title} ${'question' in i ? i.question : ''}`.toLowerCase().includes(q.toLowerCase());
  });

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const r = await run(() => api<{ collections: number; items: number }>('/api/library/import', { slot: 'admin', body: json }));
      if (r) toast.success(`${r.items} Inhalte in ${r.collections} Sammlung(en) importiert`);
      await reloadLibrary();
    } catch {
      toast.error('Die Datei ist kein gültiges JSON');
    }
  };

  const saveItem = async (input: ContentItemInput) => {
    const r =
      editItem === 'new'
        ? await run(() => api(`/api/library/collections/${selected!.id}/items`, { slot: 'admin', body: input }), 'Inhalt angelegt')
        : await run(() => api(`/api/library/items/${(editItem as ContentItem).id}`, { method: 'PUT', slot: 'admin', body: input }), 'Gespeichert');
    if (r) {
      setEditItem(null);
      await reloadLibrary();
    }
  };

  if (!loaded) return null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bibliothek</h1>
          <p className="text-sm text-muted">
            {collections.length} Sammlungen · {items.length} Spiele & Fragen
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Upload className="size-4" />} loading={busy} onClick={() => fileInput.current?.click()}>
            Importieren
          </Button>
          <Button icon={<Download className="size-4" />} onClick={() => downloadFile('/api/library/export', 'admin').catch((e: Error) => toast.error(e.message))}>
            Alles exportieren
          </Button>
          <Button variant="primary" icon={<FolderPlus className="size-4" />} onClick={() => setEditColl('new')}>
            Sammlung
          </Button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importFile(e.target.files?.[0])} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden">
          <ul className="flex flex-col">
            {collections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center gap-2 border-b border-line px-4 py-3 text-left last:border-0 ${selected?.id === c.id ? 'bg-accent-soft' : 'hover:bg-bg-2'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-bold ${selected?.id === c.id ? 'text-accent' : ''}`}>{c.name}</span>
                    {c.description && <span className="block truncate text-xs text-muted">{c.description}</span>}
                  </span>
                  <Badge>{c.itemCount}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {selected ? (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              <h2 className="min-w-0 flex-1 truncate text-xl font-semibold">{selected.name}</h2>
              <IconButton label="Sammlung umbenennen" onClick={() => setEditColl(selected)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label="Sammlung exportieren" onClick={() => downloadFile(`/api/library/export?collectionId=${selected.id}`, 'admin').catch((e: Error) => toast.error(e.message))}>
                <Download className="size-4" />
              </IconButton>
              <IconButton
                label="Sammlung löschen"
                className="text-bad"
                onClick={async () => {
                  if (await confirm({ title: `„${selected.name}“ löschen?`, text: `Alle ${selected.itemCount} Inhalte dieser Sammlung werden gelöscht.`, confirm: 'Löschen', danger: true })) {
                    await run(() => api(`/api/library/collections/${selected.id}`, { method: 'DELETE', slot: 'admin' }), 'Sammlung gelöscht');
                    setSelectedId(null);
                    await reloadLibrary();
                  }
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
              <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditItem('new')}>
                Inhalt
              </Button>
            </div>
            <div className="border-b border-line px-5 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input className="field h-10 pl-9" placeholder="In dieser Sammlung suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            {list.length === 0 ? (
              <EmptyState icon="📭" title={q ? 'Nichts gefunden' : 'Noch leer'}>
                {!q && 'Lege das erste Spiel oder die erste Frage an.'}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((i) => (
                  <li key={i.id} className="group flex items-center gap-3 px-5 py-2.5 hover:bg-bg-2">
                    <span className="text-xl" title={CONTENT_KIND_INFO[i.kind].label}>
                      {CONTENT_KIND_INFO[i.kind].icon}
                    </span>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditItem(i)}>
                      <span className="block truncate font-bold">{i.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {'question' in i ? i.question : i.description || PLAYER_COUNT_LABEL[i.playerCount]}
                      </span>
                    </button>
                    {i.fieldModes.length > 0 && <Badge tone="accent">Feldspiel</Badge>}
                    {!i.roundUse && <Badge>nicht in Runden</Badge>}
                    {i.timerSec && <Badge>{i.timerSec}s</Badge>}
                    {i.audioUrl ? <Badge tone="good">🔊 Audio</Badge> : i.audioRequest ? <Badge tone="warn">🎙️ Audio angefordert</Badge> : null}
                    <IconButton
                      label="Duplizieren"
                      className="size-8 opacity-0 group-hover:opacity-100"
                      onClick={async () => {
                        await run(() => api(`/api/library/items/${i.id}/duplicate`, { slot: 'admin', body: {} }), 'Kopie angelegt');
                        await reloadLibrary();
                      }}
                    >
                      <Copy className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Löschen"
                      className="size-8 text-bad opacity-0 group-hover:opacity-100"
                      onClick={async () => {
                        if (await confirm({ title: `„${i.title}“ löschen?`, confirm: 'Löschen', danger: true })) {
                          await run(() => api(`/api/library/items/${i.id}`, { method: 'DELETE', slot: 'admin' }));
                          await reloadLibrary();
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card>
            <EmptyState icon="📚" title="Noch keine Sammlung">Lege eine Sammlung an oder importiere eine Datei.</EmptyState>
          </Card>
        )}
      </div>

      {editItem && (
        <ItemEditor key={editItem === 'new' ? 'new' : editItem.id} open item={editItem === 'new' ? null : editItem} onClose={() => setEditItem(null)} onSave={saveItem} busy={busy} />
      )}
      {editColl && <CollectionModal coll={editColl === 'new' ? null : editColl} onClose={() => setEditColl(null)} onSaved={(id) => setSelectedId(id)} />}
    </div>
  );
}

function CollectionModal({ coll, onClose, onSaved }: { coll: Collection | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(coll?.name ?? '');
  const [description, setDescription] = useState(coll?.description ?? '');
  const { busy, run } = useAsync();
  const save = async () => {
    const r = await run(() =>
      coll
        ? api<Collection>(`/api/library/collections/${coll.id}`, { method: 'PUT', slot: 'admin', body: { name, description } })
        : api<Collection>('/api/library/collections', { slot: 'admin', body: { name, description } }),
    );
    if (r) {
      await reloadLibrary();
      onSaved(r.id);
      onClose();
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={coll ? 'Sammlung bearbeiten' : 'Neue Sammlung'}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save}>
          Speichern
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <input className="field" placeholder="Name, z. B. Sommerfreizeit 2026" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <input className="field" placeholder="Beschreibung (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  );
}
