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
2. **Erkennung prüfen:** Das erkannte Gitter wird angezeigt. Unsicher erkannte Ziffern sind
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
npm run test:vision  # Test der Bilderkennung mit simulierten Fotos (braucht Playwright)
```

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
| `js/vision.js` | Bilderkennung in reinem JavaScript: adaptiver Schwellwert, Gitter finden (mit Gitterlinien-Prüfung), perspektivisch entzerren, Ziffern per Vorlagenvergleich mit verschiedenen Schriftarten erkennen |
| `js/solver.js` | Kandidaten, menschliche Lösungstechniken mit deutschen Erklärungen, Backtracking-Solver für Eindeutigkeit und Fehlererkennung |
| `sw.js`, `manifest.webmanifest` | Offline-Fähigkeit und Installation als App |
| `tests/` | Tests: jeder Schritt jeder Technik wird gegen die echte Lösung geprüft (Beispiel- und 200 Zufallsrätsel) |
