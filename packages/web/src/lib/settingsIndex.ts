/**
 * Verzeichnis aller Einstellungen der Regie – Grundlage für die Suche (Kopfzeile, Strg/⌘+K) und
 * die Bereiche unter „Spiel einrichten“. Jede Einstellung steht auf ihrer Seite in einem Element
 * mit `data-setting="<id>"`; die Suche springt dorthin und hebt es kurz hervor.
 * Titel können je Welt anders heißen (Insel: Liane · Blockwelt: Ranke); gefunden wird beides.
 */
import { useEffect, useRef } from 'react';
import { useLocation, type NavigateFunction } from 'react-router';
import type { Theme } from '@insel/shared';

export type SettingArea = 'game' | 'beamer' | 'general' | 'page';

/** Bereiche der Seite „Spiel einrichten → Alle Einstellungen“ */
export const GAME_SECTIONS = [
  { id: 'allgemein', group: 'Grundlagen', icon: '📝', title: 'Name & Handys', sub: 'Wie das Spiel heißt und wie die Handys genutzt werden.' },
  { id: 'welt', group: 'Grundlagen', icon: '🌍', title: 'Welt & Stimmung', sub: 'In welcher Welt gespielt wird – dazu Wetter, Jahreszeit und Feste auf dem Beamer.' },
  { id: 'dauer', group: 'Grundlagen', icon: '⏱️', title: 'Spieldauer', sub: 'Wie lange das Spiel ungefähr dauern soll. Wirkt sofort.' },
  { id: 'inhalte', group: 'Inhalte', icon: '🎲', title: 'Was kommt dran?', sub: 'Arten von Inhalten und Sammlungen, aus denen gezogen wird.' },
  { id: 'ablauf', group: 'Inhalte', icon: '📋', title: 'Ablaufplan', sub: 'Optional eine feste Reihenfolge von Spielen und Fragen.' },
  { id: 'spielfeld', group: 'Spielfeld & Regeln', icon: '🗺️', title: 'Spielfeld', sub: 'Länge des Weges und Verteilung der Sonderfelder.' },
  { id: 'sieg', group: 'Spielfeld & Regeln', icon: '🏆', title: 'Würfel & Sieg', sub: 'Bonuswürfel für die Besten und wie man gewinnt.' },
  { id: 'felder', group: 'Spielfeld & Regeln', icon: '✨', title: 'Sonderfelder', sub: 'Was auf den Sonderfeldern passiert.' },
  { id: 'mutproben', group: 'Spielfeld & Regeln', icon: '💪', title: 'Mutproben', sub: 'Feste Stationen auf dem Weg – jede lässt sich abschalten.' },
  { id: 'vulkan', group: 'Spielfeld & Regeln', icon: '🌋', title: 'Vulkan', blocks: 'Vulkan & Nether', sub: 'Druck, Ausbruch und das Innere des Vulkans.' },
  { id: 'fragen', group: 'Spielfeld & Regeln', icon: '❓', title: 'Fragen & Antworten', sub: 'Wie Fragen ausgewertet werden.' },
] as const;
export type GameSection = (typeof GAME_SECTIONS)[number]['id'];

export interface SettingEntry {
  id: string;
  area: SettingArea;
  /** Bereich auf der Seite (bei „Spiel einrichten“ ein GameSection) */
  section: string;
  icon: string;
  title: string;
  /** Titel in der Blockwelt, falls anders */
  blocks?: string;
  /** weitere Suchbegriffe (auch die der anderen Welt) */
  keywords?: string;
  hint?: string;
  admin?: boolean;
}

export const AREA_INFO: Record<SettingArea, { label: string; route: string }> = {
  game: { label: 'Spiel einrichten', route: '/regie/einrichten' },
  beamer: { label: 'Beamer', route: '/regie/beamer' },
  general: { label: 'Einstellungen', route: '/regie/einstellungen' },
  page: { label: 'Regie', route: '/regie' },
};

