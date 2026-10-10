/** Developer evidence harness: uses the shipped catalog, scene selector, actors and GLBs. No player save changes. */
import { Vector3, Quaternion } from 'three';
import { content } from '../../content';
import { createNewSave } from '../../simulation/save';
import { getSceneDirective, getObservation } from '../../simulation/selectors';
import { createGameRenderer } from '../app/GameRenderer';
import { createAssetManager } from '../loaders/AssetManager';
import type { LessonId, SceneDirective, GrowthStage } from '../../simulation/types';

const status = document.querySelector<HTMLSpanElement>('#status')!;
const select = document.querySelector<HTMLSelectElement>('#cases')!;
const gallery = document.querySelector<HTMLElement>('#gallery')!;
const downloads = document.querySelector<HTMLElement>('#downloads')!;
const caption = document.querySelector<HTMLElement>('#caption')!;
const providers = { nowUTC: () => 0, monotonic: () => 0, id: (s = '') => s, seed: () => 0 };
const params = new URLSearchParams(location.search);
const baseline = params.has('baseline');
const stage = (params.get('growth') ?? 'arriving') as GrowthStage;
const assets = createAssetManager({ baseUrl: '/', ...(baseline ? {fetchManifest: async () => {
  const m = await (await fetch('/art/lesson-animation-review-2026-10-10/before/manifest.json')).json();
  for (const key of ['dog.nala.puppy', 'dog.nala.growing', 'dog.bruno.puppy']) m.assets[key].url = '/art/lesson-animation-review-2026-10-10/before/' + m.assets[key].url.split('/').pop();
  return m;
}} : {}) });
const renderer = createGameRenderer({baseUrl: '/', assets, reducedMotion: false, qualityTier: 'high'});
const cases: Array<{id: string; lesson: LessonId; round: string; seed: number; option?: string}> = [];
for (const lesson of Object.values(content.lessons)) for (const round of lesson.rounds) {
  cases.push({id: round.id + ' observe', lesson: lesson.id, round: round.id, seed: 0});
  for (const option of round.options) cases.push({id: option.id, lesson: lesson.id, round: round.id, seed: 0, option: option.id});
  for (let i = 1; i < (round.variants?.length ?? 0); i++) {
    cases.push({id: round.variants![i]!.id, lesson: lesson.id, round: round.id, seed: i});
    for (const option of round.options) cases.push({id: option.id + '_' + round.variants![i]!.id.split('_').pop(), lesson: lesson.id, round: round.id, seed: i, option: option.id});
  }
}
for (const [i, c] of cases.entries()) select.add(new Option(c.id, String(i)));
const makeSave = (c: typeof cases[number], reaction = false) => {
  const save = createNewSave('standard', providers, 0);
  save.dog.growthStage = stage;
  save.currentVisit = {id: 'review', lessonId: c.lesson, seed: c.seed, startedUTC: 0, queue: [{roundId: c.round, supported: false, inserted: false}], index: 0, phase: reaction ? 'react' : 'observe', decisions: [], completedRoundIds: [], context: {arousal: 20, stress: 20, energyShown: null, difficulty: 'normal'}, lastOptionId: reaction ? c.option ?? null : null, insertedRetryUsed: false, attempts: []};
  return save;
};
const directiveFor = (c: typeof cases[number], reaction = false): SceneDirective => {
  const directive = getSceneDirective(makeSave(c, reaction), content, {route: 'lesson'});
  if (baseline) for (const dog of directive.dogs) {
    if (dog.pose === 'alert_focus') dog.pose = 'tense_idle';
    if (dog.pose === 'rest_side') dog.pose = 'rest_loop';
  }
  return directive;
};
const draw = () => {
  const gl = renderer.debug.webgl()!;
  renderer.debug.scene.updateMatrixWorld(true);
  gl.render(renderer.debug.scene, renderer.debug.camera.camera);
  return gl.domElement;
};
const advance = async (seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) { renderer.debug.step(1 / 60); await Promise.resolve(); }
  draw();
};
const copyFrame = () => {
  const source = draw();
  const frame = document.createElement('canvas');
  frame.width = 600; frame.height = 360;
  frame.getContext('2d')!.drawImage(source, 0, 0, frame.width, frame.height);
  return frame;
};
const sample = () => {
  const c = cases[Number(select.value)]!;
  const dog = renderer.debug.dogs().find(d => d.id === content.lessons[c.lesson].rounds.find(r => r.id === c.round)!.dogId)!;
  const nodes = ['Dog_Neck_TopSHJnt','Dog_Tail_01_02SHJnt','Dog_Tail_01_05SHJnt','Dog_l_Ear_01_01SHJnt','Dog_l_FrontLeg_BallSHJnt'];
  const bones = Object.fromEntries(nodes.map(name => {
    const bone = dog.root.getObjectByName(name);
    return [name, bone ? {position: bone.getWorldPosition(new Vector3()).toArray(), rotation: bone.getWorldQuaternion(new Quaternion()).toArray()} : null];
  }));
  const points = dog.measure();
  const morphs: Record<string, number> = {};
  dog.root.traverse((node: any) => {
    for (const [name, index] of Object.entries(node.morphTargetDictionary ?? {})) morphs[name] = node.morphTargetInfluences[index as number];
  });
  return {expectedPose: directiveFor(c, Boolean(c.option)).dogs.find(d => d.id === dog.id)!.pose, moving: dog.isMoving(), pose: dog.pose(), tier: dog.tier(), position: dog.position().toArray(), bones, morphs, finite: points.every(p => p.toArray().every(Number.isFinite)), bounds: {minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y))}, framing: renderer.debug.framingReport()};
};
const show = async (index: number, settleReaction = true) => {
  renderer.setActive(false);
  const c = cases[index]!; const round = content.lessons[c.lesson].rounds.find(r => r.id === c.round)!;
  select.value = String(index);
  // Reset to a standing entry state so the review includes lying down and getting up.
  const obs = directiveFor(c);
  renderer.apply({...obs, dogs: obs.dogs.map(d => ({...d, pose: 'idle_relaxed'}))});
  // Wait for actual model I/O, not just simulated animation time, after cast changes.
  for (let retry=0;retry<100;retry++) {
    if (renderer.debug.dogs().every(d => d.tier() === 'glb')) break;
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  await Promise.all(renderer.debug.dogs().map(d => d.play('idle_relaxed', {instant:true})));
  await advance(.5);
  renderer.apply(obs);
  await advance(10);
  if (c.option) {
    const next = directiveFor(c, true);
    renderer.apply(next);
    const option = round.options.find(o => o.id === c.option)!;
    const work = renderer.present({type: 'decision', dogId: round.dogId, poseAfter: next.dogs[0]!.pose, roundId: round.id, optionId: option.id, helpful: option.helpful, supported: false}, {maxDurationMs: 6000, reducedMotion: false});
    if (settleReaction) {await advance(7); await work; await advance(.5);} else void work;
  }
  const observation = getObservation(makeSave(c), content)!;
  caption.textContent = c.id + ' · ' + (c.option ? round.options.find(o => o.id === c.option)!.feedback : observation.text + ' ' + observation.description);
  return c;
};
select.addEventListener('change', async () => { await show(Number(select.value)); renderer.setActive(true); status.textContent = 'Live shipped model animation'; });
const addDownload = (blob: Blob, name: string, label: string) => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.textContent = label; downloads.append(a); return a;
};
const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
let reviewed: Array<any> = [];
document.querySelector('#all')!.addEventListener('click', async () => {
  status.textContent = 'Reviewing all lesson cases…'; gallery.replaceChildren(); downloads.replaceChildren(); reviewed = [];
  const sheets = new Map<string, {canvas: HTMLCanvasElement; count: number}>();
  for (const [index, c] of cases.entries()) {
    status.textContent = `Reviewing ${index + 1}/${cases.length}: ${c.id}`;
    await show(index); const a = sample(); const first = copyFrame(); await advance(.37); const b = sample();
    reviewed.push({case: c.id, before: a, after: b, pass: a.pose === a.expectedPose && !a.moving && a.finite && a.tier === 'glb'});
    if (!sheets.has(c.lesson)) {
      const count = cases.filter(x => x.lesson === c.lesson).length;
      const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = Math.ceil(count / 3) * 424 + 60;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#f4f0e8';ctx.fillRect(0, 0, canvas.width, canvas.height);ctx.fillStyle = '#243631';ctx.font = 'bold 28px system-ui';ctx.fillText(`${c.lesson} · ${content.lessons[c.lesson].title} · shipped ${stage} dog model`,20,40);
      sheets.set(c.lesson,{canvas,count:0});
    }
    const sheet = sheets.get(c.lesson)!; const n = sheet.count++; const x = n % 3 * 600; const y = Math.floor(n / 3) * 424 + 60; const ctx = sheet.canvas.getContext('2d')!;
    ctx.drawImage(first, x, y, 600, 360); ctx.fillStyle = '#243631';ctx.font = 'bold 21px system-ui';ctx.fillText(c.id, x + 12, y + 385);ctx.font = '18px system-ui';ctx.fillText(`${a.pose} · ${a.tier} · finite surface: ${a.finite}`, x + 12, y + 411);
  }
  for (const [id, sheet] of sheets) {
    const blob = await toBlob(sheet.canvas); const link = addDownload(blob, `${id}-${stage}-${baseline ? 'before' : 'after'}.png`, `Download ${id} proof`);
    const img = document.createElement('img'); img.src = link.href; img.alt = id + ' all observation and response cases'; gallery.append(img);
  }
  addDownload(new Blob([JSON.stringify({baseline,growth:stage,cases:reviewed},null,2)],{type:'application/json'}),`lesson-animation-${stage}-${baseline ? 'before' : 'after'}.json`,'Download review measurements');
  status.textContent = `Completed ${cases.length} cases · ${reviewed.filter(r => r.pass).length}/${cases.length} correct settled shipped GLB poses`;
});
document.querySelector('#record')!.addEventListener('click', async () => {
  const canvas = document.createElement('canvas');canvas.width = 1000;canvas.height = 660;
  const ctx = canvas.getContext('2d')!; const stream = canvas.captureStream(30); const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3500000});
  recorder.ondataavailable = e => {if(e.data.size)chunks.push(e.data);};
  const done = new Promise<void>(resolve => {recorder.onstop = () => {addDownload(new Blob(chunks,{type:'video/webm'}),'lesson-animations.webm','Download animation video');resolve();};});
  recorder.start();
  const videoCases = cases.map((c,index)=>({c,index})).filter(({c}) => !c.option || ['L01_C_again','L01_B_distance','L02_C_distance','L03_A_rest','L03_A_task','L03_B_relieve','L03_C_wake'].includes(c.option) && c.seed === 0);
  for (const {index,c} of videoCases) {
    status.textContent = `Recording ${index+1}/${cases.length}: ${c.id}`;
    await show(index, false);
    for (let i=0;i<(c.option ? 180 : 75);i++) {
      renderer.debug.step(1/30); const frame=draw();
      ctx.fillStyle='#f4f0e8';ctx.fillRect(0,0,1000,660);ctx.drawImage(frame,0,60,1000,560);ctx.fillStyle='#243631';ctx.font='bold 24px system-ui';ctx.fillText(`${content.lessons[c.lesson].title} · ${c.id}`,20,38);ctx.font='18px system-ui';ctx.fillText(`${sample().pose} · actual shipped 3D model`,20,644);
      await new Promise(resolve=>setTimeout(resolve,33));
    }
  }
  recorder.stop();stream.getTracks().forEach(t=>t.stop());await done;status.textContent='Animation video ready';
});
await Promise.all(['dog.nala.puppy','dog.nala.growing','dog.bruno.puppy','human.mira','human.alex'].map(key => assets.load(key,{requiredClips:[],requireSkinned:true})));
await renderer.mount(document.querySelector<HTMLElement>('#viewport')!);
await show(0);renderer.setActive(true);status.textContent='Ready · live shipped GLB model';
