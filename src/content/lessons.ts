/**
 * Three MVP lessons as data. Source: docs/pfotenzeit/03_LERNPLAN_QUELLEN.md (scripts L01–L03, Effekte),
 * 02_SPIELSCHLEIFE (Beispiel Orientierung), 07 (Mira's register).
 * Quoted sentences from 03 are used verbatim; everything else is written in the same voice.
 * All lesson texts are provisional until the book review (sourceStatus). No page numbers are claimed.
 * No logic, no DOM, no timers.
 */
import type { LessonDefinition } from './types';
import type { LessonId } from '../simulation/types';

const L01: LessonDefinition = {
  id: 'L01',
  title: 'Hinschauen',
  subtitle: 'Situation und Körpersignale gemeinsam betrachten',
  learningPointId: 'criterion_context',
  learningPointLabel: 'Hinschauen',
  sourceIds: ['D1', 'D3'],
  sourceStatus: 'provisional',
  intro: 'Heute schauen wir nur hin. Körper, Ohren, Schwanz und Umgebung zusammen, nicht ein Zeichen allein.',
  transferText: 'Betrachte den ganzen Hund und die Umgebung. Ein einzelnes Zeichen erklärt nicht alles.',
  everydayText:
    'Wenn dein Hund wedelt, sich aber gleichzeitig abwendet und steif wird, zeigen mehrere Hinweise zusammen etwas anderes als Freude. Schau auf Haltung, Ohren, Blick und darauf, was gerade um ihn herum passiert.',
  practiceText:
    'Hinschauen braucht Übung, nicht Tempo. Besuch Nala noch einmal und achte wieder auf mehrere Hinweise zusammen. Jede passende Entscheidung in einer neuen Situation zählt.',
  rounds: [
    {
      id: 'L01_A',
      scenarioId: 'L01_calm_explore',
      dogId: 'dog_nala',
      humanId: 'human_mira',
      title: 'Nala erkundet',
      observationText: 'Nala geht mit lockerem Körper über den Hof und schnüffelt an einem Blatt. Ihr Blick ist weich.',
      observationDescription:
        'Der Körper ist locker, das Gewicht gleichmäßig auf allen vier Pfoten. Die Ohren hängen entspannt, der Schwanz pendelt auf mittlerer Höhe. Der Blick ist weich und geht zum Boden. Der Hof ist ruhig, niemand bewegt sich schnell. Mehrere Hinweise zusammen passen zu einem Hund, der gerade beschäftigt ist.',
      variants: [
        {
          id: 'L01_A_leaf',
          observationText: 'Nala geht mit lockerem Körper über den Hof und schnüffelt an einem Blatt. Ihr Blick ist weich.',
          observationDescription:
            'Der Körper ist locker, das Gewicht gleichmäßig auf allen vier Pfoten. Die Ohren hängen entspannt, der Schwanz pendelt auf mittlerer Höhe. Der Blick ist weich und geht zum Blatt am Boden. Der Hof ist ruhig, niemand bewegt sich schnell. Mehrere Hinweise zusammen passen zu einem Hund, der gerade beschäftigt ist.',
        },
        {
          id: 'L01_A_corner',
          dogPosition: 'sniff',
          environment: 'sniff_corner',
          props: ['sniff_corner', 'leaf'],
          observationText: 'Nala hat eine neue Ecke am Holzunterstand entdeckt und schnüffelt dort langsam entlang. Ihr Körper ist locker.',
          observationDescription:
            'Der Körper ist locker, die Nase ist tief am Boden, der Rücken bleibt weich. Die Ohren hängen entspannt, der Schwanz bewegt sich langsam auf mittlerer Höhe. Der Blick bleibt bei der Ecke. Der Hof ist ruhig. Mehrere Hinweise zusammen passen zu einem Hund, der gerade in Ruhe erkundet.',
        },
      ],
      observationPose: 'sniff',
      humanGesture: 'idle',
      environment: 'courtyard',
      props: ['leaf'],
      contextBefore: { arousal: 20, stress: 20, difficulty: 'normal' },
      supportHint:
        'Nala ist locker und beschäftigt. Sie braucht gerade nichts von dir. Beobachten lässt ihr Zeit und verändert die Situation nicht.',
      options: [
        {
          id: 'L01_A_observe',
          label: 'Ruhig beobachten',
          helpful: true,
          countsForLearning: false,
          poseAfter: 'idle_relaxed',
          humanGesture: 'idle',
          feedback:
            'Nala schnüffelt zu Ende, hebt den Kopf und schaut sich entspannt um. Du gibst Nala Zeit, die Situation selbst zu erkunden.',
          miraLine: 'Gut hingeschaut. Lockerer Körper, weicher Blick, ruhiger Hof.',
          everyday: 'Ein Hund, der ruhig schnüffelt, braucht meist keine Hilfe. Zuschauen ist eine gute erste Entscheidung.',
          next: 'advance',
        },
        {
          id: 'L01_A_approach',
          label: 'Sofort näher herangehen',
          helpful: false,
          countsForLearning: false,
          poseAfter: 'turn_away',
          dogPositionAfter: 'behind',
          humanGesture: 'kneel',
          feedback:
            'Nala unterbricht ihr Schnüffeln und weicht einen Schritt aus. Sie war gerade gut beschäftigt. Mit etwas Zeit und Abstand kann sie die Situation selbst erkunden.',
          miraLine: 'Sie war beschäftigt. Lass ihr beim nächsten Mal den Moment.',
          next: 'supportedRetry',
        },
      ],
    },
    {
      id: 'L01_B',
      scenarioId: 'L01_bruno_loud',
      dogId: 'dog_bruno',
      humanId: 'human_alex',
      title: 'Bruno wendet sich ab',
      observationText:
        'Im Hof ist es lauter geworden, ein Spielzeug rollt über den Boden. Bruno wendet sich ab, sein Körper wird steifer.',
      observationDescription:
        'Bruno hält den Kopf von der Bewegung weg, der Blick ist abgewandt. Der Rücken ist gerade und angespannt, das Gewicht liegt auf den Hinterbeinen. Die Ohren sind nach hinten gezogen, der Schwanz hängt tief und bewegt sich kaum. Der Mund ist geschlossen. Dazu kommt die laute Umgebung und das rollende Spielzeug. Mehrere Hinweise zusammen zeigen Spannung, nicht Interesse.',
      observationPose: 'turn_away',
      humanGesture: 'idle',
      environment: 'courtyard_loud',
      props: ['toy_rolling', 'leaf'],
      contextBefore: { arousal: 45, stress: 55, difficulty: 'normal' },
      supportHint:
        'Abgewandter Blick, steifer Körper, tiefer Schwanz und eine laute Umgebung kommen zusammen. Mehr Abstand macht die Situation für Bruno leichter. Geh mit Nala weiter weg und schau, wann beide lockerer werden.',
      exercise: {
        kind: 'find_spot',
        distraction: 'other_dog',
        instruction:
          'Bruno steht angespannt am Zaun, Alex bleibt bei ihm. Geh mit Nala ein Stück weg und beobachte beide. Wenn Nala lockerer wird, tippe auf „Hier bleiben“.',
        readyLabel: 'Hier bleiben',
        notReadyHint: 'Bleib kurz stehen, dann kannst du die Stelle wählen.',
        responseText: {
          settled: 'Nalas Körper wird weicher, die Ohren kommen nach vorn. Auch Bruno schaut sich wieder um. Der Abstand reicht.',
          still_tense: 'Nala steht noch steif, die Ohren liegen zurück, der Blick geht zu Bruno. Der Zaun ist noch zu nah.',
        },
        fallbackBands: { near: 'Dicht am Zaun bleiben', mid: 'Ein paar Schritte weg', far: 'Auf die andere Seite des Hofs' },
      },
      options: [
        {
          id: 'L01_B_stay',
          label: 'Hier bleiben und ruhig abwarten',
          helpful: true,
          countsForLearning: true,
          forResponses: ['settled'],
          poseAfter: 'idle_relaxed',
          humanGesture: 'kneel',
          feedback:
            'Du bleibst mit Nala auf Abstand. Ihr Körper bleibt locker, Bruno entspannt sich am Zaun. Mehrere Hinweise sprechen dafür, die Situation leichter zu machen, nicht näher heranzugehen.',
          miraLine: 'Genau. Abstand ist hier die einfachste Hilfe.',
          everyday:
            'Wendet sich ein Hund ab und wird steif, ist mehr Abstand zum Auslöser fast immer ein guter erster Schritt.',
          next: 'advance',
        },
        {
          id: 'L01_B_distance',
          label: 'Noch mehr Abstand',
          helpful: true,
          countsForLearning: false,
          forResponses: ['still_tense'],
          poseAfter: 'recover',
          humanGesture: 'gesture_explain',
          feedback:
            'Du gehst mit Nala noch ein Stück weiter. Steifer Körper, zurückgelegte Ohren und der nahe Zaun gehören zusammen. Mit mehr Abstand wird es für beide leichter.',
          miraLine: 'Weiter weg, dann schauen wir noch einmal.',
          next: 'retry',
        },
        {
          id: 'L01_B_lure',
          label: 'Zum Kontakt locken',
          helpful: false,
          countsForLearning: false,
          forResponses: ['settled', 'still_tense'],
          poseAfter: 'turn_away',
          humanGesture: 'offer_reward',
          feedback:
            'Bruno bleibt abgewandt und wird noch etwas steifer, Nala schaut weg. Steifer Körper, abgewandter Blick und der Lärm gehören zusammen. Der Reiz ist gerade zu nah. Mehr Abstand macht die Situation leichter.',
          miraLine: 'Er kann das Angebot gerade nicht annehmen. Erst Abstand, dann Kontakt.',
          next: 'supportedRetry',
        },
      ],
    },
    {
      id: 'L01_C',
      scenarioId: 'L01_nala_tired',
      dogId: 'dog_nala',
      humanId: 'human_mira',
      title: 'Nala bleibt zurück',
      observationText: 'Nala hatte schon mehrere Übungen. Sie bleibt zurück und legt sich hin.',
      observationDescription:
        'Nala folgt nicht mehr, sondern legt sich ein Stück hinter dir ab. Der Kopf liegt auf den Vorderpfoten, die Ohren hängen locker und der Schwanz liegt still. Vorher gab es mehrere Übungen hintereinander. Mehrere Hinweise zusammen passen zu Müdigkeit.',
      observationPose: 'rest_loop',
      dogPosition: 'behind',
      humanGesture: 'idle',
      environment: 'courtyard',
      props: [],
      contextBefore: { arousal: 15, stress: 25, energyShown: 40, difficulty: 'normal' },
      supportHint:
        'Nala hat heute schon viel geübt und legt sich von selbst ab. Eine Pause ist jetzt kein Abbruch, sondern eine Entscheidung für sie.',
      options: [
        {
          id: 'L01_C_pause',
          label: 'Pause anbieten',
          helpful: true,
          countsForLearning: true,
          poseAfter: 'rest_loop',
          humanGesture: 'kneel',
          feedback:
            'Nala bleibt liegen und atmet ruhig. Du nimmst ihre Müdigkeit ernst. Aufhören kann heute die beste Trainingsentscheidung sein.',
          miraLine: 'Schöner Abschluss. Sie hat heute genug gelernt.',
          everyday: 'Legt sich dein Hund während des Übens ab, ist eine Pause meist die passende Antwort, nicht noch ein Versuch.',
          next: 'careClosure',
        },
        {
          id: 'L01_C_again',
          label: 'Noch eine Runde',
          helpful: false,
          countsForLearning: false,
          poseAfter: 'tired_idle',
          humanGesture: 'idle',
          feedback:
            'Nala steht langsam auf und bleibt hinter dir stehen. Nach mehreren Übungen ist sie müde. Noch eine Runde kommt heute nicht mehr an. Eine Pause bleibt das passende Angebot.',
          miraLine: 'Sie ist durch für heute. Biete ihr die Pause an.',
          next: 'supportedRetry',
        },
      ],
    },
  ],
};

