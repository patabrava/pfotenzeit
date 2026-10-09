/**
 * All UI strings, German, "du", calm adult register (05_MOBILE_UX, 04_PFLEGE_CHALLENGE, 02, 03, 09).
 * Verbatim texts: challenge onboarding (05), game-rule disclaimer (03), memorial text (04),
 * other-tab message (09). Strings with names are functions.
 * No blame vocabulary; feedback and warnings carry text and symbol, never colour alone.
 */
import type { CareKind, GrowthStage, LessonId, Mode, PixelState, Readiness, VitalityBand } from '../simulation/types';

const STAGE_LABEL: Record<GrowthStage, string> = { arriving: 'Ankommen', growing: 'Wachsen', adult: 'Erwachsen' };

const PIXEL_STATE_LABEL: Record<PixelState, string> = {
  awake: 'wach',
  hungry: 'hungrig',
  tired: 'müde',
  playful: 'spielbereit',
  resting: 'ruht sich aus',
  exhausted: 'erschöpft, braucht Ruhe',
  memorial: 'Erinnerung',
};

const readinessReady = (name: string): string => `${name} ist bereit für eine Übung.`;
const readinessNeedsCare = (name: string): string => `${name} braucht gerade Ruhe.`;

export const de = {
  app: {
    title: 'Pfotenzeit',
    tagline: 'Eine ruhige Hundeschule für ein paar Minuten am Tag.',
    loading: 'Die Schule wird vorbereitet …',
    loadingScene: 'Der Hof wird geladen …',
    back: 'Zurück',
    close: 'Schließen',
    confirm: 'Bestätigen',
    cancel: 'Abbrechen',
    ok: 'Alles klar',
    continue: 'Weiter',
    pause: 'Pause',
    resume: 'Weiterspielen',
    paused: 'Pausiert. Nichts geht verloren.',
    skip: 'Überspringen',
    menu: 'Menü',
    settings: 'Einstellungen',
    standardMode: 'Entspannt',
    challengeMode: 'Challenge',
    modeLabel: (mode: Mode) => (mode === 'challenge' ? 'Challenge-Lauf' : 'Entspannter Lauf'),
  },

  home: {
    visitHint: 'Zeit für einen kurzen Besuch.',
    visitHintCare: (name: string) => `${name} braucht zuerst etwas Pflege.`,
    visitHintDone: (name: string) => `${name} hat heute schon geübt. Ein weiterer Besuch ist freiwillig.`,
    greeting: (name: string) => `${name} begrüßt dich.`,
    needVisible: (name: string, need: string) => `${name} zeigt dir gerade: ${need}.`,
    toLesson: 'Zur Übung',
    toCare: 'Versorgen',
    profile: 'Profil',
    profileButtonLabel: (name: string) => `Profil von ${name} öffnen`,
    school: 'Schule',
    sceneCourtyard: 'Ruhiger Innenhof mit Holzunterstand, Wasserplatz und Trainingsfläche.',
    sceneRestPlace: 'Unter dem Unterstand liegt die Decke am Ruheplatz.',
    sceneSniffCorner: 'Am Zaun wartet die Schnüffelecke mit hohem Gras.',
  },

  profile: {
    title: 'Profil',
    tabs: { care: 'Pflege', memories: 'Erinnerungen', learned: 'Gelernt' },
    stage: (stage: GrowthStage) => STAGE_LABEL[stage],
    stageLine: (name: string, stage: GrowthStage) => `${name} · ${STAGE_LABEL[stage]}`,
    pixelAlt: (name: string, state: PixelState) => `${name}, ${PIXEL_STATE_LABEL[state]}`,
    noMemories: 'Noch keine Erinnerungen. Sie entstehen bei Besuchen, in denen ihr gut aufeinander achtet.',
    memoryCount: (n: number) => (n === 1 ? '1 Erinnerung' : `${n} Erinnerungen`),
    memoryDate: (date: string) => `Besuch am ${date}`,
    noLearned: 'Noch nichts gelernt. Jeder Lernpunkt braucht zwei passende Entscheidungen in verschiedenen Situationen.',
    learned: 'Gelernt',
    inProgress: 'In Arbeit',
    progressLine: (have: number, need: number) => `${have} von ${need} Situationen`,
    rename: 'Hund umbenennen',
    renameTitle: 'Wie soll dein Hund heißen?',
    renamePlaceholder: 'Name',
    renameHint: '1 bis 16 Zeichen.',
    renameInvalid: 'Der Name braucht 1 bis 16 Zeichen.',
    detailValues: 'Werte anzeigen',
    hideValues: 'Werte ausblenden',
  },

  needs: {
    satiety: 'Hunger',
    energy: 'Energie',
    comfort: 'Wohlgefühl',
    arousal: 'Aufregung',
    stress: 'Anspannung',
    vitality: 'Verfassung',
    level: (value: number) => (value >= 70 ? 'gut' : value >= 35 ? 'in Ordnung' : 'niedrig'),
    satietyLine: (value: number) =>
      value >= 70 ? 'Satt und zufrieden.' : value >= 35 ? 'Könnte bald etwas fressen.' : 'Hat Hunger.',
    energyLine: (value: number) =>
      value >= 70 ? 'Ausgeruht und wach.' : value >= 35 ? 'Wird langsam müde.' : 'Braucht Ruhe.',
    comfortLine: (value: number) =>
      value >= 70 ? 'Fühlt sich wohl.' : value >= 35 ? 'Etwas Zuwendung tut gut.' : 'Braucht Nähe oder Abstand.',
    stressHint: 'Angespannt. Abstand hilft jetzt mehr als Spiel.',
    arousalHint: 'Aufgeregt. Erst ruhiger werden, dann üben.',
  },

  care: {
    title: 'Pflege',
    actions: {
      meal: 'Futter geben',
      rest: 'Ruhe anbieten',
      play: 'Ruhiges Spiel',
      calm: 'Abstand geben',
    } satisfies Record<CareKind, string>,
    hints: {
      meal: 'Futter ist immer da und kostet nichts.',
      rest: 'Ruhe gibt Energie zurück und nimmt Anspannung.',
      play: 'Ein ruhiges Spiel stärkt das Wohlgefühl.',
      calm: 'Bei Anspannung hilft Abstand mehr als Spiel.',
    } satisfies Record<CareKind, string>,
    presenting: {
      meal: (name: string) => `${name} frisst in Ruhe.`,
      rest: (name: string) => `${name} legt sich hin und atmet ruhiger.`,
      play: (name: string) => `${name} spielt ruhig mit dir.`,
      calm: (name: string) => `${name} bekommt Abstand und wird lockerer.`,
    } satisfies Record<CareKind, (name: string) => string>,
    done: 'Erledigt.',
    repeatHint: 'Gleich noch einmal bringt nichts Zusätzliches. Der Hund ist versorgt.',
    waterAlways: 'Wasser steht immer bereit.',
    notMeaningful: 'Das ist gerade nicht nötig.',
  },

  readiness: {
    ready: readinessReady,
    needsCare: readinessNeedsCare,
    needsFood: (name: string) => `${name} hat gerade Hunger.`,
    needsCalm: (name: string) => `${name} ist gerade angespannt. Abstand hilft.`,
    needsSettle: (name: string) => `${name} ist gerade aufgeregt. Erst ruhiger werden.`,
    line: (name: string, readiness: Readiness) =>
      readiness === 'ready' ? readinessReady(name) : readinessNeedsCare(name),
    careFirst: 'Erst versorgen, dann üben. Futter, Ruhe und Pause sind immer da.',
  },

  lesson: {
    title: 'Übung',
    prepareTitle: 'Was möchtet ihr heute üben?',
    prepareHint: 'Drei kurze Runden. Du kannst jederzeit aufhören.',
    start: 'Übung starten',
    lessonLabel: (id: LessonId, title: string) => `${id} · ${title}`,
    roundOf: (n: number, total: number) => `Runde ${n} von ${total}`,
    supportedRound: 'Gestützte Wiederholung',
    supportedHint: 'Diese Runde ist Übung. Der Hinweis hilft dir, die Entscheidung zählt nicht als Lernpunkt.',
    insertedRound: 'Noch einmal ohne Hilfe',
    insertedHint: 'Dieselbe Situation noch einmal, diesmal ohne Hinweis.',
    observe: 'Beobachten',
    lookCloser: 'Genauer ansehen',
    describe: 'Beobachtung beschreiben',
    hideDescription: 'Beschreibung ausblenden',
    decide: 'Was machst du?',
    reacting: 'Schau, was passiert …',
    next: 'Weiter',
    offerPause: 'Pause anbieten',
    endToday: 'Heute beenden',
    leaveLesson: 'Übung verlassen',
    leaveConfirm: 'Die Übung wird beendet. Was ihr bisher gemacht habt, bleibt erhalten.',
    everyday: 'Im Alltag',
    miraSays: 'Mira:',
    helpful: 'Passende Entscheidung',
    notHelpful: 'Andere Richtung',
    noTimer: 'Kein Zeitdruck. Die Szene wartet auf dich.',
    sourceNote: 'Lerninhalt vorläufig. Buchabgleich und fachliche Prüfung stehen noch aus.',
    learningPoint: 'Lernpunkt',
    careEffectNote: 'Diese Ruhe zählt als echte Pflege.',
  },

  reflection: {
    title: 'Heute',
    successCompleted: (name: string) => `Ihr habt alle Runden geschafft. ${name} hat gut mitgemacht.`,
    successCareClosure: (name: string) => `Ihr habt heute aufgehört, als ${name} es brauchte. Das zählt als vollständiger Besuch.`,
    learnedNow: (label: string) => `Lernpunkt verstanden: ${label}.`,
    learnedBefore: (label: string) => `Lernpunkt ${label} war schon verstanden.`,
    stillPracticing: (label: string) => `Lernpunkt ${label} ist in Arbeit.`,
    markEarned: '1 Schulmarke für diesen Besuch.',
    learningMark: (n: number) => (n === 1 ? '1 Schulmarke für den verstandenen Lernpunkt.' : `${n} Schulmarken für verstandene Lernpunkte.`),
    bondLine: 'Eine neue Erinnerung ist dazugekommen.',
    noBondLine: 'Heute keine neue Erinnerung. Das ist in Ordnung.',
    everyday: 'Im Alltag',
    doneToday: 'Fertig für heute',
    toSchool: 'Zur Schule',
  },

  school: {
    title: 'Schule',
    marks: 'Schulmarken',
    marksCount: (n: number) => (n === 1 ? '1 Schulmarke' : `${n} Schulmarken`),
    cost: (n: number) => (n === 1 ? '1 Marke' : `${n} Marken`),
    buy: 'Ausbauen',
    owned: 'Ausgebaut',
    notEnough: (missing: number) => (missing === 1 ? 'Noch 1 Marke bis zum Ausbau.' : `Noch ${missing} Marken bis zum Ausbau.`),
    howToEarn: 'Jeder abgeschlossene Besuch gibt eine Marke. Jeder verstandene Lernpunkt gibt einmal eine weitere.',
    noPaywall: 'Futter, Ruhe und Pause brauchen keine Marken.',
    bought: (label: string) => `${label} ist ausgebaut.`,
    nextVisit: 'Nächsten Besuch vormerken',
  },

  settings: {
    title: 'Einstellungen',
    audio: 'Ton',
    audioHint: 'Kleine Hinweistöne und eine ruhige Hintergrundschleife. Standardmäßig aus.',
    reducedMotion: 'Bewegung reduzieren',
    reducedMotionOptions: { system: 'Wie das Gerät', on: 'An', off: 'Aus' },
    reducedMotionHint: 'Kürzere Übergänge, keine Kamerafahrten. Haltungen bleiben als Standbild und Text lesbar.',
    observationText: 'Beobachtungstext',
    observationTextHint: 'Zeigt zu jeder Szene eine textliche Beschreibung der Körpersprache.',
    quality: 'Qualität',
    qualityOptions: { auto: 'Automatisch', low: 'Sparsam', high: 'Hoch' },
    qualityHint: 'Sparsam: keine Schatten, weniger Details. Gut für ältere Geräte.',
    mode: 'Spielmodus',
    modeHint: 'Entspannt ist voreingestellt. Challenge ist ein eigener Spielstand.',
    switchToStandard: 'Entspannt spielen',
    switchToChallenge: 'Zur Challenge wechseln',
    startChallenge: 'Challenge starten',
    pauseChallenge: 'Challenge pausieren',
    resumeChallenge: 'Challenge fortsetzen',
    archiveChallenge: 'Challenge beenden',
    archiveConfirm: 'Der Challenge-Lauf wird archiviert. Dein entspannter Spielstand bleibt unverändert.',
    exportSave: 'Spielstand exportieren',
    importSave: 'Spielstand importieren',
    importHint: 'Vor dem Import wird der aktuelle Spielstand gesichert.',
    importInvalid: 'Diese Datei passt nicht zu Pfotenzeit. Nichts wurde geändert.',
    importDone: 'Spielstand übernommen.',
    exportDone: 'Spielstand gespeichert.',
    renameDog: 'Hund umbenennen',
    about: 'Über Pfotenzeit',
    aboutText:
      'Pfotenzeit ist ein Prototyp. Die Übungen sind vorläufig und noch nicht fachlich geprüft. Alle Figuren sind erfunden.',
    diagnostics: 'Diagnose',
  },

  challenge: {
    title: 'Challenge',
    onboarding:
      'Optional: Pflege mit Konsequenzen. Während des Spielens können Bedürfnisse sinken. Längere Vernachlässigung kann diesen Lauf beenden. Allein durch deine Abwesenheit stirbt dein Welpe nicht.',
    disclaimer: 'Diese Pflegewerte sind Spielregeln. Sie bilden keine reale Hundegesundheit ab.',
    start: 'Challenge starten',
    relaxed: 'Entspannt spielen',
    pausedBanner: 'Challenge pausiert. Keine Werte sinken.',
    offlineSafe: 'Abwesenheit allein beendet den Lauf nie. Kritisch wird nur, wer lange aktiv nichts versorgt.',
    bands: {
      stable: 'Alles stabil. Normale Pflege reicht.',
      impaired: 'Angeschlagen. Eine passende Pflegeaktion hilft jetzt direkt.',
      critical: 'Kritisch. Training ist gesperrt. Versorgen und Pause bleiben erreichbar.',
      lost: 'Dieser Lauf ist beendet.',
    } satisfies Record<VitalityBand, string>,
    bandLabel: {
      stable: 'stabil',
      impaired: 'angeschlagen',
      critical: 'kritisch',
      lost: 'verloren',
    } satisfies Record<VitalityBand, string>,
    bandSymbol: {
      stable: '●',
      impaired: '▲',
      critical: '■',
      lost: '○',
    } satisfies Record<VitalityBand, string>,
    trainingLocked: 'Training ist gerade gesperrt. Versorge zuerst, dann geht es weiter.',
    criticalFree: 'Eine kostenlose Pflegeaktion hebt das Bedürfnis. Danach ist Schließen sicher.',
    offlineApplied: (hours: number) =>
      hours <= 0 ? 'Willkommen zurück.' : `Willkommen zurück. ${Math.round(hours)} Stunden Abwesenheit sind angerechnet, höchstens acht.`,
  },

  memorial: {
    title: 'Abschied',
    text: 'Dein Challenge-Welpe ist gestorben. Dieser Spielstand endet hier.',
    remember: (name: string) => `Erinnerung an ${name}`,
    milestones: 'Gemeinsame Momente',
    noMilestones: 'Ein kurzer gemeinsamer Weg.',
    visits: (n: number) => (n === 1 ? '1 Besuch' : `${n} Besuche`),
    viewMemory: 'Erinnerung ansehen',
    newChallenge: 'Neuen Challenge-Lauf beginnen',
    toStandard: 'Zum entspannten Spielstand',
    noBlame: 'Ein neuer Lauf ist ein neuer Hund. Der entspannte Spielstand bleibt, wie er war.',
  },

  interruption: {
    title: 'Willkommen zurück',
    summary: 'Dein Spielstand ist gesichert. Keine Entscheidung ist verloren, nichts wurde doppelt gezählt.',
    resumedVisit: (title: string) => `Ihr wart mitten in der Übung „${title}“. Es geht genau dort weiter.`,
    resumedCare: 'Die Pflegeaktion war schon gespeichert. Hier ist das Ergebnis.',
    continue: 'Weiter',
  },

  errors: {
    otherTab: 'Spiel ist in einem anderen Tab geöffnet',
    otherTabHint: 'Schließe den anderen Tab oder spiele dort weiter. Hier ist das Spiel pausiert.',
    takeOver: 'Hier weiterspielen',
    storage: 'Speichern hat nicht geklappt. Das Spiel ist pausiert, damit nichts verloren geht.',
    storageHint: 'Prüfe den Speicherplatz des Browsers. Du kannst deinen Spielstand jetzt exportieren.',
    storageQuota: 'Der Browser hat keinen Platz mehr zum Speichern.',
    migration: 'Dieser Spielstand stammt aus einer anderen Version. Er wurde gesichert und nicht verändert.',
    webgl: 'Die 3D-Ansicht ist auf diesem Gerät nicht verfügbar. Übungen und Profil funktionieren als Textansicht.',
    webglRetry: 'Erneut versuchen',
    contextLost: 'Die 3D-Ansicht wurde unterbrochen. Sie wird wiederhergestellt.',
    assetMissing: 'Ein Modell konnte nicht geladen werden. Es wird ein einfacher Platzhalter gezeigt.',
    offline: 'Du bist offline. Pfotenzeit läuft lokal weiter, alles bleibt gespeichert.',
    offlineFirstLoad: 'Für den ersten Start braucht Pfotenzeit einmal eine Verbindung.',
    updateAvailable: 'Eine neue Version ist bereit. Beim nächsten Start wird sie geladen.',
    generic: 'Etwas hat nicht geklappt. Dein Spielstand ist sicher.',
  },

  growth: {
    available: 'Ein Wachstumsschritt ist bereit.',
    prompt: (name: string) => `${name} ist angekommen. Drei Lektionen, drei Erinnerungen und ein ruhiger Abschluss. Soll ${name} ein Stück wachsen?`,
    confirm: 'Wachsen lassen',
    later: 'Später',
    sceneText: (name: string) =>
      `${name} streckt sich. Die Beine sind ein wenig länger, der Blick ist derselbe. Was ihr gelernt habt, bleibt.`,
    done: (name: string) => `${name} ist jetzt in der Phase „Wachsen“.`,
    fiction: 'Erzählerische Zeit, kein echter Entwicklungsplan.',
  },

  pixel: {
    state: (state: PixelState) => PIXEL_STATE_LABEL[state],
    codeAuthored: 'Pixelansicht im Code gezeichnet, keine finale Grafik.',
  },

  scene: {
    hold: 'Die Szene wartet.',
    environment: {
      courtyard: 'Ruhiger Hof',
      courtyard_loud: 'Lauter Hof',
      rest_place: 'Ruheplatz',
      sniff_corner: 'Schnüffelecke',
    },
    placeholderNote: 'Figuren sind im Code erzeugt, keine finale Grafik.',
    cameraLesson: 'Nahblick auf den Hund',
    cameraSchool: 'Blick auf den Hof',
  },

  dates: {
    today: 'heute',
    yesterday: 'gestern',
  },
} as const;

export type De = typeof de;
