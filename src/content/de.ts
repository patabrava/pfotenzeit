/**
 * All UI strings, German, "du", calm adult register (05_MOBILE_UX, 04_PFLEGE_CHALLENGE, 02, 03, 09).
 * Verbatim texts: challenge onboarding (05), game-rule disclaimer (03), memorial text (04),
 * other-tab message (09). Strings with names are functions.
 * No blame vocabulary; feedback and warnings carry text and symbol, never colour alone.
 */
import type { CareKind, DistractionLevel, GestureId, GrowthStage, LessonId, Mode, PixelState, PoseId, Readiness, VitalityBand } from '../simulation/types';
import type { SourceStatus } from './types';

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
const readinessNeedsFood = (name: string): string => `${name} hat gerade Hunger.`;
const readinessNeedsCalm = (name: string): string => `${name} ist gerade angespannt. Abstand hilft.`;
const readinessNeedsSettle = (name: string): string => `${name} ist gerade aufgeregt. Erst ruhiger werden.`;

const VITALITY_LABEL: Record<VitalityBand, string> = { stable: 'stabil', impaired: 'angeschlagen', critical: 'kritisch', lost: 'verloren' };
const MODE_LABEL = (mode: Mode): string => (mode === 'challenge' ? 'Challenge-Lauf' : 'Entspannter Lauf');

/**
 * Pose descriptions per PoseId (D1 principle from 03: several body signals together and the context,
 * never a verdict about feelings). Used under reduced motion, in the WebGL text fallback and as aria text.
 * Present tense, ≤ 180 characters, valid for Nala and Bruno alike.
 */
const POSE_DESCRIPTION: Record<PoseId, string> = {
  idle_relaxed:
    'Der Körper ist locker, das Gewicht liegt gleichmäßig auf allen vier Pfoten. Die Ohren hängen weich, die Rute pendelt auf mittlerer Höhe, der Blick wandert ruhig umher.',
  look_at_handler:
    'Der Kopf dreht sich zum Menschen, die Ohren heben sich leicht. Der Körper bleibt locker, die Rute auf mittlerer Höhe. Der Blick ruht kurz auf dem Gesicht.',
  sniff:
    'Die Nase ist tief am Boden, der Rücken bleibt weich. Die Rute hängt auf mittlerer Höhe und schwingt langsam. Die Ohren fallen nach vorn, der Blick folgt der Spur.',
  walk:
    'Ein ruhiger Schritt, der Kopf etwa auf Rückenhöhe. Die Ohren hängen locker, die Rute schwingt leicht mit. Die Pfoten setzen gleichmäßig auf.',
  sit:
    'Das Hinterteil berührt den Boden, die Vorderbeine stehen gerade. Der Kopf ist gehoben, die Ohren hängen weich, die Rute liegt still auf dem Boden.',
  lie_down:
    'Der Bauch liegt auf dem Boden, die Vorderbeine sind nach vorn gestreckt. Der Kopf ist noch gehoben, die Ohren hängen locker, die Rute liegt ruhig.',
  rest_loop:
    'Der Körper liegt auf dem Boden, der Kopf ruht auf den Vorderpfoten. Die Ohren hängen locker, die Rute liegt still, die Atmung ist langsam und gleichmäßig.',
  eat:
    'Der Kopf ist tief über dem Napf, der Rücken bleibt weich. Die Ohren fallen nach vorn, die Rute hängt entspannt. Die Pfoten stehen ruhig.',
  play_bow:
    'Die Vorderbeine liegen flach, das Hinterteil bleibt oben. Die Rute ist hoch und bewegt sich, der Mund ist leicht geöffnet, der Blick geht zum Gegenüber.',
  turn_away:
    'Der Körper dreht sich vom Auslöser weg, der Kopf ist tief. Die Ohren sind nach hinten gelegt, die Rute hängt tief. Der Blick geht zur Seite.',
  tense_idle:
    'Das Gewicht ist nach hinten verlagert, die Beine sind steif. Die Rute hängt tief und bewegt sich kaum, die Ohren liegen an, der Kopf bleibt angespannt nach vorn gerichtet.',
  tired_idle:
    'Der Kopf hängt tiefer als der Rücken, die Bewegungen sind langsam. Die Ohren hängen locker, die Rute ist tief und ruhig, der Körper schwankt leicht.',
  alert_focus:
    'Das Gewicht liegt vorn, der Kopf folgt dem Spielzeug. Die Ohren sind nach vorn gerichtet, die Rute ist hoch und wedelt schnell.',
  rest_side:
    'Der Körper liegt auf der Seite, die Beine sind locker ausgestreckt. Die Augen sind fast geschlossen, die Rute liegt still. Der Bauch hebt und senkt sich langsam.',
  stand_up:
    'Der Hund hebt Kopf und Brust, streckt die Vorderbeine und richtet das Hinterteil auf. Die Ohren hängen locker, die Rute bleibt tief.',
  recover:
    'Die Spannung löst sich: Der Körper wird weicher, die Ohren kommen nach vorn, die Rute hebt sich auf mittlere Höhe. Ein Schütteln oder ein tiefer Atemzug gehört oft dazu.',
};

