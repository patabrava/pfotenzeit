# Ausführbare Asset-Aufträge und Fallbacks

## Zugang zuerst feststellen

Prüfe tatsächlich verfügbare Werkzeuge: Blender lokal? GLB-Generator? Rigging/Animation? API-Zugang? Nichts davon wegen des Modellnamens Claude voraussetzen. Kein kostenpflichtiger Aufruf ohne Autorisierung. Bearbeite zunächst alle Aufgaben ohne externe Dienste.

## Tickets

| Ticket | Eingang | Konkretes Ergebnis | Abnahme |
|---|---|---|---|
| A01 Nala | 01_nala.png + 07/08 | puppy GLB mit neutralem Rig | Anatomie/Identität, Maße, UVs, 4 Einflüsse |
| A02 Clips | Clipvertrag 08 | Nalas dreizehn Clips oder explizite Abweichung | Übergänge, Bodenkontakt, Geschirr |
| A03 Bruno | 02_gastwelpen.png | Bruno GLB mit relevantem Rig/Clips | eigene Silhouette und Farben |
| A04 Hof | 06/08 | kompakter modulärer Schulhof | Hochformatframing, geringe Draw Calls |
| A05 Menschen | 03_menschen.png | Mira/Alex GLBs + Gesten | Maße und klare Gesten |
| A06 Wachstum | Nala-Referenz + 07 | Nala growing GLB | längere Beine, kleineres Kopfverhältnis |
| A07 Pixel | Nala-Referenz | 128×128 Profilflächen, Hund ca.64×64 | konsistente Identität, harte Pixelkanten |
| A08 Props | 08 | Napf/Wasser/Decke/Spielzeug/Ausbauten | richtige Größe, Pivots |
| A09 Versand | alle Modelle | optimierte GLBs + manifest + Prüfbericht | Validator, Bytes, Clips, mobile Ansicht |

A02 umfasst dreizehn Clipnamen gemäß 08 einschließlich recover. Tatsächliche Clipnamen im Manifest sind maßgeblich. Falls prozedurale Posen statt bestimmter Clips verwendet werden, genau ausweisen.

## Pixelassets

MVP Nala arriving/growing × wach, hungrig, müde, ruhend, spielbereit, erschöpft. Je Zustand mindestens Standbild; einfache Animation 2–4 Frames optional. Ein neutrales Erinnerungsbild für Verlust als UI, kein verletztes Tier. Namen z. B. nala_arriving_rest.png. Zustandspriorität: lost → kritisch → müde → hungrig → spielbereit → wach. Stress-/Komforthinweis im Text ergänzen, kein unlesbares universales Emotionsgesicht. image-rendering: pixelated; originale PNGs auf integer scaling und Alpha prüfen.

## Manifestbeispiel, kein existierendes Asset

```json
{
  "version": 1,
  "assets": {
    "dog.nala.puppy": {
      "url": "assets/models/dog_nala_puppy.glb",
      "status": "pending",
      "bytes": null,
      "triangles": null,
      "clips": [],
      "textureSizes": [],
      "boundsMeters": null,
      "source": "planned from character reference",
      "license": "to document after production"
    }
  }
}
```

Relative URLs über import.meta.env.BASE_URL oder einen getesteten URL-Resolver auflösen. Keine unbedingten Rootpfade, die bei Unterverzeichnis-Hosting brechen. manifest pending darf niemals auf eine nicht vorhandene Datei als fertiges Modell verweisen. Loader verwendet expliziten placeholder-Zweig.

## Wenn Modellgenerator fehlt

Erstelle lauffähige temporäre DogActor-Prozeduralmodelle in Three.js und markiere asset-status placeholder in PROGRESS/Manifest. Optional Blender-Skripte für wiederholbare Cleanup-/Exportschritte liefern, wenn Blender vorhanden ist. Weder PNG noch extrudierte Bildplane als „fertiger 3D-Hund“ deklarieren. Produktqualität und Charakteridentität bleiben spätere Art-Abnahme.

## Produktionsbeleg

Jedes finale Asset: Rohquelle/Generator/Erstellungsdatum, Nutzungsrecht bzw. Lizenzstatus, Bereinigung, Original- und optimierte Bytes, Dreiecke, Materialien, Texturen, Clipnamen, Bounds, Validatorstatus. Bei unbekannter Lizenz öffentliches Shipping offen lassen. Durch Bildgeneration entstandene Details nicht mit Trainingsrichtigkeit verwechseln.

## Mehrfachverwendung

Gemeinsame Materialien wiederverwenden, Skelette für getrennte Tiere unabhängig instanzieren. Growing kann Animationen teilen, aber Retargeting und Deformation prüfen. Roadmapfiguren Keks/Lotti/Sam/Jo nicht für den MVP vorausproduzieren. Character-PNGs bleiben Dokumentation außerhalb des Appbundles.
