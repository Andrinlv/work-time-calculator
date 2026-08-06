# Änderungen

Alle nennenswerten Änderungen an Zeitkonto. Das Format folgt lose
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionierung
[SemVer](https://semver.org/lang/de/).

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