const L02: LessonDefinition = {
  id: 'L02',
  title: 'Orientierung',
  subtitle: 'Freiwillige Blicke bemerken und belohnen',
  learningPointId: 'criterion_orientation',
  learningPointLabel: 'Orientierung',
  sourceIds: ['B2', 'D3'],
  sourceStatus: 'provisional',
  intro: 'Heute achten wir darauf, wann Nala von selbst zu dir schaut. Diesen Moment wollen wir bemerken und lohnend machen.',
  transferText: 'Übe zuerst in einer Situation, in der dein Hund sich gut orientieren kann.',
  everydayText:
    'Ein Blick zu dir ist wertvoll, auch wenn er kurz ist. Belohne ihn, statt öfter zu rufen. Wird die Umgebung zu spannend, mach die Situation leichter, zum Beispiel mit mehr Abstand zur Ablenkung.',
  practiceText:
    'Orientierung wächst mit ruhigen Situationen. Besuch Nala noch einmal, warte auf ihren Blick und mach es ihr leichter, wenn die Umgebung zu viel wird.',
  rounds: [
    {
      id: 'L02_A',
      scenarioId: 'L02_quiet_sniff',
      dogId: 'dog_nala',
      humanId: 'human_mira',
      title: 'Nala schnüffelt',
      observationText: 'Ruhiger Hof. Nala schnüffelt am Boden und ist mit einem Grasbüschel beschäftigt.',
      observationDescription:
        'Der Körper ist locker, die Nase tief am Boden. Die Ohren hängen entspannt, der Schwanz ist auf mittlerer Höhe und bewegt sich leicht. Der Blick ist auf das Gras gerichtet. Der Hof ist ruhig, nichts bewegt sich schnell. Nala ist beschäftigt, nicht angespannt.',
      variants: [
        {
          id: 'L02_A_grass',
          observationText: 'Ruhiger Hof. Nala schnüffelt am Boden und ist mit einem Grasbüschel beschäftigt.',
          observationDescription:
            'Der Körper ist locker, die Nase tief am Boden. Die Ohren hängen entspannt, der Schwanz ist auf mittlerer Höhe und bewegt sich leicht. Der Blick ist auf das Gras gerichtet. Der Hof ist ruhig, nichts bewegt sich schnell. Nala ist beschäftigt, nicht angespannt.',
        },
        {
          id: 'L02_A_water',
          dogPosition: 'right',
          observationText: 'Ruhiger Hof. Nala schnüffelt langsam am Rand des Wasserplatzes entlang.',
          observationDescription:
            'Der Körper ist locker, der Rücken weich, die Nase dicht über dem Boden. Die Ohren hängen entspannt, der Schwanz pendelt langsam. Der Blick folgt der Spur am Boden. Am Wasserplatz ist es ruhig. Nala ist beschäftigt, nicht angespannt.',
        },
      ],
      observationPose: 'sniff',
      humanGesture: 'idle',
      environment: 'courtyard',
      props: ['water'],
      contextBefore: { arousal: 25, stress: 20, difficulty: 'normal' },
      supportHint:
        'Nala ist beschäftigt, aber die Umgebung ist ruhig. Wenn du wartest, schaut sie von selbst kurz zu dir. Dieser Blick ist der Moment, den wir suchen.',
      options: [
        {
          id: 'L02_A_wait',
          label: 'Warten und beobachten',
          helpful: true,
          countsForLearning: true,
          poseAfter: 'look_at_handler',
          humanGesture: 'idle',
          feedback:
            'Nala schnüffelt zu Ende und schaut von selbst kurz zu dir. Du hast ihr den Moment gelassen, und sie hat sich von allein orientiert.',
          miraLine: 'Da war er, der Blick. Freiwillig.',
          everyday: 'Warten ist im Alltag oft wirksamer als Rufen. Viele Hunde schauen von selbst, wenn sie fertig geschnüffelt haben.',
          next: 'advance',
        },
        {
          id: 'L02_A_call',
          label: 'Mehrmals rufen',
          helpful: false,
          countsForLearning: false,
          poseAfter: 'sniff',
          humanGesture: 'gesture_explain',
          feedback:
            'Nala schnüffelt weiter, als hätte sie nichts gehört. Das Signal ist hier noch nicht aufgebaut. Mach die Situation verständlicher.',
          miraLine: 'Rufen hilft ihr gerade nicht. Warte, bis sie von selbst schaut.',
          next: 'supportedRetry',
        },
      ],
    },
    {
      id: 'L02_B',
      scenarioId: 'L02_look_reward',
      dogId: 'dog_nala',
      humanId: 'human_mira',
      title: 'Nala schaut zu dir',
      observationText: 'Nala hebt den Kopf und schaut dich an. Die Szene hält diesen Moment für dich fest.',
      observationDescription:
        'Der Kopf ist gehoben, der Blick ruht auf dir. Die Ohren sind leicht nach vorn gerichtet, der Körper bleibt locker, der Schwanz ist auf mittlerer Höhe. Nala steht ruhig, nichts drängt. Dies ist ein freiwilliger, kurzer Blick, kein Zeitfenster.',
      observationPose: 'look_at_handler',
      humanGesture: 'idle',
      environment: 'courtyard',
      props: [],
      contextBefore: { arousal: 25, stress: 20, difficulty: 'normal' },
      supportHint:
        'Der Blick ist schon da. Er muss nicht länger oder deutlicher werden. Genau dieser kurze Moment ist belohnenswert.',
      options: [
        {
          id: 'L02_B_reward',
          label: 'Diesen Blick belohnen',
          helpful: true,
          countsForLearning: true,
          poseAfter: 'look_at_handler',
          humanGesture: 'offer_reward',
          feedback:
            'Mira gibt Nala ein kleines Stück Futter, während Nala sie anschaut. Du machst die freiwillige Orientierung lohnend.',
          miraLine: 'Du hast ihre freiwillige Orientierung bemerkt.',
          everyday: 'Ein kleines Leckerli für einen kurzen Blick reicht. Der Hund lernt: Zu dir schauen lohnt sich.',
          next: 'advance',
        },
        {
          id: 'L02_B_wait',
          label: 'Weiter warten',
          helpful: false,
          countsForLearning: false,
          poseAfter: 'sniff',
          humanGesture: 'idle',
          feedback:
            'Nala wendet sich wieder dem Boden zu und schnüffelt weiter. Der Blick war kurz, aber er war da. Du kannst den kurzen Blick bereits belohnen.',
          miraLine: 'Der kurze Blick reicht schon. Beim nächsten Mal direkt belohnen.',
          next: 'supportedRetry',
        },
      ],
    },
    {
      id: 'L02_C',
      scenarioId: 'L02_toy_distraction',
      dogId: 'dog_nala',
      humanId: 'human_mira',
      title: 'Ein Ball rollt vorbei',
      observationText: 'Ein Ball rollt über den Hof. Nala ist sofort hellwach und schaut nur noch auf den Ball.',
      observationDescription:
        'Der Körper ist nach vorn gerichtet, das Gewicht auf den Vorderpfoten. Die Ohren sind nach vorn gerichtet, der Schwanz ist hoch und bewegt sich schnell. Der Blick folgt dem rollenden Ball. Die Bewegung des Balls ist für Nala gerade das Wichtigste im Hof.',
      observationPose: 'alert_focus',
      humanGesture: 'idle',
      environment: 'courtyard',
      props: ['ball'],
      contextBefore: { arousal: 75, stress: 25, difficulty: 'normal' },
      supportHint:
        'Nala ist zu aufgeregt, um zu dir zu schauen. Nicht das Signal ist das Problem, sondern die Nähe zum Ball. Geh weiter weg vom Ball und ruf von dort.',
      exercise: {
        kind: 'recall',
        distraction: 'toy',
        minDistanceM: 2.6,
        instruction:
          'Ein Ball liegt im Trainingskreis. Geh ein paar Schritte von Nala weg, am besten weg vom Ball. Wenn du bereit bist, ruf sie zu dir.',
        readyLabel: 'Nala rufen',
        notReadyHint: 'Geh noch ein Stück weiter weg, damit der Ruf eine Aufgabe ist.',
        responseText: {
          comes: 'Nala löst sich vom Ball, kommt zu dir und schaut dich an. Die Rute ist auf mittlerer Höhe, der Körper locker.',
          distracted: 'Nala schaut nur auf den Ball. Die Ohren sind nach vorn, das Gewicht auf den Vorderpfoten. Der Ruf kommt gegen die Bewegung nicht an.',
          hesitates: 'Nala macht einen Schritt zu dir, bleibt dann stehen und schaut. Sie hat dich gehört, der Weg ist ihr gerade zu viel.',
          turns_away: 'Nala wendet sich ab und schnüffelt am Boden. Bruno ist sehr nah, ihr Körper ist angespannt.',
        },
        fallbackBands: { near: 'Direkt neben Nala', mid: 'Zwei Schritte weg', far: 'Weit weg vom Ball' },
      },
      options: [
        {
          id: 'L02_C_reward',
          label: 'Sofort belohnen',
          helpful: true,
          countsForLearning: true,
          forResponses: ['comes'],
          poseAfter: 'eat',
          humanGesture: 'offer_reward',
          feedback:
            'Du belohnst Nala, sobald sie bei dir ist. Weg vom Ball und zu dir hat sich gelohnt. Mit genug Abstand war die Aufgabe leicht genug.',
          miraLine: 'Schön. Erst die Situation leicht machen, dann belohnen.',
          everyday: 'Klappt die Orientierung nicht, ändere zuerst die Umgebung: mehr Abstand, weniger Bewegung, dann wieder üben.',
          next: 'advance',
          contextAfter: { arousal: 35, difficulty: 'easy' },
        },
        {
          id: 'L02_C_nothing',
          label: 'Nichts weiter tun',
          helpful: false,
          countsForLearning: false,
          forResponses: ['comes'],
          poseAfter: 'alert_focus',
          humanGesture: 'idle',
          feedback:
            'Nala kommt, bekommt aber keine Rückmeldung und schaut gleich wieder zum Ball. Ohne Belohnung ist der Weg zu dir nicht lohnender als das Spielzeug.',
          miraLine: 'Wenn sie kommt, lohnt es sich. Sonst war der Ball besser.',
          next: 'supportedRetry',
        },
        {
          id: 'L02_C_distance',
          label: 'Abstand zum Spielzeug vergrößern',
          helpful: true,
          countsForLearning: false,
          forResponses: ['distracted', 'hesitates', 'turns_away'],
          poseAfter: 'look_at_handler',
          humanGesture: 'gesture_explain',
          feedback:
            'Mit mehr Abstand wird der Ball weniger wichtig. Nala wird ruhiger und kann dich wieder wahrnehmen. Du hast die Situation leichter gemacht. Versuch es von weiter weg noch einmal.',
          miraLine: 'Mach es Nala leichter. Weniger Ablenkung ist ein guter nächster Schritt.',
          everyday: 'Klappt die Orientierung nicht, ändere zuerst die Umgebung: mehr Abstand, weniger Bewegung, dann wieder üben.',
          next: 'retry',
          contextAfter: { arousal: 35, difficulty: 'easy' },
        },
        {
          id: 'L02_C_repeat',
          label: 'Signal wiederholen',
          helpful: false,
          countsForLearning: false,
          forResponses: ['distracted', 'hesitates', 'turns_away'],
          poseAfter: 'alert_focus',
          humanGesture: 'gesture_explain',
          feedback:
            'Nala bleibt beim Ball. Das Signal kommt gegen die Bewegung gerade nicht an. Die Situation ist zu schwer, nicht Nala zu stur. Mehr Abstand zum Ball macht es leichter.',
          miraLine: 'Nicht öfter sagen. Die Situation einfacher machen.',
          next: 'supportedRetry',
        },
      ],
    },
  ],
};

