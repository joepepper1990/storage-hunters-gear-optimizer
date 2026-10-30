import { describe, expect, it } from 'vitest';
import { canonicalEffect, currentPool } from '../authentication';
import { makeInitialData } from '../defaults';
import { certificateOutcomeLikelihoods } from './certificateDecision';
import { wantedChance } from './certificatePolicy';
import type { CertificateRollLog, OwnedCertificate, Slot } from '../types';

const WOODEN='Wooden Certificate of Authenticity',RIPPED='Ripped Certificate of Authenticity';
const PREMIUM='Premium Certificate of Authenticity',LIMITED='Limited Certificate of Authenticity';
const normal7=['Bid Recovery','Bid Arrow Speed','Bid Zone Width','Energy Drink Time','Tip Chance','NPC Offers Bonus','Walkspeed'];

describe('canonical certificate pools',()=>{
  it('gives Wooden and Ripped the same 10 / 9 / 9 outcomes without plain Luck',()=>{
    for(const type of [WOODEN,RIPPED] as const){
      expect(currentPool(type,'Head').sort()).toEqual([...normal7,'Sunny','Nocturnal','Overcharged'].sort());
      expect(currentPool(type,'Back').sort()).toEqual([...normal7,'Raindrop','Focused'].sort());
      expect(currentPool(type,'Wrist').sort()).toEqual([...normal7,'Time Keeper','Connected'].sort());
      for(const slot of ['Head','Back','Wrist'] as const)expect(currentPool(type,slot)).not.toContain('Luck');
    }
  });

  it('has the Premium and Limited pools, with no alias counted twice and no Fossil Finder',()=>{
    expect(currentPool(PREMIUM,'Head')).toEqual(['Mutated Luck']);
    expect(currentPool(PREMIUM,'Back').sort()).toEqual(['Drought Breaker','Golden Hour']);
    expect(currentPool(PREMIUM,'Wrist').sort()).toEqual(['Club Pact','Temporal Split']);
    expect(currentPool(LIMITED,'Head').sort()).toEqual(['Auto X-Ray','Grade Re-Roll']);
    expect(currentPool(LIMITED,'Back').sort()).toEqual(['Featherweight','Luck Frenzy']);
    expect(currentPool(LIMITED,'Wrist').sort()).toEqual(['Second Chance','Steady Hand']);
    expect((['Head','Back','Wrist'] as Slot[]).flatMap(s=>currentPool(LIMITED,s))).not.toContain('Fossil Finder');
  });

  it('canonicalises aliases',()=>{
    expect(['Droughtbreaker','Club Packed','Timekeeper','Overcharge','Focus'].map(canonicalEffect))
      .toEqual(['Drought Breaker','Club Pact','Time Keeper','Overcharged','Focused']);
  });
});

describe('equal outcome probabilities',()=>{
  const cert=(type:OwnedCertificate['type']):OwnedCertificate=>({id:type,type,quantity:1});
  const odds=(type:OwnedCertificate['type'],slot:Slot,data=makeInitialData())=>
    Object.fromEntries(certificateOutcomeLikelihoods(data,cert(type),slot).map(o=>[o.effect,o.probability]));

  it('splits Wooden and Ripped odds evenly: 10% on Head, 1/9 on Back and Wrist',()=>{
    for(const type of [WOODEN,RIPPED] as const){
      expect(Object.values(odds(type,'Head'))).toEqual(Array(10).fill(.1));
      for(const slot of ['Back','Wrist'] as const){
        const values=Object.values(odds(type,slot));
        expect(values).toHaveLength(9);
        for(const p of values)expect(p).toBeCloseTo(1/9,12);
      }
    }
  });

  it('gives Premium and Limited 100% or 50/50, and Club Packed does not add a third Wrist outcome',()=>{
    expect(odds(PREMIUM,'Head')).toEqual({'Mutated Luck':1});
    expect(odds(PREMIUM,'Back')).toEqual({'Golden Hour':.5,'Drought Breaker':.5});
    const data=makeInitialData();
    const row=data.authModel.find(r=>r.certificateInventoryType===PREMIUM&&r.outcome==='Club Pact')!;
    data.authModel.push({...row,id:'alias',outcome:'Club Packed'});
    expect(odds(PREMIUM,'Wrist',data)).toEqual({'Club Pact':.5,'Temporal Split':.5});
    expect(odds(LIMITED,'Head')).toEqual({'Auto X-Ray':.5,'Grade Re-Roll':.5});
    expect(odds(LIMITED,'Back')).toEqual({'Luck Frenzy':.5,'Featherweight':.5});
    expect(odds(LIMITED,'Wrist')).toEqual({'Second Chance':.5,'Steady Hand':.5});
  });

  it('ignores roll history, likelihood classes and enabled flags when picking an effect',()=>{
    const data=makeInitialData();
    const rolls:CertificateRollLog[]=Array.from({length:100},(_,i)=>({id:'r'+i,date:'',certificateType:'Normal Certificate of Authenticity',
      certificateInventoryType:WOODEN,itemId:'x',itemName:'x',slot:'Back',previousAuthentication:'',previousValue:0,
      newAuthentication:'Raindrop',newValue:50,improvedBestSet:false,bestScoreBefore:0,bestScoreAfter:0}));
    data.rollLog=rolls;
    data.authModel=data.authModel.map(r=>r.outcome==='Raindrop'?{...r,assumedLikelihoodClass:'VERY HIGH'}:r.outcome==='Focused'?{...r,enabled:false,assumedLikelihoodClass:'VERY LOW'}:r);
    const back=odds(WOODEN,'Back',data);
    expect(back.Raindrop).toBeCloseTo(1/9,12);
    expect(back.Focused).toBeCloseTo(1/9,12);
  });
});

describe('wanted-effect chance',()=>{
  it('counts Arrow as wanted only while the best set is below the band',()=>{
    for(const type of [WOODEN,RIPPED] as const){
      expect(wantedChance(type,'Head',true)).toBeCloseTo(6/10);
      expect(wantedChance(type,'Back',true)).toBeCloseTo(5/9);
      expect(wantedChance(type,'Wrist',true)).toBeCloseTo(3/9);
      expect(wantedChance(type,'Head',false)).toBeCloseTo(5/10);
      expect(wantedChance(type,'Back',false)).toBeCloseTo(4/9);
      expect(wantedChance(type,'Wrist',false)).toBeCloseTo(2/9);
    }
  });
  it('makes Premium Head/Back and Limited Back fully wanted, the rest not at all',()=>{
    for(const needArrow of [true,false]){
      expect([wantedChance(PREMIUM,'Head',needArrow),wantedChance(PREMIUM,'Back',needArrow),wantedChance(PREMIUM,'Wrist',needArrow)]).toEqual([1,1,0]);
      expect([wantedChance(LIMITED,'Head',needArrow),wantedChance(LIMITED,'Back',needArrow),wantedChance(LIMITED,'Wrist',needArrow)]).toEqual([0,1,0]);
    }
  });
});
