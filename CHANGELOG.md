# Änderungen

Alle nennenswerten Änderungen an Zeitkonto. Das Format folgt lose
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionierung
[SemVer](https://semver.org/lang/de/).

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