const L03: LessonDefinition = {
  id: 'L03',
  title: 'Runterfahren',
  subtitle: 'Ruhe und passende Grenzen',
  learningPointId: 'criterion_support',
  learningPointLabel: 'Runterfahren',
  sourceIds: ['D1', 'D3'],
  sourceStatus: 'provisional',
  intro: 'Heute geht es darum, zu erkennen, wann es genug ist. Erleichtern oder aufhören sind gute Trainingsentscheidungen.',
  transferText: 'Ruhe und eine passende Schwierigkeit gehören zum Lernen.',
  everydayText:
    'Ein müder oder angespannter Hund lernt wenig. Biete einen ruhigen Platz an, nimm einen Reiz weg oder beende die Übung. Mehr Wiederholungen lösen nicht jede Schwierigkeit.',
  practiceText:
    'Runterfahren übt man in ruhigen Momenten. Besuch Nala noch einmal und achte darauf, wann sie Ruhe braucht und wann eine Situation einfacher werden muss.',
  rounds: [
    {
      id: 'L03_A',
      scenarioId: 'L03_nala_low_energy',
      dogId: 'dog_nala',
      humanId: 'human_mira',
      title: 'Nala hat schon geübt',
      observationText: 'Nala hat heute schon geübt. Sie steht langsam neben dem Ruheplatz, der Kopf hängt etwas tiefer.',
      observationDescription:
        'Der Kopf ist leicht gesenkt, die Bewegungen sind langsam. Die Ohren hängen locker und der Schwanz ist tief und ruhig. Sie gähnt einmal. Neben ihr liegt die Decke am Ruheplatz. Mehrere Hinweise zusammen passen zu einem Hund, der Ruhe braucht.',
      observationPose: 'tired_idle',
      dogPosition: 'rest',
      humanGesture: 'idle',
      environment: 'rest_place',
      props: ['rest_place', 'blanket'],
      contextBefore: { arousal: 15, stress: 25, energyShown: 34, difficulty: 'normal' },
      supportHint:
        'Nalas Energie ist niedrig, und der Ruheplatz ist direkt neben ihr. Ruhe anbieten ist jetzt echte Fürsorge und keine verpasste Übung.',
      options: [
        {
          id: 'L03_A_rest',
          label: 'Ruheplatz anbieten',
          helpful: true,
          countsForLearning: true,
          poseAfter: 'rest_loop',
          dogPositionAfter: 'rest',
          humanGesture: 'kneel',
          feedback: 'Nala legt sich auf die Decke und atmet ruhiger. Du berücksichtigst, was Nala jetzt braucht.',
          miraLine: 'Genau richtig. Erst Ruhe, dann wieder lernen.',
          everyday: 'Ein fester Ruheplatz hilft im Alltag: Dein Hund weiß, wo er abschalten kann, und du siehst, wann er ihn braucht.',
          next: 'advance',
          careEffect: 'rest',
        },
        {
          id: 'L03_A_task',
          label: 'Neue Aufgabe beginnen',
          helpful: false,
          countsForLearning: false,
          poseAfter: 'tired_idle',
          dogPositionAfter: 'rest_exit',
          humanGesture: 'gesture_explain',
          feedback:
            'Nala folgt langsam und bleibt immer wieder stehen. Sie hat heute schon geübt und ist müde. Eine neue Aufgabe kommt nicht an. Der Ruheplatz bleibt das passende Angebot.',
          miraLine: 'Sie kann gerade nichts Neues aufnehmen. Biete ihr Ruhe an.',
          next: 'supportedRetry',
        },
      ],
    },
    {
      id: 'L03_B',
      scenarioId: 'L03_bruno_stimulus',
      dogId: 'dog_bruno',
      humanId: 'human_alex',
      title: 'Bruno nahe am Geräusch',
      observationText: 'Ein Spielzeug rollt laut dicht an Bruno vorbei. Er hält den Blick abgewandt, sein Körper ist gespannt.',
      observationDescription:
        'Der Körper ist steif, das Gewicht nach hinten verlagert. Der Kopf ist vom rollenden Spielzeug weggedreht, der Blick abgewandt. Die Ohren liegen zurück, der Schwanz ist tief, der Mund geschlossen. Das Geräusch ist nah und wiederholt sich. Mehrere Hinweise zusammen zeigen, dass die Situation gerade zu viel ist.',
      observationPose: 'turn_away',
      humanGesture: 'idle',
      environment: 'courtyard_loud',
      props: ['toy_rolling', 'leaf'],
      contextBefore: { arousal: 50, stress: 65, difficulty: 'normal' },
      supportHint:
        'Bruno zeigt Spannung und Abwenden, und der Reiz ist sehr nah. Mehr Abstand macht die Situation tragbar. Geh mit Nala in eine ruhigere Ecke und schau, wann sie sich löst.',
      exercise: {
        kind: 'find_spot',
        distraction: 'other_dog',
        instruction:
          'Im Hof ist es laut, Bruno steht dicht am rollenden Spielzeug. Geh mit Nala zu einer ruhigeren Stelle, zum Ruheplatz oder in die stille Ecke. Wenn sie sich löst, tippe auf „Hier Ruhe geben“.',
        readyLabel: 'Hier Ruhe geben',
        notReadyHint: 'Bleib kurz stehen, dann kannst du die Stelle wählen.',
        responseText: {
          settled: 'Nala atmet ruhiger, der Rücken wird weicher, die Rute pendelt locker. Der Lärm ist weit genug weg.',
          still_tense: 'Nala steht noch angespannt, die Ohren zurück, der Blick geht zum Geräusch. Die Stelle ist noch zu nah dran.',
        },
        fallbackBands: { near: 'Nah beim Spielzeug bleiben', mid: 'In die Mitte des Hofs', far: 'Zum Ruheplatz oder in die stille Ecke' },
      },
      options: [
        {
          id: 'L03_B_stay',
          label: 'Hier bleiben und Ruhe geben',
          helpful: true,
          countsForLearning: true,
          forResponses: ['settled'],
          poseAfter: 'rest_loop',
          humanGesture: 'kneel',
          feedback:
            'Du bleibst mit Nala an der ruhigen Stelle. Ihr Körper wird weicher, die Ohren kommen nach vorn. Weniger Reiz und mehr Abstand machen die Situation tragbar.',
          miraLine: 'So wird es für sie wieder möglich.',
          everyday: 'Ist ein Reiz zu nah, hilf deinem Hund, bevor er sich selbst helfen muss: Reiz weg oder Abstand, erst dann weiterüben.',
          next: 'advance',
          contextAfter: { stress: 30 },
        },
        {
          id: 'L03_B_relieve',
          label: 'Noch weiter weg vom Geräusch',
          helpful: true,
          countsForLearning: false,
          forResponses: ['still_tense'],
          poseAfter: 'recover',
          humanGesture: 'gesture_explain',
          feedback:
            'Du gehst mit Nala noch ein Stück weiter vom Lärm weg. Steifer Körper, zurückgelegte Ohren und das nahe Geräusch gehören zusammen. Mehr Abstand macht es leichter.',
          miraLine: 'Noch ein Stück. Dann schauen wir, ob sie sich löst.',
          next: 'retry',
        },
        {
          id: 'L03_B_lure',
          label: 'Zum Reiz locken',
          helpful: false,
          countsForLearning: false,
          forResponses: ['settled', 'still_tense'],
          poseAfter: 'turn_away',
          humanGesture: 'offer_reward',
          feedback:
            'Nala bleibt, wo sie ist, und hält den Blick abgewandt. Niemand zieht sie hin. Heute ist der Schritt zu groß. Mehr Abstand hilft.',
          miraLine: 'Sie sagt gerade deutlich Nein. Reiz weg, Abstand geben.',
          next: 'supportedRetry',
        },
      ],
    },
    {
      id: 'L03_C',
      scenarioId: 'L03_nala_resting',
      dogId: 'dog_nala',
      humanId: 'human_mira',
      title: 'Nala liegt ruhig',
      observationText: 'Nala liegt ruhig am Ruheplatz, der Kopf auf den Pfoten. Ihre Atmung ist langsam.',
      observationDescription:
        'Nala liegt auf der Decke, der Kopf ruht auf den Vorderpfoten. Die Ohren hängen locker, der Schwanz liegt still. Die Atmung ist langsam und gleichmäßig. Um sie herum ist es ruhig. Alle Hinweise zusammen zeigen Entspannung.',
      variants: [
        {
          id: 'L03_C_paws',
          observationText: 'Nala liegt ruhig am Ruheplatz, der Kopf auf den Pfoten. Sie atmet langsam.',
          observationDescription:
        'Nala liegt auf der Decke, der Kopf ruht auf den Vorderpfoten. Die Ohren hängen locker, der Schwanz liegt still. Die Atmung ist langsam und gleichmäßig. Um sie herum ist es ruhig. Alle Hinweise zusammen zeigen Entspannung.',
        },
        {
          id: 'L03_C_side',
          observationPose: 'rest_side',
          observationText: 'Nala hat sich am Ruheplatz auf die Seite gelegt. Die Augen fallen ihr fast zu.',
          observationDescription:
            'Nala liegt seitlich auf der Decke, die Beine locker ausgestreckt. Die Augen sind fast geschlossen, die Ohren liegen weich an, der Schwanz liegt still. Die Atmung ist langsam. Um sie herum ist es ruhig. Alle Hinweise zusammen zeigen tiefe Entspannung.',
        },
      ],
      observationPose: 'rest_loop',
      dogPosition: 'rest',
      humanGesture: 'idle',
      environment: 'rest_place',
      props: ['rest_place'],
      contextBefore: { arousal: 10, stress: 15, difficulty: 'normal' },
      supportHint:
        'Nala ist entspannt und hat heute gelernt. Aufhören, solange es ihr gut geht, ist ein vollständiger Abschluss, nicht ein verpasster Rest.',
      options: [
        {
          id: 'L03_C_close',
          label: 'Heute abschließen',
          helpful: true,
          countsForLearning: true,
          poseAfter: 'rest_loop',
          humanGesture: 'kneel',
          feedback:
            'Nala bleibt entspannt liegen. Du beendest den Besuch, solange es ihr gut geht. Das ist ein vollwertiger Abschluss.',
          miraLine: 'Gut gewählt. Ruhe am Ende gehört zum Training.',
          everyday: 'Hör auf, solange es gut läuft. Ein ruhiges Ende bleibt deinem Hund in Erinnerung, nicht die Wiederholung danach.',
          next: 'careClosure',
        },
        {
          id: 'L03_C_wake',
          label: 'Für noch eine Übung aufwecken',
          helpful: false,
          countsForLearning: false,
          poseAfter: 'tired_idle',
          humanGesture: 'gesture_explain',
          feedback:
            'Nala hebt den Kopf und steht langsam auf. Ihr Kopf bleibt tief, die Rute hängt ruhig. Sie hat heute schon gelernt und ist müde. Heute abschließen bleibt das passende Angebot.',
          miraLine: 'Lass sie liegen. Was sie heute gelernt hat, bleibt.',
          next: 'supportedRetry',
        },
      ],
    },
  ],
};

export const lessons: Record<LessonId, LessonDefinition> = { L01, L02, L03 };

export const LESSON_ORDER: readonly LessonId[] = ['L01', 'L02', 'L03'];
