# Mobile-first UX

## Bildschirmmodell

Hochformat ab 360 CSS-px Breite. Zielgerät 390 × 844; zusätzlich 360 × 640 und 430 × 932 prüfen. Querformat und Desktop als Anpassung, keine Pflichtrotation. Einhandbedienung, keine Hoverabhängigkeit.

HOME: 3D-Gelände, oben links ein kleiner Besuchshinweis, oben rechts Profilbutton mit Nalas Gesicht. Unten ein kontextbezogener Button „Zur Übung“. Schulmarken und Ausbauten nur im Schulmenü.

TRAINING: Hund in mittleren 55 % des Bildes. Unten zwei bis drei Aktionsbuttons, maximal 28 % der Höhe; oben kompakter Lernpunkt. Dialogtexte werden zwischen Aktionen eingeblendet, keine lange Rede während wichtiger Körpersprache.

PROFILE: Separater Vollbildschirm, 3D pausiert und rendert bedarfsgesteuert. Pixelhund im oberen Drittel, Name und Lebensphase darunter; drei verständliche Pflegeanzeigen und große Aktionen. Zurückbutton stellt vorherigen Ort wieder her. Drei Tabs: „Pflege“, „Erinnerungen“, „Gelernt“. Kein zweiter Pflegezustand.

REFLECTION: Ein Satz zum Erfolg, ein Satz zum Lernpunkt. „Im Alltag“ als aufklappbarer Abschnitt. „Fertig für heute“ und „Zur Schule“ gleich gut erreichbar.

SCHOOL: Bottom Sheet mit zwei MVP-Ausbauoptionen, Kosten und Vorschau. Keine Kaufanimation über dem Hund.

## Layout und Eingabe

- 48 × 48 CSS-px Mindestziel, 8 px Abstand; Hauptaktionen 52–56 px hoch.
- Safe-area-inset berücksichtigen; 100dvh mit Fallback, kein verdeckter Footer hinter Browserleisten.
- Schrift mindestens 16 px für Fließtext, 14 px für kurze sekundäre Labels; dynamische Textgröße bis 200 % prüfen.
- 360–599 px: einspaltig; 600–899 px: mehr Luft, unveränderte Interaktionshierarchie; ab 900 px: Profil optional Seitenpanel bis 380 px, Szene bleibt dominant.
- Keine festen Gerätehöhen; Dialoge dürfen scrollen. Aktionsbuttons wachsen bei längeren deutschen Texten.
- Pointer Events für Touch/Maus. pointercancel verwirft die Aktion, kein Durchklicken beim Schließen eines Sheets. Pro Geste höchstens eine Aktion.
- Scrollen von Profil/Lerntext darf keine 3D-Interaktion auslösen. Weltaktionen gesperrt unter Modals.
- Keine zwingenden Wisch-, Drag-, Doppeltipp- oder Pinch-Gesten. Freie Kamerasteuerung entfällt im MVP.

## Barrierearme Bedienung

DOM-Buttons mit sichtbarem Fokus; Tab/Enter/Escape unterstützen. Statusänderungen moderat über aria-live. Informationen zusätzlich in Text, nicht nur Farbe oder Ton. Körpersprache besitzt die Option „Beobachtung beschreiben“. Dies bietet eine gleichwertige textliche Entscheidungsbasis.

Kontrast für kleine Texte ≥4,5:1, große Texte ≥3:1. Musik optional, Untertitel für alle erklärenden Sprechtexte; MVP ohne Sprachaufnahme. prefers-reduced-motion verkürzt UI-Übergänge und deaktiviert Kamerafahrten. Hundehaltungen bleiben über Standbilder und Text verständlich.

## Beispieltexte

„Nala braucht gerade Ruhe.“ / „Mehr Abstand“ / „Diese Orientierung belohnen“ / „Übung vereinfachen“ / „Pause anbieten“ / „Ihr habt heute gut aufeinander geachtet.“

Challenge-Einstieg: „Optional: Pflege mit Konsequenzen. Während des Spielens können Bedürfnisse sinken. Längere Vernachlässigung kann diesen Lauf beenden. Allein durch deine Abwesenheit stirbt dein Welpe nicht.“ Buttons „Challenge starten“ / „Entspannt spielen“.

## Unterbrechungen

Anruf, Tabwechsel, Sperrbildschirm: aktuelle Transaktion speichern, Simulation anhalten, Audio stoppen. Rückkehr zeigt kurze Zusammenfassung; keine verlorene Entscheidung und keine doppelte Belohnung. Bei einem unterbrochenen Animationsereignis Zustand anhand gespeicherter transactionId genau einmal abschließen oder wiederherstellen.