const BEAMER_SECTIONS: Record<string, string> = { status: 'Beamer', bild: 'Bild', ton: 'Ton & Musik', kommentator: 'Kommentator', kamera: 'Kamera' };
const GENERAL_SECTIONS: Record<string, string> = { du: 'Für dich', spiel: 'Spiel & Geräte', server: 'Server' };
/** Eigene Seiten der Regie (Bereich „page“): Abschnitt = Pfad */
const PAGE_LABEL: Record<string, string> = { '/regie': 'Live', '/regie/teams': 'Teams', '/regie/bibliothek': 'Bibliothek', '/regie/spiele': 'Spiele', '/regie/konten': 'Konten' };

const g = (section: GameSection, id: string, icon: string, title: string, more: Partial<SettingEntry> = {}): SettingEntry => ({ id: `g.${id}`, area: 'game', section, icon, title, ...more });
const b = (section: string, id: string, icon: string, title: string, more: Partial<SettingEntry> = {}): SettingEntry => ({ id: `b.${id}`, area: 'beamer', section, icon, title, ...more });
const o = (section: string, id: string, icon: string, title: string, more: Partial<SettingEntry> = {}): SettingEntry => ({ id: `o.${id}`, area: 'general', section, icon, title, ...more });
const p = (route: string, id: string, icon: string, title: string, more: Partial<SettingEntry> = {}): SettingEntry => ({ id: `p.${id}`, area: 'page', section: route, icon, title, ...more });

