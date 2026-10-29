import {describe,it,expect} from 'vitest';
import {makeInitialData,DEFAULT_TROPHY_SETTINGS} from '../defaults';
import {screenshotTrophies,screenshotCertificates,replaceWithVerifiedTrophies,replaceWithVerifiedCertificates} from './screenshotEquipment';
import {exportJson,importJson,normalizeData} from './storage';
import {optimiseTrophies,specialistTrophyLoadout,analyseTrophyRetention,evaluateTrophySet} from '../engine/trophies';

describe('October screenshot inventory — schema 15',()=>{
  it('captures exactly the eighteen verified 27 October Gavels, inventory and displays',()=>{
    const gavels=screenshotTrophies();
    expect(gavels).toHaveLength(18);
    expect(new Set(gavels.map(g=>g.id)).size).toBe(18);
    expect(gavels.map(g=>g.name).sort()).toEqual([
      'Sandy +167%','Gem +194%','Hologram +142%','Hologram +125%','Hologram +154% / Silver +143%',
      'Void +47%','Tiny +103% / Hologram +121%','Huge +188% / Chrome +24%','Hologram +93% / Silver +161%','Chrome +133% / Diamond +129%',
      'Hologram +124% / Chrome +123% / Diamond +34%','Void +86%','Void +147% / Gold +146%','Hologram +157% / Chrome +76%',
      'Void +74%','Corrupted +44%','Diamond +91%','Gold +94%'
    ].sort());
    const condition=(name:string)=>gavels.filter(t=>t.name===name).map(t=>t.conditionPct);
    expect(condition('Chrome +133% / Diamond +129%')).toEqual([97]);
    expect(condition('Hologram +154% / Silver +143%')).toEqual([54]);
    expect(condition('Void +47%')).toEqual([59]);
    expect(condition('Tiny +103% / Hologram +121%')).toEqual([55]);
    expect(condition('Huge +188% / Chrome +24%')).toEqual([93]);
    expect(condition('Void +74%')).toEqual([92]);
    expect(condition('Corrupted +44%')).toEqual([60]);
    expect(condition('Diamond +91%')).toEqual([84]);
    expect(condition('Gold +94%')).toEqual([75]);
    // Display tooltips do not show condition.
    expect(condition('Void +147% / Gold +146%')).toEqual([undefined]);
  });
  it('replaces stored Gavels with the verified set, keeping matching favourites and IDs one-to-one',()=>{
    const [first,...rest]=screenshotTrophies();
    const stale={...rest[0],id:'stale-void50',name:'Void +50%',modifiers:[{mutation:'Void',boostPct:50}]};
    const favourite={...first,id:'my-own-id',favourite:true,conditionPct:undefined};
    const huge=screenshotTrophies().find(t=>t.name==='Huge +188% / Chrome +24%')!;
    const replaced=replaceWithVerifiedTrophies([favourite,stale,{...huge,id:'old-huge',favourite:true},{...huge,id:'old-huge-2'}]);
    expect(replaced).toHaveLength(18);
    expect(replaced.some(t=>t.id==='stale-void50')).toBe(false);
    expect(replaced.find(t=>t.id==='my-own-id')).toMatchObject({favourite:true,conditionPct:first.conditionPct});
    // The screenshots show one Huge / Chrome Gavel, so a second stored copy is removed.
    const hugeCopies=replaced.filter(t=>t.name==='Huge +188% / Chrome +24%');
    expect(hugeCopies).toEqual([expect.objectContaining({id:'old-huge',favourite:true})]);
  });
  it('sets up three powered Gavels without gamepass and four with it, including specialists',()=>{
    const gavels=screenshotTrophies();
    const three={...DEFAULT_TROPHY_SETTINGS,maxActive:3};
    const four={...DEFAULT_TROPHY_SETTINGS,maxActive:4};
    expect(optimiseTrophies(gavels,three)[0].trophies).toHaveLength(3);
    expect(optimiseTrophies(gavels,four)[0].trophies).toHaveLength(4);
    expect(specialistTrophyLoadout(gavels,'Hologram',three)?.trophies).toHaveLength(3);
    expect(specialistTrophyLoadout(gavels,'Hologram',four)?.trophies).toHaveLength(4);
    const a=analyseTrophyRetention(gavels,three);
    expect(a.filter(x=>x.verdict==='EQUIP')).toHaveLength(3);
    expect(a.some(x=>x.specialistMutations.includes('Sandy'))).toBe(true);
  });
  it('adds repeated targeted mutation chance boosts arithmetically, not as sale multipliers',()=>{
    const chosen=screenshotTrophies().filter(t=>t.name==='Hologram +154% / Silver +143%'||t.name==='Hologram +157% / Chrome +76%');
    const result=evaluateTrophySet(chosen,DEFAULT_TROPHY_SETTINGS);
    expect(result.totalBoosts.Hologram).toBe(311);
    expect(result.totalBoosts.Silver).toBe(143);
    expect(result.totalBoosts.Chrome).toBe(76);
    expect(result.weightedContributions.Hologram).toBe(311*15);
  });
  it('records the nine current certificates including two 2-star Limited certificates',()=>{
    const certs=screenshotCertificates();
    expect(certs).toHaveLength(9);
    expect(new Set(certs.map(c=>c.id)).size).toBe(9);
    expect(certs.filter(c=>c.type==='Limited Certificate of Authenticity')).toEqual([
      {id:'verified-oct26-cert-limited-6291',type:'Limited Certificate of Authenticity',quantity:1,displayedValue:6291,gradeStars:2,rarity:'Limited'},
      {id:'verified-oct26-cert-limited-5967',type:'Limited Certificate of Authenticity',quantity:1,displayedValue:5967,gradeStars:2,rarity:'Limited'}
    ]);
    expect(certs.filter(c=>c.type==='Premium Certificate of Authenticity')).toHaveLength(1);
    const wooden=certs.filter(c=>c.type==='Wooden Certificate of Authenticity');
    expect(wooden.map(c=>c.displayedValue)).toEqual([2646,2451.60,2451.60,2397.60,2203.20,2160]);
    expect(wooden.every(c=>c.gradeStars===2)).toBe(true);
  });
  it('replaces stored certificates one-to-one, keeping IDs of matches',()=>{
    const [limited]=screenshotCertificates();
    const wooden=screenshotCertificates().find(c=>c.displayedValue===2451.60)!;
    const replaced=replaceWithVerifiedCertificates([{...limited,id:'mine'},{...wooden,id:'w1'},{...wooden,id:'w2'},{...wooden,id:'w3'},
      {id:'stale',type:'Wooden Certificate of Authenticity',quantity:1,displayedValue:56,gradeStars:1}]);
    expect(replaced).toHaveLength(9);
    expect(replaced.map(c=>c.id)).toEqual(expect.arrayContaining(['mine','w1','w2']));
    expect(replaced.some(c=>c.id==='w3'||c.id==='stale')).toBe(false);
    expect(replaceWithVerifiedCertificates(screenshotCertificates())).toEqual(screenshotCertificates());
  });
  it('upgrades legacy data once, then keeps later removals',()=>{
    const legacy=makeInitialData() as any;
    legacy.schemaVersion=8;
    legacy.gear=[];
    legacy.ownedCertificates=[{id:'stale-cert',type:'Wooden Certificate of Authenticity',quantity:99}];
    legacy.trophies=[screenshotTrophies()[0]];
    const first=normalizeData(legacy);
    expect(first.schemaVersion).toBe(17);
    expect(first.gear).toHaveLength(27);
    expect(first.trophies).toHaveLength(18);
    expect(first.ownedCertificates).toHaveLength(9);
    expect(first.ownedCertificates.some(c=>c.id==='stale-cert')).toBe(false);

    // Once schema 15 is saved, deliberate later removals stay removed.
    const again=importJson(exportJson(first));
    const deliberatelyRemoved={...again,gear:[],trophies:[],ownedCertificates:[]};
    const saved=normalizeData(JSON.parse(exportJson(deliberatelyRemoved)));
    expect(saved.gear).toHaveLength(0);
    expect(saved.trophies).toHaveLength(0);
    expect(saved.ownedCertificates).toHaveLength(0);
    expect(replaceWithVerifiedTrophies(screenshotTrophies())).toEqual(screenshotTrophies());
  });
});
