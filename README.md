# Willis Sudoku Helfer

Fotografiere ein Sudoku mit dem Handy – die App erkennt die Ziffern und schlägt dir den
**nächsten logischen Schritt** vor, mit verständlicher Erklärung. Kein Komplett-Lösen,
sondern Hilfe zur Selbsthilfe bei schwierigen Rätseln.

Die App ist eine **Web-App (PWA)**: Sie läuft in jedem modernen Browser, auf Android in
Chrome mit Kamera-Zugriff, und lässt sich über *„Zum Startbildschirm hinzufügen“* wie eine
normale App installieren. Danach funktioniert sie auch offline. Alles läuft lokal auf dem
Gerät – es werden keine Fotos hochgeladen.

## So funktioniert's

1. **📷 Foto aufnehmen** (oder Bild aus der Galerie wählen, oder manuell eingeben).
2. **Erkennung prüfen:** Das erkannte Gitter wird angezeigt. Gedruckte Vorgaben erscheinen
   schwarz, eigene mit Bleistift eingetragene Ziffern blau – so kann man auch ein halb gelöstes
   Rätsel fotografieren und weitermachen. Unsicher erkannte Ziffern sind
   orange markiert. Feld antippen → richtige Ziffer wählen. Falls der Rahmen nicht stimmt,
   die gelben Ecken im Foto verschieben und *„Neu erkennen“* tippen.
3. **💡 Nächster Schritt:** Die Tipps kommen in zwei Stufen:
   - **Stufe 1:** nur ein Hinweis, wo man suchen sollte (z. B. „Suche die 9 in Block 2“).
   - **Stufe 2:** die vollständige Erklärung mit Hervorhebung im Gitter
     (grün = Muster, rot = kann gestrichen werden).
   - **Anwenden** trägt den Schritt ein.
4. Eigene Ziffern eintragen, Kandidaten im Modus *„Notiz“* streichen, *Rückgängig* jederzeit.
   Der Spielstand wird automatisch gespeichert.

Die App erkennt auch **Fehler**: Wenn eine eingetragene Ziffer nicht zur Lösung passt oder
versehentlich ein richtiger Kandidat gestrichen wurde, sagt der nächste Tipp das.

### Unterstützte Lösungstechniken (von leicht nach schwer)

Letzte freie Zelle · Versteckter Einer · Einziger Kandidat · Blockade (Pointing) / Claiming ·
Nackte & versteckte Paare/Dreier/Vierer · X-Wing · XY-Wing · XYZ-Wing ·
Skyscraper / 2-String-Kite · Swordfish · Unique Rectangle · Jellyfish · X-Ketten · XY-Ketten.

Wenn keine dieser Techniken greift (sehr seltene Extrem-Rätsel), wird eine Zelle aus der
Lösung verraten.

## Starten

Es gibt keinen Build-Schritt – es sind nur statische Dateien.

```bash
npm start            # startet einen lokalen Server auf http://localhost:8080
npm test             # Tests für die Lösungslogik
npm run test:vision  # Test der Bilderkennung: simulierte Fotos + echte Fotos (braucht Playwright)
npm run learn        # Ziffern aus den echten Fotos in tests/photos neu lernen
```

**Handschrift lernen:** In `tests/photos` liegen Fotos fertig gelöster Sudokus, in
`tests/photos/truth.json` stehen dazu die gedruckten Vorgaben und die Lösung. `npm run learn`
schneidet daraus alle Ziffern aus und speichert sie in `js/handwriting.js`; die App vergleicht
erkannte Ziffern dann auch mit diesen Beispielen. Für bessere Erkennung einfach weitere Fotos
hinzufügen, in `truth.json` eintragen und neu lernen. Der Foto-Test erkennt jedes Foto nur mit
den Beispielen der *anderen* Fotos, misst also ehrlich, wie gut unbekannte Fotos gelesen werden.

**Auf dem Handy nutzen:** Kamera-Zugriff im Browser braucht HTTPS. Am einfachsten über
GitHub Pages: In den Repository-Einstellungen unter *Settings → Pages → Source* „GitHub
Actions“ wählen. Der Workflow `.github/workflows/pages.yml` testet und veröffentlicht die
App dann bei jedem Push auf `main` unter `https://<user>.github.io/sudoku_helper/`.
Diese Adresse in Chrome auf Android öffnen → Menü → *„App installieren“*.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css` | Oberfläche (mobil optimiert, Dark Mode) |
| `js/app.js` | Ablauf: Foto → Prüfen → Spielen, Tipps, Speichern |
| `js/vision.js` | Bilderkennung in reinem JavaScript: adaptiver Schwellwert, Gitter finden (mit Gitterlinien-Prüfung), perspektivisch entzerren, Notizziffern ignorieren, Druck/Bleistift an der Strichstärke unterscheiden, Ziffern (schräglagen-korrigiert) mit Schriftarten und gelernten Beispielen vergleichen, doppelte Ziffern über die Sudoku-Regeln korrigieren |
| `js/handwriting.js` | Gelernte Ziffern aus echten Fotos (erzeugt mit `npm run learn`) |
| `js/solver.js` | Kandidaten, menschliche Lösungstechniken mit deutschen Erklärungen, Backtracking-Solver für Eindeutigkeit und Fehlererkennung |
| `sw.js`, `manifest.webmanifest` | Offline-Fähigkeit und Installation als App |
| `tests/photos/` | Echte Fotos gelöster Sudokus mit Lösung (`truth.json`) zum Lernen und Testen |
| `tests/` | Tests: jeder Schritt jeder Technik wird gegen die echte Lösung geprüft (Beispiel- und 200 Zufallsrätsel) |
