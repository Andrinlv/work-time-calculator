# Zeitkonto

**Arbeitszeit, die sich selbst erklärt.**

Du trägst ein, wann du gekommen bist — die App sagt dir, wann du gehen kannst.
Sie merkt sich jeden Tag, führt dein Gleitzeitkonto, kennt die Pausenregeln und
die Feiertage deines Kantons. Alles bleibt auf deinem Gerät.

```
  ◯ ◯      ZEITKONTO
  ◯ ●      Version 1.1.0
```

---

## Installieren — drei Wege, alle ohne Aufwand

### 1 · Als App aufs Gerät (empfohlen)

Die Seite im Browser öffnen und installieren:

| Gerät | So geht's |
|---|---|
| **Android / Chrome** | Menü ⋮ → **App installieren** |
| **iPhone / iPad** | Teilen-Symbol → **Zum Home-Bildschirm** |
| **Windows / macOS** | Symbol in der Adressleiste → **Installieren** |
| **In der App** | Einstellungen → *App installieren* |

Danach liegt Zeitkonto wie jede andere App auf dem Gerät, startet ohne Browser-Leiste
und **funktioniert vollständig offline**.

### 2 · Eine einzige Datei

`dist/zeitkonto.html` herunterladen und **doppelklicken**. Fertig.

Keine Installation, kein Server, kein Internet. Die Datei enthält alles — Programm,
Gestaltung, Icons. Sie lässt sich auf einen USB-Stick legen, per Mail verschicken
oder in einen Netzwerkordner stellen. Jede Kopie führt ihr eigenes Zeitkonto.

### 3 · Selbst betreiben

```bash
git clone https://github.com/Andrinlv/work-time-calculator.git
cd work-time-calculator
npm start          # startet einen lokalen Server auf Port 8080
```

Es gibt keinen Build-Schritt und keine Abhängigkeiten — es ist reines HTML, CSS
und JavaScript. Der Ordner lässt sich auf jeden Webserver kopieren, auch auf
GitHub Pages (siehe unten).

---

## Was die App kann

### Der Alltag

- **Stempeluhr** — Kommen, Pause, Gehen mit einem Klick. Oder Zeiten von Hand
  eintippen: `0750` wird beim Tippen zu `07:50`, Pfeiltasten verschieben minutenweise.
- **Feierabend-Vorhersage** — die zentrale Zahl: wann du gehen kannst, damit der
  Tag exakt aufgeht. Inklusive Pflichtpause, die sich mit der Anwesenheit ändert.
- **Live-Anzeige** — während der Arbeitszeit läuft die Netto-Zeit mit, mit Ring,
  Zeitstrahl und Restzeit.
- **Beliebig viele Pausen** pro Tag, mit Bezeichnung. Überlappende Pausen werden
  zusammengefasst, Pausen ausserhalb der Anwesenheit gekürzt.
- **Nachtschichten** — endet der Tag nach Mitternacht, rechnet die App richtig weiter.

### Das Zeitkonto

- **Plus- und Minusstunden je Tag**, aufsummiert zu einem laufenden Saldo.
- **Startsaldo** aus deinem bisherigen System übernehmen, mit Stichtag.
- **Kalender** mit Monatsübersicht: jeder Tag zeigt Zeiten, Fortschritt und Saldo.
- **Wochenansicht** mit gemeinsamem Zeitmassstab — man sieht sofort, wo Zeit liegen bleibt.
- **Lücken statt stiller Minusstunden**: ein nicht erfasster Arbeitstag wird
  ausgewiesen, aber nicht heimlich verrechnet. (Umschaltbar.)

### Abwesenheiten

Ferien, Krankheit, Unfall, Militär/Zivilschutz, Weiterbildung, Kompensation,
unbezahlt frei — jeweils auch als **Halbtag**. Für ganze Zeiträume gibt es die
Massenaktion *Zeitraum ausfüllen*.

Die Wirkung ist bewusst unterschiedlich:

| Tagesart | Sollzeit | Gutschrift | Saldo-Wirkung |
|---|---|---|---|
| Arbeit | voll | – | Netto − Soll |
| Ferien, Krankheit, Feiertag, Militär, Weiterbildung | voll | voll | ±0 |
| **Kompensation** | voll | keine | **− Soll** (zehrt bewusst vom Konto) |
| Unbezahlt frei, arbeitsfrei | keine | – | ±0 |

### Regeln & Recht

- **Pausenrecht** wahlweise Schweiz (ArG Art. 15), Deutschland (ArbZG §4),
  Österreich (AZG §11), pauschal oder eigene Staffel.
  Fehlt eine Pflichtpause, wird sie automatisch abgezogen — sichtbar, nicht heimlich.
- **Feiertage** für alle 26 Schweizer Kantone sowie Deutschland (inkl. mehrerer
  Bundesländer), Österreich und Frankreich. Ostern wird korrekt berechnet.
- **Arbeitsschutz-Warnungen**: Tageshöchstarbeitszeit, Ruhezeit zum Vortag,
  fehlende Pausen, unplausible Anwesenheiten.
