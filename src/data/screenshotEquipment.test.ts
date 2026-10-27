import {describe,it,expect} from 'vitest';
import {makeInitialData,DEFAULT_TROPHY_SETTINGS} from '../defaults';
import {screenshotVehicleParts,screenshotTrophies,screenshotCertificates,mergeScreenshotParts,replaceWithVerifiedTrophies,mergeScreenshotCertificates} from './screenshotEquipment';
import {exportJson,importJson,normalizeData} from './storage';
import {optimiseTrophies,specialistTrophyLoadout,analyseTrophyRetention,evaluateTrophySet} from '../engine/trophies';

describe('October screenshot inventory — schema 13',()=>{
  it('captures seven vehicle parts including the newer reversed-stat Manta roll',()=>{
    const parts=screenshotVehicleParts();
    expect(parts).toHaveLength(7);
    expect(parts.find(p=>p.baseName==='Lotus Ruby Wheel Stack')).toMatchObject({speedPct:59,capacityKg:228});
    expect(parts.find(p=>p.baseName==='Jewelled Exhaust')).toMatchObject({speedPct:54,accelerationPct:54});
    expect(parts.find(p=>p.baseName==='Sapphire Spoiler')).toMatchObject({accelerationPct:68});
    expect(parts.find(p=>p.baseName==='[Exclusive] Sunflower Wheel Stack')).toMatchObject({accelerationPct:58,capacityKg:214,conditionPct:92});
    expect(parts.find(p=>p.baseName==='[Exclusive] Autumn Exhaust')).toMatchObject({speedPct:-11,accelerationPct:39,conditionPct:89});
    expect(parts.find(p=>p.baseName==='Cogwheel Wheel Stack')).toMatchObject({speedPct:27,capacityKg:85,conditionPct:92});
    expect(parts.find(p=>p.baseName==='Manta Spoiler')).toMatchObject({speedPct:-16,accelerationPct:15,conditionPct:95});
    const original=makeInitialData().vehicleParts.find(p=>p.baseName==='Manta Spoiler'&&p.speedPct===26);
    expect(original?.accelerationPct).toBe(-16);
    expect(mergeScreenshotParts(makeInitialData().vehicleParts)).toHaveLength(makeInitialData().vehicleParts.length);
  });
  it('captures exactly the fifteen verified 27 October Gavels, inventory and displays',()=>{
    const gavels=screenshotTrophies();
    expect(gavels).toHaveLength(15);
    expect(new Set(gavels.map(g=>g.id)).size).toBe(15);
    expect(gavels.map(g=>g.name).sort()).toEqual([
      'Sandy +167%','Gem +194%','Hologram +142%','Hologram +125%','Huge +188% / Chrome +24%','Hologram +154% / Silver +143%',
      'Void +47%','Tiny +103% / Hologram +121%','Huge +188% / Chrome +24%','Hologram +93% / Silver +161%','Chrome +133% / Diamond +129%',
      'Hologram +124% / Chrome +123% / Diamond +34%','Void +86%','Void +147% / Gold +146%','Hologram +157% / Chrome +76%'
    ].sort());
    expect(gavels.some(g=>g.name==='Void +74%')).toBe(false);
    const condition=(name:string)=>gavels.filter(t=>t.name===name).map(t=>t.conditionPct);
    expect(condition('Chrome +133% / Diamond +129%')).toEqual([97]);
    expect(condition('Hologram +154% / Silver +143%')).toEqual([54]);
    expect(condition('Void +47%')).toEqual([59]);
    expect(condition('Tiny +103% / Hologram +121%')).toEqual([55]);
    expect(condition('Huge +188% / Chrome +24%')).toEqual([93,93]);
    // Display tooltips do not show condition.
    expect(condition('Void +147% / Gold +146%')).toEqual([undefined]);
  });
  it('replaces stored Gavels with the verified set, keeping matching favourites and IDs one-to-one',()=>{
    const [first,...rest]=screenshotTrophies();
    const stale={...rest[0],id:'stale-void74',name:'Void +74%',modifiers:[{mutation:'Void',boostPct:74}]};
    const favourite={...first,id:'my-own-id',favourite:true,conditionPct:undefined};
    const huge=screenshotTrophies().find(t=>t.name==='Huge +188% / Chrome +24%')!;
    const replaced=replaceWithVerifiedTrophies([favourite,stale,{...huge,id:'old-huge',favourite:true}]);
    expect(replaced).toHaveLength(15);
    expect(replaced.some(t=>t.id==='stale-void74')).toBe(false);
    expect(replaced.find(t=>t.id==='my-own-id')).toMatchObject({favourite:true,conditionPct:first.conditionPct});
    const hugeCopies=replaced.filter(t=>t.name==='Huge +188% / Chrome +24%');
    expect(hugeCopies.map(t=>t.favourite).sort()).toEqual([false,true]);
    expect(hugeCopies.some(t=>t.id==='old-huge')).toBe(true);
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
  it('records the seven current certificates including two 2-star Limited certificates',()=>{
    const certs=screenshotCertificates();
    expect(certs).toHaveLength(7);
    expect(certs.filter(c=>c.type==='Limited Certificate of Authenticity')).toEqual([
      {id:'verified-oct26-cert-limited-6291',type:'Limited Certificate of Authenticity',quantity:1,displayedValue:6291,gradeStars:2,rarity:'Limited'},
      {id:'verified-oct26-cert-limited-5967',type:'Limited Certificate of Authenticity',quantity:1,displayedValue:5967,gradeStars:2,rarity:'Limited'}
    ]);
    expect(certs.filter(c=>c.type==='Premium Certificate of Authenticity')).toHaveLength(1);
    expect(certs.filter(c=>c.type==='Wooden Certificate of Authenticity')).toHaveLength(4);
    expect(certs.filter(c=>c.type==='Wooden Certificate of Authenticity').every(c=>c.gradeStars===2)).toBe(true);
  });
  it('upgrades legacy data once, replacing gear/certificates but preserving other inventory domains',()=>{
    const legacy=makeInitialData() as any;
    legacy.schemaVersion=8;
    legacy.gear=[];
    legacy.ownedCertificates=[{id:'stale-cert',type:'Wooden Certificate of Authenticity',quantity:99}];
    legacy.vehicleParts=legacy.vehicleParts.slice(0,3);
    legacy.trophies=[screenshotTrophies()[0]];
    const first=normalizeData(legacy);
    expect(first.schemaVersion).toBe(14);
    expect(first.gear).toHaveLength(22);
    expect(first.vehicleParts).toHaveLength(3);
    expect(first.trophies).toHaveLength(15);
    expect(first.ownedCertificates).toHaveLength(7);
    expect(first.ownedCertificates.some(c=>c.id==='stale-cert')).toBe(false);

    // Once schema 14 is saved, deliberate later removals stay removed.
    const again=importJson(exportJson(first));
    const deliberatelyRemoved={...again,gear:[],vehicleParts:[],trophies:[],ownedCertificates:[]};
    const saved=importJson(exportJson(deliberatelyRemoved));
    expect(saved.gear).toHaveLength(0);
    expect(saved.vehicleParts).toHaveLength(0);
    expect(saved.trophies).toHaveLength(0);
    expect(saved.ownedCertificates).toHaveLength(0);
    expect(mergeScreenshotParts(screenshotVehicleParts())).toHaveLength(7);
    expect(replaceWithVerifiedTrophies(screenshotTrophies())).toEqual(screenshotTrophies());
    expect(mergeScreenshotCertificates(screenshotCertificates())).toHaveLength(7);
  });
});