export const SETTINGS: SettingEntry[] = [
  // Spiel einrichten
  g('allgemein', 'name', '📝', 'Name des Spiels', { keywords: 'titel umbenennen bezeichnung' }),
  g('allgemein', 'devices', '📱', 'Handys: eigenes Gerät oder geteilt', { keywords: 'anmeldestation tablet team-pin pin selfie geräte gruppen teilen smartphone' }),
  g('allgemein', 'template', '🔖', 'Als Vorlage speichern', { keywords: 'vorlage template wiederverwenden kopie' }),
  g('welt', 'world', '🌍', 'Welt: Insel oder Blockwelt', { keywords: 'minecraft blockwelt insel theme optik aussehen design welt wechseln pixel klötzchen' }),
  g('welt', 'weather', '🌦️', 'Wetter', { keywords: 'regen schnee gewitter blitz nebel sonne sonnig wolken bewölkt sturm', hint: 'wirkt sofort auf dem Beamer' }),
  g('welt', 'season', '🍂', 'Jahreszeit', { keywords: 'frühling sommer herbst winter datum', hint: 'wirkt sofort auf dem Beamer' }),
  g('welt', 'festive', '🎃', 'Halloween & Weihnachten', { keywords: 'festzeit fest feiertag deko kürbis weihnachtsbaum geschenke advent', hint: 'wirkt sofort auf dem Beamer' }),
  g('dauer', 'duration', '⏱️', 'Spieldauer & Spiel-Tempo', { keywords: 'minuten zeit dauer tempo beschleunigen verlangsamen schneller langsamer ende uhrzeit' }),
  g('inhalte', 'kinds', '🎲', 'Was kommt per Zufall dran?', { keywords: 'minispiele fragen schätzfrage buzzer freitext auswahlfrage arten inhalte zufall' }),
  g('inhalte', 'collections', '📚', 'Sammlungen für dieses Spiel', { keywords: 'fragen spiele pool bibliothek kategorien' }),
  g('ablauf', 'plan', '📋', 'Ablaufplan (feste Reihenfolge)', { keywords: 'reihenfolge plan programm nacheinander' }),
  g('spielfeld', 'boardSize', '📏', 'Anzahl Felder (Länge des Spielfelds)', { keywords: 'felder länge ziel gipfel runden größe brett weg' }),
  g('spielfeld', 'boardShuffle', '🔀', 'Sonderfelder neu verteilen', { keywords: 'mischen zufall verteilung shuffle' }),
  g('spielfeld', 'boardMap', '🗺️', 'Einzelne Felder ändern (Karte)', { keywords: 'feldtyp karte draufsicht editor feld ändern' }),
  g('sieg', 'bonusDice', '🎲', 'Bonuswürfel nach Platz', { keywords: 'zusatzwürfel extra würfel platzierung platz w6 w4 belohnung' }),
  g('sieg', 'winRule', '🏆', 'Siegbedingung', { keywords: 'gewinnen sieg siegeswurf ziel gipfel genau exakt zurückprallen ende' }),
  g('felder', 'catapultForward', '🚀', 'Katapult vorwärts', { blocks: 'Schleimblock (Katapult vorwärts)', keywords: 'sprungfeder feder schleim slime schleimblock vorwärts nach vorne' }),
  g('felder', 'catapultBackward', '💥', 'Katapult rückwärts', { blocks: 'Knaller (Katapult rückwärts)', keywords: 'flugzeug creeper knaller explosion zurück rückwärts' }),
  g('felder', 'swap', '🔄', 'Platztausch', { blocks: 'Teleport-Perle (Platztausch)', keywords: 'ufo tausch enderperle teleport perle tauschen abstand' }),
  g('felder', 'barrier', '🚧', 'Sperre: zum Befreien würfeln', { blocks: 'Spinnennetz: zum Befreien würfeln', keywords: 'käfig sperre spinnennetz gefangen festsitzen befreien' }),
  g('felder', 'barrierAuto', '🔓', 'Sperre öffnet sich automatisch', { blocks: 'Spinnennetz löst sich automatisch', keywords: 'fehlversuche käfig sperre spinnennetz automatisch öffnen' }),
  g('felder', 'fieldGames', '🎮', 'Feld-Minispiele', { keywords: 'minispiel-feld duell alle gegen modus' }),
  g('felder', 'fieldReward', '🏃', 'Belohnung & Strafe beim Feld-Minispiel', { keywords: 'felder vor zurück sieg niederlage' }),
  g('mutproben', 'vine', '🌿', 'Liane', { blocks: 'Ranke', keywords: 'liane ranke bach schwingen mutprobe' }),
  g('mutproben', 'river', '🛢️', 'Fässer oder Kisten', { keywords: 'fluss wasserfall fässer kisten einbrechen schwimmen mutprobe chance' }),
  g('mutproben', 'cave', '🦇', 'Lavahöhle', { keywords: 'höhle lavahöhle serpentinen mindestens würfeln mutprobe' }),
  g('mutproben', 'crater', '🕳️', 'Kraterloch', { keywords: 'krater loch rausklettern augen sammeln mutprobe' }),
  g('vulkan', 'volcano', '🌋', 'Vulkanausbruch an/aus', { keywords: 'vulkan ausbruch druck vulkanfeld eruption' }),
  g('vulkan', 'volcanoPressure', '🌡️', 'Druck bis zum Ausbruch', { keywords: 'druck runde vulkanfeld schwelle anheizen vulkandruck' }),
  g('vulkan', 'volcanoZone', '⛰️', 'Gefahrenzone & Rückschlag', { keywords: 'gefahrenzone zurückfliegen rückschlag gipfel ausbruch' }),
  g('vulkan', 'inside', '🔥', 'Vulkan-Inneres', { blocks: 'Nether', keywords: 'vulkan-inneres inneres nether totenkopf boden bricht weg strafweg lava' }),
  g('vulkan', 'insideLength', '🪜', 'Strafweg im Vulkan-Inneren', { blocks: 'Strafweg im Nether', keywords: 'länge ausgangsfeld glowstone netherziegel lava-inseln nether' }),
  g('fragen', 'bonusCorrect', '✅', 'Bonus nur für richtige Antworten', { keywords: 'bonuswürfel falsch richtig fragen' }),
  g('fragen', 'autoClose', '⏹️', 'Antworten automatisch schließen', { keywords: 'alle geantwortet automatisch schließen fragen' }),
  // Beamer
  b('status', 'status', '🖥️', 'Verbundene Beamer', { keywords: 'bildrate fps verbunden status beamer ton gesperrt' }),
  b('status', 'pair', '🔑', 'Neuen Beamer freigeben (Code)', { keywords: 'code freigeben koppeln sechsstellig zugang' }),
  b('status', 'reload', '🔄', 'Beamer neu laden', { keywords: 'reload aktualisieren hängt' }),
  b('status', 'explainer', '🎙️', 'Spielerklärung starten', { keywords: 'erklärung intro tutorial erklärvideo dimario regeln erklären' }),
  b('bild', 'quality', '✨', 'Grafikstufe', { keywords: 'qualität grafik leistung schön schnell ruckelt flüssig' }),
  b('bild', 'resolution', '🔍', 'Auflösung', { keywords: 'auflösung schärfe pixel unscharf' }),
  b('bild', 'fullscreen', '🖼️', 'Vollbild', { keywords: 'fullscreen ganzer bildschirm' }),
  b('bild', 'hud', '📊', 'Rangliste & Kopfzeile', { keywords: 'hud rangliste anzeige oben punktestand' }),
  b('bild', 'tags', '🏷️', 'Namensschilder', { keywords: 'namen schilder teamnamen' }),
  b('bild', 'photos', '📸', 'Foto-Blasen beim Ziehen', { keywords: 'selfie foto blasen bilder' }),
  b('bild', 'fps', '📈', 'Bildrate anzeigen', { keywords: 'fps bildrate' }),
  b('ton', 'master', '🔊', 'Gesamtlautstärke', { keywords: 'lautstärke laut leise ton' }),
  b('ton', 'music', '🎵', 'Musik an/aus', { keywords: 'musik lautstärke leiser lauter' }),
  b('ton', 'musicTrack', '🎼', 'Musikstück wählen', { keywords: 'lied song track stück abwechseln musik' }),
  b('ton', 'sound', '💫', 'Effekte (Geräusche)', { keywords: 'sound geräusche effekte ton' }),
  b('ton', 'ambience', '🌊', 'Umgebungsgeräusche', { keywords: 'meer dschungel vulkan atmo hintergrund ton' }),
  b('kommentator', 'voice', '🎤', 'Kommentator an/aus', { keywords: 'dimario sprecher stimme ansager moderator lautstärke' }),
  b('kommentator', 'commentary', '💬', 'Wie oft der Kommentator spricht', { keywords: 'quatschkopf sprüche viel wenig nie kommentar' }),
  b('kommentator', 'chatter', '🤪', 'Zwischendurch plaudern (Quatschkopf)', { keywords: 'sprüche pro minute plaudern' }),
  b('kamera', 'cameraStyle', '🎥', 'Kamera: ruhig oder lebhaft', { keywords: 'kamera stil ruhig lebhaft' }),
  b('kamera', 'reactions', '😮', 'Reaktion nach jedem Zug', { keywords: 'reaktion zug kamera' }),
  b('kamera', 'cameraInside', '🌋', 'In den Vulkan schauen', { blocks: 'In den Nether schauen', keywords: 'vulkan nether inneres besuch kamera' }),
  b('kamera', 'cameraPad', '🕹️', 'Kamera steuern (Steuerkreuz)', { keywords: 'kamera steuern zoomen drehen schieben team ansicht' }),
  b('kamera', 'reset', '♻️', 'Beamer-Einstellungen zurücksetzen', { keywords: 'reset standard zurücksetzen' }),
  // Einstellungen
  o('du', 'account', '👤', 'Mein Konto', { keywords: 'konto passwort email e-mail name ändern profil' }),
  o('du', 'regieTheme', '🌗', 'Darstellung der Regie (hell/dunkel)', { keywords: 'dark mode dunkel hell nachtmodus design' }),
  o('spiel', 'joinUrl', '🔗', 'Beitritts-Adresse & QR-Code', { keywords: 'adresse url link tunnel wlan qr beitreten online' }),
  o('spiel', 'moderator', '🎙️', 'Moderator verbinden (QR-Code)', { keywords: 'moderator vorleser link qr' }),
  o('spiel', 'photosDelete', '🗑️', 'Alle Fotos löschen', { keywords: 'datenschutz fotos selfies löschen' }),
  o('server', 'appName', '🏷️', 'Name der App (alle Spiele)', { keywords: 'app name titel server', admin: true }),
  o('server', 'smtp', '✉️', 'E-Mail-Versand', { keywords: 'smtp mail email versand einladung', admin: true }),
  // Andere Seiten
  p('/regie/teams', 'teams', '👥', 'Teams einteilen', { keywords: 'teams einteilen mischen farben namen spieler' }),
  p('/regie/bibliothek', 'library', '📚', 'Fragen & Minispiele bearbeiten', { keywords: 'bibliothek inhalte fragen minispiele sammlungen import' }),
  p('/regie/spiele', 'games', '🗂️', 'Spiele & Vorlagen', { keywords: 'spiel wechseln neues spiel laden vorlagen export löschen' }),
  p('/regie/konten', 'accounts', '🔐', 'Konten verwalten', { keywords: 'spielleiter konten benutzer einladen', admin: true }),
];