- **Rundung** auf 1/5/6/10/15 Minuten, kaufmännisch, auf- oder abwärts.
- **Arbeitsmodell** frei: Wochenstunden als Vorlage oder Sollzeit je Wochentag,
  dazu ein Beschäftigungsgrad in Prozent.

### Auswertung

- Saldo-Verlauf, Stunden pro Woche, Durchschnitt nach Wochentag,
  Ankunft & Feierabend, Pausen-Disziplin, Jahresübersicht als Heatmap,
  Verteilung der Tagesarten, Ferienkontingent.
- **Monatsrapport** zum Ausdrucken, mit Übertrag und Unterschriftenfeldern.
- **Export** als CSV (Excel-tauglich), JSON (vollständige Sicherung),
  ICS (Kalender) oder Text zum Kopieren. **Import** von JSON und CSV.

### Outlook-Kalender

Ferien, Krankheit und Homeoffice müssen nicht doppelt erfasst werden. Zeitkonto
liest sie aus deinem Outlook-Kalender — **du trägst nur noch die Arbeitszeit ein.**

- **Anmeldung mit dem normalen Microsoft-Konto.** OAuth 2.0 mit PKCE, ganz ohne
  Server und ohne Client-Secret. Funktioniert auf allen Geräten, auch in der
  installierten App.
- **Erkannt wird**, was der Kalender hergibt: Termine mit Status *Abwesend*,
  Stichwörter im Betreff oder in den Kategorien (Ferien, Krank, Militär,
  Weiterbildung, Kompensation …) in allen vier Sprachen, Halbtage, und
  *Woanders tätig* als Homeoffice.
- **Nichts wird stillschweigend geändert.** Der Abgleich zeigt eine Vorschau;
  jede Zeile lässt sich einzeln abwählen. Tage mit eigenen Stempelungen sind
  geschützt und werden ausdrücklich als solche ausgewiesen.
- **Gelesen wird nur.** Es gibt keinen Schreibzugriff auf deinen Kalender —
  die Berechtigung lautet `Calendars.Read`.

#### Einrichtung in Azure (einmalig, ca. 5 Minuten)

Nötig ist eine App-Registrierung. Ohne sie gibt es keine Client-ID und damit
keine Anmeldung.

1. **portal.azure.com** → *Microsoft Entra ID* → *App-Registrierungen* → **Neue Registrierung**
2. Name frei wählen, z. B. `Zeitkonto`
3. **Unterstützte Kontotypen**
   - nur Firmenkonten → später `tenant` = eure Mandanten-ID
   - auch private Konten → `tenant` = `common` (Standard)
4. **Umleitungs-URI**: Plattform **„Einzelseitige Anwendung (SPA)"** wählen —
   *nicht* „Web". Das ist der häufigste Fehler; mit „Web" verlangt Microsoft ein
   Client-Secret und die Anmeldung schlägt fehl.
   Als Wert exakt das eintragen, was Zeitkonto unter *Einstellungen →
   Outlook-Kalender → Umleitungs-URI* anzeigt, zum Beispiel:
   ```
   https://andrinlv.github.io/work-time-calculator/index.html
   ```
5. **Registrieren** → die *Anwendungs-ID (Client)* kopieren
6. *API-Berechtigungen* → **Microsoft Graph** → **Delegierte Berechtigungen** →
   `Calendars.Read` hinzufügen (`User.Read` ist meist schon vorhanden)
7. Falls euer Mandant die Benutzerzustimmung gesperrt hat: **Administratorzustimmung
   erteilen** — das macht die IT
8. In Zeitkonto: *Einstellungen → Outlook-Kalender* → Client-ID einfügen → **Mit Outlook verbinden**

Ein Client-Secret wird **nicht** gebraucht und darf auch nicht hinterlegt werden —
im Browser gäbe es dafür kein Versteck. Genau dafür ist PKCE gemacht.

#### Grenzen

- Die **Einzeldatei-Fassung kann das nicht.** OAuth verlangt einen echten
  Origin als Umleitungsziel; `file://` erfüllt das nicht. Die Funktion wird dort
  ausgeblendet, alles andere bleibt.
- Jede Umgebung braucht ihre eigene Umleitungs-URI in der Registrierung
  (Produktivseite, Testserver, `localhost`).

### Und ein bisschen Spiel

Serien, Stufen und 24 Abzeichen — vom *Ersten Stempel* über die *Perfekte Woche*
bis zum *Gipfelstürmer*. Freiwillig, abschaltbar, und niemand ausser dir sieht es.

### Bedienung

- **Ctrl/⌘ + K** öffnet die Schnellsuche — Befehle und Datumssprünge (`14.3.` funktioniert).
- **Leertaste** stempelt, **B** startet und beendet Pausen, **←/→** wechseln den Tag,
  **1–6** wechseln die Ansicht, **?** zeigt alle Kürzel.
