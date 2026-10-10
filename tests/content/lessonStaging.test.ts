import {describe,it,expect} from 'vitest';
import {content} from '../../src/content';
import {createNewSave} from '../../src/simulation/save';
import {createTestProviders} from '../../src/simulation/fixtures';
import {getSceneDirective,getObservation} from '../../src/simulation/selectors';
import {POSE_IDS} from '../../src/simulation/types';
import {STAGE_POSITIONS} from '../../src/render/objects/SchoolScene';
import {PROP_HOME} from '../../src/render/objects/Props';

describe('every lesson variant and response uses its visible staging',()=>{
 for(const lesson of Object.values(content.lessons))for(const round of lesson.rounds)for(let seed=0;seed<Math.max(1,round.variants?.length??0);seed++){
  it(`${round.id} variant ${seed}`,()=>{
   const save=createNewSave('standard',createTestProviders(),0);
   save.currentVisit={id:'test',lessonId:lesson.id,seed,startedUTC:0,queue:[{roundId:round.id,supported:false,inserted:false}],index:0,phase:'observe',decisions:[],completedRoundIds:[],context:{arousal:20,stress:20,energyShown:null,difficulty:'normal'},lastOptionId:null,insertedRetryUsed:false,attempts:[]};
   const variant=round.variants?.[seed];const observe=getSceneDirective(save,content,{route:'lesson',yardMode:'static'});const dog=observe.dogs.find(d=>d.id===round.dogId)!;
   expect(dog.pose).toBe(variant?.observationPose??round.observationPose);
   expect(dog.position).toBe(variant?.dogPosition??round.dogPosition??'center');
   expect(getObservation(save,content)!.text).toBe(variant?.observationText??round.observationText);
   for(const option of round.options){
    save.currentVisit.phase='react';save.currentVisit.lastOptionId=option.id;
    const next=getSceneDirective(save,content,{route:'lesson',yardMode:'static'});const actor=next.dogs.find(d=>d.id===round.dogId)!;
    const expected=option.poseAfter==='rest_loop'&&dog.pose==='rest_side'?'rest_side':option.poseAfter;
    expect(actor.pose,option.id).toBe(expected);expect(POSE_IDS).toContain(actor.pose);
    expect(STAGE_POSITIONS[actor.position]).toBeDefined();
    for(const hidden of option.hidePropsAfter??[])expect(next.props).not.toContain(hidden);
    if(option.dogPositionAfter==='retreat'){
      const target=round.id==='L02_C'?PROP_HOME.ball:PROP_HOME.toy_rolling;
      expect(STAGE_POSITIONS[actor.position].distanceTo(target)).toBeGreaterThan(STAGE_POSITIONS[dog.position].distanceTo(target));
    }
   }
  });
 }
 it('waking and continuing from rest require standing; rest closure preserves side lying',()=>{
  expect(content.lessons.L03.rounds[2]!.options.find(o=>o.id==='L03_C_wake')!.poseAfter).toBe('tired_idle');
  expect(content.lessons.L01.rounds[2]!.options.find(o=>o.id==='L01_C_again')!.poseAfter).toBe('tired_idle');
 });
});