export const settingById = (id: string) => SETTINGS.find((e) => e.id === id);
export const settingTitle = (e: SettingEntry, theme: Theme) => (theme === 'blocks' && e.blocks) || e.title;
export const sectionTitle = (s: (typeof GAME_SECTIONS)[number], theme: Theme) => (theme === 'blocks' && 'blocks' in s && s.blocks) || s.title;

/** Wo die Einstellung steht, z. B. „Spiel einrichten › Vulkan“ */
export function settingPlace(e: SettingEntry, theme: Theme): string {
  if (e.area === 'page') return PAGE_LABEL[e.section] ?? 'Regie';
  const sec = e.area === 'game' ? GAME_SECTIONS.find((s) => s.id === e.section) : null;
  const label = sec ? sectionTitle(sec, theme) : e.area === 'beamer' ? BEAMER_SECTIONS[e.section] : GENERAL_SECTIONS[e.section];
  return label ? `${AREA_INFO[e.area].label} › ${label}` : AREA_INFO[e.area].label;
}

/** Kleinbuchstaben, ohne Akzente; ä/ae, ö/oe, ü/ue und ß/ss gelten gleich */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u');
}

/** Einstellungen passend zur Suche, beste zuerst. Alle Wörter müssen vorkommen. */
export function searchSettings(query: string, theme: Theme, admin: boolean): SettingEntry[] {
  const tokens = normalize(query).split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored: { e: SettingEntry; score: number; i: number }[] = [];
  SETTINGS.forEach((e, i) => {
    if (e.admin && !admin) return;
    const title = normalize(`${settingTitle(e, theme)} ${e.blocks && theme !== 'blocks' ? e.blocks : e.title}`);
    const rest = normalize(`${e.keywords ?? ''} ${settingPlace(e, theme)} ${e.hint ?? ''}`);
    let score = 0;
    for (const t of tokens) {
      const words = title.split(/[^a-z0-9]+/);
      if (words.some((w) => w.startsWith(t))) score += 10;
      else if (title.includes(t)) score += 6;
      else if (rest.split(/[^a-z0-9]+/).some((w) => w.startsWith(t))) score += 4;
      else if (rest.includes(t)) score += 2;
      else return;
    }
    scored.push({ e, score, i });
  });
  return scored.sort((x, y) => y.score - x.score || x.i - y.i).map((x) => x.e);
}

