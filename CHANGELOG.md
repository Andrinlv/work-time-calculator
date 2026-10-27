# Änderungen

Alle nennenswerten Änderungen an Zeitkonto. Das Format folgt lose
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionierung
[SemVer](https://semver.org/lang/de/).

## [1.3.0] — 2026-10-19

### Wichtig vorab — das Zeitkonto steigt

- **Pausenrecht nach Arbeitszeit.** ArG Art. 15, ArbZG §4 und AZG §11 knüpfen die
  Pflichtpause an die *Arbeitszeit*, nicht an die Anwesenheit. Bisher stieg ein Tag
  07:30–17:00 mit 30 min Mittag (genau 9 h Arbeit) fälschlich in die Stundenstufe
  und verlor 30 min. Jetzt gilt die kleinste Pause, nach der die verbleibende
  Arbeitszeit die Stufe nicht mehr erreicht (5 h 40 anwesend → 10 min). Typische
  Bürotage gewinnen dadurch bis zu 30 min — mit den Testdaten steigt das Konto von
  +28:21 auf +51:17. Jeder geänderte Tag ist nachgerechnet.
- **Kurstage mit Stempelzeiten** zählen das Soll nicht mehr doppelt (+6 h statt +8 h 30).
- **Bezahlte Pausen** zählen zur Pflichtpause.

### Neu — Stempeln ohne Nachdenken

- **Stempelleiste nach Zustand.** Ein Hauptknopf, der immer das Richtige anbietet:
  Kommen → Gehen (+ Pause) → Pause beenden → Weiter arbeiten. Keine grauen Knöpfe
  mehr; jeder Stempel lässt sich rückgängig machen. *Gehen* schliesst eine offene Pause.
- **Stempeln per Direktlink, NFC-Tag oder App-Symbol.** Langes Drücken auf das
  Symbol bietet *Stempeln* und *Pause*; `…#/stamp` funktioniert auch auf einem
  NFC-Tag. Kommt man nach *Gehen* zurück, wird die Lücke zur Pause.
- **QR-Stempel-Plakat** für Spindtür oder Eingang (A4/A5, druckfertig, PNG).
  Der QR-Encoder ist selbst geschrieben und gegen zwei Referenz-Bibliotheken geprüft.
- **Nachtschichten über Mitternacht:** Gehen-Stempel, Countdown und Erinnerungen
  folgen der Schicht vom Vortag statt einen neuen Tag zu beginnen.
- **Lückenhilfe.** Erkennt vergessenes Kommen, Gehen, offene Pausen und Tage ohne
  Erfassung und trägt mit einem Tipp deine üblichen Zeiten nach (Median je
  Wochentag) — mit Vorschau, nie über Erfasstes, immer rückgängig zu machen.
- **Pausen-Timer** mit 15/30/45/60 min, dezentem Ton und Vibration.
- **Benachrichtigungen, die auf Android ankommen** — über den Serviceworker, mit
  Aktionsknöpfen *Gehen stempeln*, *Pause beenden*, *+15 min*.
- **Mini-Uhr** (Chrome/Edge am Desktop): ein schwebendes Fenster mit
  Feierabend-Countdown und Stempelknopf, immer sichtbar über Outlook und Excel.

### Neu — Planen und Verstehen

- **Zeitschieber.** Den Feierabend auf dem Zeitstrahl verschieben und sofort sehen,
  was das für Tagessaldo, Zeitkonto und Pflichtpause bedeutet — inklusive des
  Moments, ab dem die Stundenpause greift.
- **Schichtplan.** Rotationsmuster (z. B. Früh/Spät/Nacht) einmal eingeben; geplante
  Schichten erscheinen in Kalender, Woche und Heute, lassen sich mit einem Tipp
  übernehmen und zu kurze Ruhezeiten werden Wochen im Voraus gemeldet.
- **Pensum und Arbeitsmodell ab Stichtag.** Ein Wechsel auf 80 % ab 1. November
  rechnet die Vergangenheit nicht mehr um; die Einstellungen fragen, ab wann er gilt.
- **Monatsabschluss.** Ein sauber geprüfter Monat wird abgeschlossen: der Saldo ist
  eingefroren, Änderungen an abgeschlossenen Tagen werden auf allen Wegen
  abgefangen, der Rapport trägt den Vermerk. Dazu die **Lohnmeldung** als CSV mit
  frei wählbaren Lohnarten-Codes.
- **Erkenntnisse** in der Statistik: Arbeitsrhythmus als 24-Stunden-Uhr mit belegten
  Aussagen, Saldo-Prognose mit Wohlfühl-Korridor, **Überzeit nach ArG** (45/50 h,
  Jahreskontingent), Nacht-, Sonntags- und Feiertagsstunden, Homeoffice-Anteil.
- **Jahresrückblick** in neun Bildern, als Bild oder Text teilbar. Dazu **Momente**:
  höchstens eine kurze Zeile am Tag, etwa ein Ferien-Countdown.
- **Frag dein Zeitkonto.** „Wann kann ich gehen?", „wie vill Ferie hani no",
  „quand puis-je partir" — Antworten in der Schnellsuche, in fünf Sprachvarianten,
  mit genau den Zahlen der Ansichten.
- **Schichtvorlagen bearbeiten** in den Einstellungen (Name, Zeiten, bezahlte Pause).

### Datensicherheit

- **Mehrere Fenster** (installierte App und Browser-Tab) überschreiben sich nicht
  mehr: jedes Fenster merkt sich seine eigenen Änderungen und legt sie auf den
  neuesten gespeicherten Stand. *Rückgängig* nimmt nur Eigenes zurück.
- **Beschädigte Daten** werden nicht mehr still durch einen leeren Neustart ersetzt:
  die App bietet die automatische Sicherung an. Ein leerer Stand überschreibt nie
  eine gefüllte Sicherung; die Sicherung vom Vortag bleibt zusätzlich liegen.
- **Voller Speicher** beim Start zeigt trotzdem alle Daten; beim Speichern wird zuerst
  die ältere Sicherung geopfert.
- **Dauerhafter Speicher** wird beim Browser beantragt; die neue Karte
  *Datensicherheit* zeigt den Stand und stellt Sicherungen mit einem Klick wieder her.
- **Updates über GitHub Pages:** Seite und Programmdateien kommen immer aus derselben
  Version; eine neue Version wird still übernommen, sobald man die App verlässt.
  Der Serviceworker löscht nur noch eigene Caches.
- **Import** prüft und migriert eine Datei, bevor er etwas ändert; ein eigener
  CSV-Export lässt sich vollständig wieder einlesen.

### Behoben — rund 200 Befunde aus einem vollständigen Audit

- **Handy:** Seitenmenü lag unter seinem eigenen Abdunkler; Tableiste machte Seiten
  breiter als den Bildschirm; Kopfzeile, Querformat, Pausenzeilen auf Tablets.
- **Bedienung:** Die Leertaste stempelte auf jedem fokussierten Knopf; Neuzeichnen
  stahl Fokus und Scrollposition; Tooltips waren unsichtbar oder verbreiterten die Seite.
- **Darstellung:** Kalenderfarben und Level-Ring wurden nie angezeigt (CSS-Variablen);
  Ferien- und Feiertage zeigten „Kommen-Zeit eingeben"; ein laufender Tag erschien
  als rotes Minus; die Kopfzeile hiess „Tagessaldo", zeigte aber das Konto.
- **Kontrast nach WCAG 2.2 AA** in hell, dunkel und Kontrastmodus (vorher 364
  Befunde, jetzt 0). Druck ist immer hell.
- **Tempo:** Rapport „Alle" fror auf dem Handy bis zu 9 s ein, jetzt ≈ 0,2 s;
  Heute zeichnet nicht mehr jede Sekunde neu; Rückgängig kopiert nicht mehr pro
  Tastendruck den ganzen Datenbestand.
- **Rechnen:** laufende Pausen zählten als Arbeit; Feiertage galten als fehlende
  Arbeitstage; Ferien an Feiertagen verbrauchten Kontingent; Nachtschichten über
  die Zeitumstellung; Näfelser Fahrt und Waadtländer Feiertage.
- **Daten:** Schnellerfassung, Brückentage und *Zeitraum ausfüllen* überschreiben
  Erfasstes nur noch nach Rückfrage; Outlook-Termine mit „Ferien" im Titel werden
  nicht mehr zu ganzen Ferientagen; eigene Stempel werden nie vom Abgleich gelöscht.
- **Sprachen:** Browsersprache wird beim ersten Start erkannt; letzte fest
  verdrahtete deutsche Texte übersetzt; Feiertagsnamen und „KW" lokalisiert.

### Schlussprüfung vor der Freigabe

Vier unabhängige Prüfungen (Darstellung, Abläufe samt Update, Rechenlogik,
Sicherheit/Tempo) mit Gegenprüfung jedes Befunds. Behoben wurde unter anderem:

- **Erster Start nach dem Update** von 1.0/1.2 lief mit einer Mischung aus alten
  und neuen Programmdateien. Jede Datei trägt jetzt die Version in der Adresse
  (`?v=1.3.0`); der erste Aufruf nach dem Deploy ist fehlerfrei, die Daten bleiben.
- **Ein Zeitkonto überall:** Kopfzeile, Statistik, Zeitschieber, Jahresrückblick,
  Fragen und Pensum-Vorschau rechnen abgeschlossene Monate gleich. Nichts bietet
  mehr Änderungen an abgeschlossenen Tagen an.
- **Lückenhilfe kennt den Schichtplan** und schlägt die geplante Schicht vor;
  Planabweichungen einzelner Tage zählen nicht mehr als erfasster Tag.
- **Veraltete Benachrichtigungen stempeln nicht mehr blind**; erledigte werden
  zurückgezogen.
- Pausen-Timer zeichnet einmal statt sechzigmal pro Sekunde; Stempeln ist wieder
  so schnell wie in 1.2.
- Lohnmeldung zählt Ferien an Feiertagen als Feiertag; Durchschnittszeiten und
  „nicht erfasste Tage" sind in allen Ansichten gleich definiert; Text- und
  Kalender-Export in der App-Sprache; kaputte Einstellungen in einer Sicherung
  legen keine Ansicht mehr lahm.

### Technik

- **Erweiterungspunkte** (`ZK.Ext`): neue Funktionen hängen sich in Ansichten ein,
  ohne sie umzubauen; ein Fehler bleibt in seiner Erweiterung.
- Serviceworker-Version auf v1.3.0. Tests: von 178 auf über 800, darunter eine
  Klammerprüfung aller Stylesheets und ein Versionsabgleich zwischen App,
  Serviceworker, `package.json`, README und `index.html`.
- `dist/zeitkonto.html` neu gebaut (44 Skripte, ohne externe Abhängigkeiten).

## [1.2.0] — 2026-08-14

### Neu — Werkzeuge

- **Schnellerfassung.** Eine Zeile statt vier Felder: `gestern 7:45-16:30 p45`,
  `12.8.-16.8. ferien`, `morgen 6-14:30`. Datum (relativ, TT.MM oder ISO),
  Zeitspanne, Pause und Tagesart in beliebiger Reihenfolge, in vier Sprachen.
  Mit Vorschau samt berechnetem Saldo — auch aus der Schnellsuche heraus.
- **Gleitzeit-Planer.** Zielsaldo bis Stichtag eingeben; die App verteilt die
  Differenz auf die verbleibenden offenen Arbeitstage, nennt eine
  Beispiel-Gehenzeit und meldet, wenn der Plan über zehn Stunden je Tag verlangt.
  Dazu die Zahl der ganzen freien Tage, die im Saldo stecken.
- **Brückentage.** Sucht Zeiträume, in denen wenige Ferientage viele freie Tage
  ergeben — berechnet aus Feiertagsregion und Arbeitsmodell, überschneidungsfrei
  und nach Ausbeute sortiert. Ein Klick trägt die Ferientage ein.
- **Monatscheck.** Fasst vor dem Abschluss zusammen, was offen ist: nicht
  erfasste Tage, angefangene Tage ohne Gehen-Zeit, automatische Pausenabzüge,
  überschrittene Höchstarbeitszeiten, zu kurze Ruhezeiten, unlesbare Eingaben.

### Neu — Alltag

- **Schichtvorlagen** (Büro, Früh, Spät, Nacht) als Knöpfe in der Tagesansicht;
  ein Klick füllt Kommen, Gehen und Pause. In den Einstellungen erweiterbar.
- **Feierabend im Browser-Tab**: der Tab-Titel zeigt Gehen-Zeit und Restzeit,
  auch wenn die App im Hintergrund läuft.
- **Pausen-Erinnerung** zehn Minuten vor Erreichen der nächsten gesetzlichen
  Pausenstufe, mit Knopf zum sofortigen Stempeln.
- **Notizsuche** in der Schnellsuche.
- **Sicherungs-Erinnerung** nach einstellbarer Zeit ohne Export.

### Geändert

- **Echte Einzahlformen.** Die Sprachdateien kennen nun `<schlüssel>.one`;
  `I.tn()` wählt automatisch. Damit steht nirgends mehr „1 Tage".
- Der Titel in der Kopfzeile kommt aus einer Zuordnungstabelle statt aus einer
  Bedingungskette — eine neue Ansicht fiel sonst still auf einen fremden Titel
  zurück (genau das war bei „Werkzeuge" passiert).
- Serviceworker-Version auf v1.2.0.
- 30 zusätzliche Tests, insgesamt 178.

## [1.1.0] — 2026-08-06

### Neu — Outlook-Kalender

- Anmeldung mit dem normalen Microsoft-Konto über OAuth 2.0 mit PKCE. Ohne
  Server, ohne Client-Secret, ohne Fremdbibliothek — der Ablauf ist nach
  Spezifikation von Hand umgesetzt, damit die App abhängigkeitsfrei bleibt.
- Ferien, Krankheit, Unfall, Militär, Weiterbildung, Kompensation und
  unbezahlt frei werden aus dem Kalender erkannt: über den Status *Abwesend*
  sowie über Stichwörter in Betreff und Kategorien, in allen vier Sprachen.
- Halbtage werden erkannt; zwei Halbtage derselben Art ergeben einen ganzen Tag.
- *Woanders tätig* setzt den Arbeitsort auf Homeoffice, nicht die Tagesart.
- Mehrere Kalender wählbar, Zuordnungsregeln frei bearbeitbar, Zeitraum
  einstellbar, stiller Abgleich beim Start (höchstens alle vier Stunden).
- Vorschau vor jeder Übernahme, jede Zeile einzeln abwählbar, mit
  Rückgängig-Möglichkeit danach.
- Tage mit eigenen Stempelungen sind geschützt und werden ausdrücklich
  ausgewiesen statt still übergangen. Aus dem Kalender stammende Tage tragen
  ein Kennzeichen und werden bei gelöschten Terminen wieder zurückgenommen.
- Private Termine bleiben aussen vor; ihr Betreff wird auch bei erkannter
  Abwesenheit nicht in die Notiz übernommen.

### Geändert

- Serviceworker-Version auf v1.1.0 erhöht — beim nächsten Aufruf meldet die
  App die neue Fassung.
- 40 zusätzliche Tests, insgesamt 148.

### Grenzen

- Die Einzeldatei-Fassung (`dist/zeitkonto.html`) bietet die Anbindung nicht an:
  OAuth verlangt einen echten Origin, `file://` erfüllt das nicht.
- Nötig ist eine Azure-App-Registrierung (Plattform „Einzelseitige Anwendung",
  Berechtigung `Calendars.Read`). Die Einrichtung steht in der README.

## [1.0.0] — 2026-08-06

Erste vollständige Fassung. Aus einem einzelnen Arbeitszeitrechner ist eine
eigenständige, installierbare Anwendung geworden.

### Neu — Erfassung

- Stempeluhr für Kommen, Pause und Gehen; Zeiten lassen sich auch tippen
  (`0750` → `07:50`), Pfeiltasten verschieben minutenweise.
- Feierabend-Vorhersage über einen Fixpunkt: die empfohlene Gehen-Zeit
  berücksichtigt, dass eine längere Anwesenheit eine längere Pflichtpause
  auslöst, und zieht entsprechend nach.
- Beliebig viele benannte Pausen je Tag. Überlappungen werden zusammengefasst,
  Pausen ausserhalb der Anwesenheit gekürzt — beides wird angezeigt.
- Nachtschichten über Mitternacht.
- Live-Ansicht mit Doppelring, Zeitstrahl und Restzeit während der Arbeit.

### Neu — Zeitkonto

- Plus- und Minusstunden je Tag, laufender Gleitzeitsaldo, Startsaldo mit Stichtag.
- Kalender-, Wochen- und Statistikansicht.
- Nicht erfasste Arbeitstage werden als Lücke ausgewiesen, aber standardmässig
  **nicht** verrechnet (umschaltbar).
- Ein angefangener, nie beendeter Tag bewegt das Konto nicht und wird als Fehler
  gemeldet — eine vergessene Stempelung darf kein stilles Minus erzeugen.
- Optionale Kappung des Saldos nach oben und unten.

### Neu — Abwesenheiten

- Ferien, Krankheit, Unfall, Feiertag, Militär/Zivilschutz, Weiterbildung,
  Kompensation, unbezahlt frei, arbeitsfrei — je auch als Halbtag.
- Massenaktion für ganze Zeiträume, auf Wunsch unter Auslassung von Wochenenden
  und Feiertagen.
- Ferienkontingent mit Übertrag aus dem Vorjahr.

### Neu — Regeln

- Pausenstaffeln für die Schweiz (ArG Art. 15), Deutschland (ArbZG §4) und
  Österreich (AZG §11), pauschal oder frei definierbar; fehlende Pflichtpausen
  werden wahlweise automatisch abgezogen oder nur bemängelt.
- Feiertage für alle 26 Schweizer Kantone sowie Deutschland (Bund und mehrere
  Länder), Österreich und Frankreich inklusive Elsass-Mosel.
- Arbeitsschutz-Warnungen: Tageshöchstarbeitszeit, Ruhezeit zum Vortag,
  fehlende Pausen, unplausible Anwesenheiten.
- Rundung auf 1/5/6/10/15 Minuten, kaufmännisch, auf- oder abwärts.
- Arbeitsmodell über Vorlagen oder Sollzeit je Wochentag, dazu Beschäftigungsgrad.

### Neu — Auswertung und Ausgabe

- Saldo-Verlauf, Stunden pro Woche, Durchschnitt nach Wochentag,
  Ankunft & Feierabend, Pausen-Disziplin, Jahres-Heatmap, Tagesarten,
  Kontingente, Lückenliste.
- Monatsrapport zum Ausdrucken mit Übertrag und Unterschriftenfeldern.
- Export als CSV, JSON, ICS und Text; Import von JSON und CSV mit automatischer
  Erkennung von Trennzeichen und Spalten.

### Neu — Bedienung

- Befehlspalette (Ctrl/⌘ + K) mit Datumssprüngen, umfangreiche Tastenkürzel.
- Vier Sprachen: Deutsch, Englisch, Französisch, Italienisch.
- Hell, dunkel und systemgesteuert; drei Dichtestufen; erhöhter Kontrast.
- Erstkonfiguration in vier Schritten.
- Serien, Stufen und 24 Abzeichen — abschaltbar.
- Rückgängig und Wiederherstellen über die gesamte Sitzung.

### Neu — Betrieb

- Installierbar als PWA, vollständig offline lauffähig.
- Einzeldatei-Fassung (`dist/zeitkonto.html`) zum Doppelklicken.
- Versioniertes Speicherschema mit Migrationen; kaputte Daten werden beiseitegelegt
  statt überschrieben.
- 108 Tests für Zeitrechnung, Regelwerk, Feiertage, Engine, Export und Speicher.