/** Human gesture descriptions per GestureId (Mira, Alex). Short, concrete, named. */
const GESTURE_DESCRIPTION: Record<GestureId, (name: string) => string> = {
  idle: (name) => `${name} steht ruhig mit lockeren Schultern, die Hände hängen locker, der Blick geht zum Hund.`,
  greet: (name) => `${name} hebt eine Hand kurz zum Gruß und bleibt dabei auf Abstand.`,
  gesture_explain: (name) => `${name} zeigt mit offener Hand zur Seite und erklärt ruhig.`,
  offer_reward: (name) => `${name} hält eine kleine Belohnung tief vor dem Körper und wartet.`,
  kneel: (name) => `${name} geht in die Hocke und hält die Hand tief.`,
};

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
    modeLabel: MODE_LABEL,
  },

  home: {
    visitHint: 'Zeit für einen kurzen Besuch.',
    visitHintCare: (name: string) => `${name} braucht zuerst etwas Pflege.`,
    visitHintDone: (name: string) => `${name} hat heute schon geübt. Ein weiterer Besuch ist freiwillig.`,
    greeting: (name: string) => `${name} begrüßt dich.`,
    needVisible: (name: string, need: string) => `${name} zeigt dir gerade: ${need}.`,
    toLesson: 'Zur Übung',
    continueLesson: 'Übung fortsetzen',
    visitInProgress: (title: string) => `Besuch läuft: ${title}`,
    grow: 'Wachsen',
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
    valueOf: (value: number) => `${Math.round(value)} von 100`,
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
    recommended: 'Empfohlen',
    lockedDuringReaction: 'Gleich. Schau zuerst, wie der Hund reagiert.',
    repeatHint: 'Gleich noch einmal bringt nichts Zusätzliches. Der Hund ist versorgt.',
    waterAlways: 'Wasser steht immer bereit.',
    notMeaningful: 'Das ist gerade nicht nötig.',
  },

  readiness: {
    ready: readinessReady,
    needsCare: readinessNeedsCare,
    needsFood: readinessNeedsFood,
    needsCalm: readinessNeedsCalm,
    needsSettle: readinessNeedsSettle,
    line: (name: string, readiness: Readiness) =>
      readiness === 'ready' ? readinessReady(name) : readinessNeedsCare(name),
    /** Readiness line for the care kind the home screen recommends. */
    byCare: (name: string, kind: CareKind) =>
      kind === 'meal'
        ? readinessNeedsFood(name)
        : kind === 'rest'
          ? readinessNeedsCare(name)
          : kind === 'calm'
            ? readinessNeedsCalm(name)
            : readinessNeedsSettle(name),
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
    endCareTitle: 'Heute beenden?',
    endCareText: 'Ihr beendet den Besuch als Fürsorgeentscheidung. Das zählt wie ein regulärer Besuch.',
    endCareConfirm: 'Als Fürsorge beenden',
    completedBefore: 'Schon besucht',
    repeat: 'Wiederholen',
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
    rewardTitle: 'Besuch abgeschlossen',
    rewardRowsTitle: 'Heute dazugekommen',
    rowMark: 'Schulmarke',
    rowMemory: 'Erinnerung',
    rowLearning: 'Lernpunkt',
    rowMarkNone: 'Heute keine Schulmarke.',
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
    preview: 'Vorschau',
    costLine: (n: number) => `Kosten: ${n === 1 ? '1 Marke' : `${n} Marken`}`,
    missingLine: (missing: number) =>
      `${missing === 1 ? 'Noch 1 Marke bis zum Ausbau.' : `Noch ${missing} Marken bis zum Ausbau.`} Jeder abgeschlossene Besuch gibt eine Marke. Jeder verstandene Lernpunkt gibt einmal eine weitere.`,
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
    renameSave: 'Speichern',
    renamed: (name: string) => `Dein Hund heißt jetzt ${name}.`,
    data: 'Daten',
    version: (version: string) => `Version ${version}`,
    on: 'An',
    off: 'Aus',
    modeCurrent: (mode: Mode) => `Aktiv: ${MODE_LABEL(mode)}.`,
    standardText:
      'Entspannt: Dein Welpe braucht Pflege, aber nichts kann ihm passieren. Keine Strafen, auch nicht nach langer Abwesenheit.',
    archiveTitle: 'Challenge beenden?',
    archives: 'Frühere Challenge-Läufe',
    archiveEntry: (name: string, visits: number) => `${name} · ${visits === 1 ? '1 Besuch' : `${visits} Besuche`}`,
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
    bandLabel: VITALITY_LABEL,
    vitalityLine: (band: VitalityBand) => `Verfassung: ${VITALITY_LABEL[band]}`,
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
    hideMemory: 'Erinnerung ausblenden',
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
    updateApply: 'Jetzt aktualisieren',
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
    /** "Nala: Der Körper ist locker, …" for aria text, reduced motion and the WebGL fallback. */
    poseLine: (name: string, pose: PoseId) => `${name}: ${POSE_DESCRIPTION[pose]}`,
    gestureLine: (name: string, gesture: GestureId) => GESTURE_DESCRIPTION[gesture](name),
  },

  /** Body-language description per PoseId; see POSE_DESCRIPTION. */
  poses: POSE_DESCRIPTION,
  /** Human gesture description per GestureId, named. */
  gestures: GESTURE_DESCRIPTION,

  /** Plain-language provenance per lesson for the "Gelernt" tab (03 Forschungsstand; nothing is book-verified yet). */
  sources: {
    status: 'Vorläufig; Buchabgleich und fachliche Prüfung offen.',
    statusLabel: (status: SourceStatus) =>
      status === 'reviewed' ? 'Geprüft' : status === 'book_review_open' ? 'Buchabgleich offen' : 'Vorläufig',
    byLesson: {
      L01: 'Grundlage: Dogs-Trust-Material zu Körpersprache und Stress. Kein Buchbeleg.',
      L02: 'Grundlage: Themen der Buchbeschreibung und Dogs-Trust-Material zu belohnungsorientiertem Training. Konkrete Übung noch nicht gegen das Buch geprüft.',
      L03: 'Grundlage: Dogs-Trust-Material zu Körpersprache und Stress. Konkrete Übung noch nicht gegen das Buch geprüft.',
    } satisfies Record<LessonId, string>,
    general:
      'Die Übungen sind eigene Entwürfe nach öffentlich zugänglichen Trainingsgrundlagen. Keine offizielle Kooperation, keine Seitenangaben.',
  },

  toasts: {
    visitInProgress: 'Ein Besuch läuft bereits.',
    settingsSaved: 'Gespeichert.',
    challengeResumed: 'Challenge fortgesetzt.',
    modeSwitched: (mode: Mode) => `${MODE_LABEL(mode)} aktiv.`,
  },

  dates: {
    today: 'heute',
    yesterday: 'gestern',
  },

  /** D-041 yard life: walking, prompts, dog sheet. Zone ids as in src/world/types.ts. */
  world: {
    prompts: {
      gate: 'Zum Tor',
      circle: 'Freies Üben',
      shelter: 'Unter das Dach',
      bowl: 'Futter und Wasser geben',
      rest_deck: 'Ruheplatz anbieten',
      sniff_corner: 'Schnüffeln lassen',
      quiet_corner: 'Hier Abstand geben',
      mira: 'Mit Mira sprechen',
      alex_bruno: 'Zu Alex und Bruno',
    },
    sheetTitle: 'Im Hof',
    zonesTitle: 'Wohin?',
    toStatic: 'Klassische Ansicht',
    toYard: 'Im Hof unterwegs',
    staticNote: 'Ohne 3D-Hof wählst du die Stellen aus einer Liste. Alle Übungen bleiben spielbar.',
    controls: { label: 'Ines bewegen', arrowup: 'Nach vorne gehen', arrowleft: 'Nach links gehen', arrowdown: 'Nach hinten gehen', arrowright: 'Nach rechts gehen' },
    walkHint: 'Halte die Pfeile gedrückt, um Ines zu bewegen, oder tippe auf den Boden. Nala folgt dir.',
    keysHint: 'W A S D oder Pfeiltasten bewegen Ines. Tippe Nala für Signale an. Enter führt die Aktion aus.',
    dog: {
      title: (name: string) => `${name}`,
      pet: 'Streicheln',
      play: 'Spielen',
      sit: 'Sitz',
      close: 'Schließen',
      greeting: (name: string) => `${name} schaut dich an, die Rute pendelt. Alles gut.`,
      sitDone: (name: string) => `${name} setzt sich.`,
    },
    alexBruno: (brunoState: string) => `Alex steht bei Bruno am Zaun. ${brunoState} Mit Abstand bleibt es für alle leicht.`,
    brunoStates: {
      tense: 'Bruno ist angespannt, die Ohren liegen zurück.',
      relaxed: 'Bruno steht locker da und schaut sich um.',
    },
    miraChoice: { title: 'Mira fragt', lesson: 'Eine Lektion beginnen', practice: 'Freies Üben', later: 'Später' },
    arrived: (zone: string) => `Du bist da: ${zone}.`,
  },

  /** D-041 playable exercise rounds. */
  exercise: {
    ready: 'Bereit.',
    attemptOf: (n: number, max: number) => `Versuch ${n} von ${max}`,
    watching: 'Schau, was passiert …',
    endExercise: 'Übung beenden',
    bandTitle: 'Wo stehst du?',
    moveHint: 'Geh mit Nala dorthin, wo es für sie leichter ist.',
    noMoreAttempts: 'Das waren drei Versuche. Mira erklärt, was zu sehen war.',
  },

  /** D-041 free practice. */
  practice: {
    title: 'Freies Üben',
    choose: 'Was möchtest du üben?',
    distraction: 'Ablenkung',
    distractions: {
      none: 'Keine',
      toy: 'Ein Ball im Kreis',
      other_dog: 'Bruno am Zaun',
    } satisfies Record<DistractionLevel, string>,
    start: 'Los',
    again: 'Noch einmal',
    done: 'Fertig',
    hintTitle: 'Mira sagt',
    success: 'Das hat geklappt.',
    notYet: 'Noch nicht. Das ist in Ordnung.',
    locked: (lesson: string) => `Erst nach der Lektion „${lesson}“.`,
    intro: 'Hier gibt es keine Marken und keine Uhr. Du probierst, was du gelernt hast, in deinem Tempo.',
    leave: 'Zurück in den Hof',
  },
} as const;

export type De = typeof de;
