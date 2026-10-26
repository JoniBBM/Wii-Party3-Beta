---
name: Tiere der Insel
type: module
layer: grafik
path: [packages/web/src/board/animals.ts, packages/web/src/board/birds.ts, packages/web/src/board/swarms.ts, packages/web/src/board/monkey.ts, packages/web/src/board/rig.ts]
tech: [three.js, glsl]
zone: client
provides:
  - call AnimalWorld – Tiere bewegen (update) und melden, ob eine Tierart gerade im Bild ist (inView); Blockwelt-Mobs und Weltall-Bewohner liefern dieselbe Schnittstelle
uses:
  - insel: call "Höhenmodell, Inselplan, Baumkronen, Blumen und Sitzplätze als Aufenthaltsorte"
  - szene: call "Sichtprüfung der Kamera, Modelle laden, Rauschen"
  - spielfeld: call "Lage von Lagune und Fluss"
  - medien: http "GET /assets/models/animals (Delfin, Wal, Manta, Krabbe, Frosch, Schildkröten)" [auth=none, tls, tunnel, im WLAN-Betrieb http]
files:
  - animals.ts: Baut und steuert alle Tiere der Insel – Delfine, Wal, Mantas, Schildkröten, Krabben, Frösche (Modelle mit Animationen), Flamingos, Möwen, Papageien, Tukane, Affen, Fische und Schmetterlinge; Tiere außerhalb des Bildes werden seltener bewegt. Mit der Beamer-Adresse „?zoo“ stehen alle Arten zur Kontrolle nebeneinander.
  - birds.ts: Vögel aus Grundkörpern (Papagei, Tukan, Möwe) und Flamingos – sitzende Vögel drehen den Kopf, putzen sich, fliegen ab und zu weiter; fliegende schlagen mit den Flügeln und legen sich in die Kurve.
  - swarms.ts: Fischschwärme und Schmetterlinge – ein Zeichenaufruf je Schwarm, Bahn und Flügelschlag rechnet die Grafikkarte.
  - monkey.ts: Affen im Stil der Spielfiguren – sitzen, kratzen sich, essen Bananen, schaukeln, springen und winken mit weichen Übergängen.
  - rig.ts: Baukasten für selbst gebaute Tiere – Körperteile hängen starr an Knochen, das ganze Tier ist ein Objekt (ein Zeichenaufruf); Posen lassen sich weich überblenden.
---
Lebendige Insel: Tiere im Wasser, am Strand und in den Bäumen, die sich ruhig und natürlich bewegen, ohne die Bildrate zu belasten.

**Zwei Bauarten.** Meerestiere, Krabben, Frösche und Schildkröten sind freie Modelle mit eingebauten Animationen aus [[medien]]. Affen, Papageien, Tukane, Möwen und Flamingos sind selbst aus Grundkörpern gebaut: Jedes Körperteil hängt starr an einem „Knochen“, das ganze Tier ist ein einziges Objekt und kostet nur einen Zeichenaufruf; Bewegungen entstehen durch Drehen der Knochen. Fische und Schmetterlinge sind Schwärme, deren Bahn komplett die Grafikkarte berechnet.

**Ruhiges Bild.** Die Tiere laufen auf einer eigenen Uhr mit begrenzten Zeitschritten – nach einem Ruckler springt keins. Tiere im Blickfeld werden in jedem Bild bewegt, alle anderen nur in jedem vierten. Unter Wasser wirft nichts Schatten.

**Kommentator.** Über „inView“ fragt der Kommentator ([[stimmung]]), ob ein Tier gerade wirklich zu sehen ist – nur dann kommt ein passender Tier-Spruch.

Die anderen Welten haben eigene Bewohner mit derselben Schnittstelle: Nutztiere und Mobs in der [[blockwelt]], Aliens, Drohnen und Plasma-Quallen im [[weltall]].