- Vier Sprachen: Deutsch, Englisch, Französisch, Italienisch.
- Hell, dunkel oder dem System folgend. Drei Dichtestufen, erhöhter Kontrast.
- Ausgelegt für Tastatur und Screenreader, funktioniert auf dem Telefon genauso
  wie auf dem grossen Bildschirm.

---

## Deine Daten

**Alles bleibt auf deinem Gerät.** Kein Konto, kein Server, keine Übertragung,
keine Zählpixel, keine Fremdinhalte. Gespeichert wird im lokalen Speicher deines
Browsers.

Daraus folgen zwei Dinge, die man wissen sollte:

1. **Browserdaten löschen löscht auch dein Zeitkonto.** Deshalb regelmässig
   *Einstellungen → Alles sichern (JSON)*.
2. **Jedes Gerät führt sein eigenes Konto.** Zum Umziehen die JSON-Sicherung
   exportieren und auf dem anderen Gerät einlesen.

Ein automatisches Reservestück wird bei jedem Start angelegt; kaputte Daten
werden nicht überschrieben, sondern beiseitegelegt.

---

## Auf GitHub Pages veröffentlichen

Der mitgelieferte Arbeitsablauf `.github/workflows/pages.yml` erledigt das:

1. Im Repository **Settings → Pages → Source: GitHub Actions** wählen.
2. Auf den Standardzweig pushen.

Danach ist die App unter `https://<benutzer>.github.io/work-time-calculator/`
erreichbar und lässt sich von dort installieren.

---

## Entwicklung

```bash
npm test      # 148 Tests für Rechenkern und Kalenderabgleich
npm run build # Icons erzeugen + Einzeldatei bauen
npm start     # lokaler Server
```

Kein Bundler, kein Transpiler, keine Laufzeit-Abhängigkeiten. Die Kernmodule
laufen sowohl im Browser (globales `ZK.*`) als auch in Node (`require`) — genau
deshalb prüfen die Tests dieselbe Logik, die auch das UI rechnet.

### Aufbau

```
index.html              Gerüst, lädt alles in bewusster Reihenfolge
app.webmanifest         Installierbarkeit
sw.js                   Serviceworker (Offline-Betrieb)

assets/css/
  tokens.css            Farben, Abstände, Hell/Dunkel, Dichte
  base.css              Reset, Typografie, App-Raster
  components.css        Karten, Knöpfe, Felder, Modale, Toasts
  views.css             Ansichten, Kalender, Diagramme, Druck

assets/js/core/
  time.js               Zeit- und Datumsrechnung (reine Funktionen)
  rules.js              Tagesarten, Pausenstaffeln, Arbeitsmodelle
  holidays.js           Feiertage inkl. Osterberechnung
  engine.js             Tages- und Zeitraumberechnung, Kontostand
  achievements.js       Kennzahlen, Serien, Abzeichen

assets/js/data/
  store.js              Speicherung, Schema-Migration, Rückgängig
  exporters.js          CSV, ICS, Text, CSV-Import
  msauth.js             OAuth 2.0 mit PKCE gegen Microsoft (ohne Fremdbibliothek)
  graph.js              Microsoft Graph — calendarView, Kalenderliste
  calendarsync.js       Termine → Tagesarten, Abgleichplan (reine Funktionen)

assets/js/ui/
  i18n.js               vier Sprachen
  dom.js                DOM-Werkzeuge, Icons, Toasts, Modale
  charts.js             SVG-Diagramme von Hand
  onboarding.js         Erstkonfiguration
  outlooksync.js        Ablauf und Vorschau des Kalenderabgleichs
  app.js                Zustand, Navigation, Tastatur, PWA
  views/                die sieben Ansichten

tools/
  make-icons.js         erzeugt alle PNG-Icons (ohne Fremdbibliotheken)
  build-single-file.js  baut dist/zeitkonto.html

tests/                  Rechenkern, Regeln, Feiertage, Export, Speicher, Kalenderabgleich
```

### Grundsätze im Code

- **Der Rechenkern kennt kein DOM.** Alles Rechnerische ist eine reine Funktion
  und damit testbar.
- **Eingaben werden einmal aufgebaut, danach nur die Ergebnisse aktualisiert** —
  sonst springt beim Tippen der Cursor heraus.
- **Nichts verschwindet still.** Automatische Pausenabzüge, gekürzte Pausen,
  zusammengefasste Überschneidungen und nicht verrechnete Tage werden angezeigt.
- **Diagramme codieren nie nur über Farbe.** Plus und Minus tragen zusätzlich
  Vorzeichen, Lage zur Nulllinie und eine Schraffur; die Palette ist auf
  Farbfehlsichtigkeit geprüft.

---

## Haftung

Zeitkonto ist ein Hilfsmittel, kein Rechtsgutachten. Die hinterlegten Pausen- und
Feiertagsregeln sind nach bestem Wissen umgesetzt, aber ohne Gewähr: Kantone,
Betriebe und Gesamtarbeitsverträge weichen ab. Massgebend ist immer die
Zeiterfassung deines Arbeitgebers. Alle Regeln lassen sich in den Einstellungen
anpassen, jeder einzelne Tag manuell überschreiben.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