/** Vorschläge für die leere Suche */
export const SUGGESTED = ['g.world', 'g.weather', 'b.master', 'b.quality', 'g.volcano', 'g.duration'];

/** Zur Einstellung springen: Seite öffnen, dort Bereich wählen, hinscrollen, kurz hervorheben. */
export function goToSetting(navigate: NavigateFunction, e: SettingEntry) {
  const route = e.area === 'page' ? e.section : AREA_INFO[e.area].route;
  navigate(route, { state: { focusSetting: e.id } });
}

/**
 * Auf der Zielseite: angefragte Einstellung anzeigen. `onEntry` wird vorher aufgerufen (z. B. um den
 * richtigen Bereich zu öffnen); danach wird das Element gesucht, hingescrollt und hervorgehoben.
 */
export function useSettingFocus(onEntry?: (e: SettingEntry) => void) {
  const location = useLocation();
  const cb = useRef(onEntry);
  cb.current = onEntry;
  useEffect(() => {
    const id = (location.state as { focusSetting?: string } | null)?.focusSetting;
    const entry = id ? settingById(id) : undefined;
    if (!entry) return;
    cb.current?.(entry);
    let tries = 0;
    let timer = 0;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-setting="${entry.id}"]`);
      if (!el) {
        if (tries++ < 30) timer = window.setTimeout(tick, 50);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('setting-flash');
      void el.offsetWidth; // Animation neu starten
      el.classList.add('setting-flash');
      timer = window.setTimeout(() => el.classList.remove('setting-flash'), 2600);
    };
    timer = window.setTimeout(tick, 60);
    return () => clearTimeout(timer);
  }, [location.key, location.state]);
}
