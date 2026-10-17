import {describe,it,expect} from 'vitest';
import {makeInitialData,DEFAULT_TROPHY_SETTINGS} from '../defaults';
import {screenshotVehicleParts,screenshotTrophies,screenshotCertificates,mergeScreenshotParts,mergeScreenshotTrophies,mergeScreenshotCertificates} from './screenshotEquipment';
import {exportJson,importJson,normalizeData} from './storage';
import {optimiseTrophies,specialistTrophyLoadout,analyseTrophyRetention,evaluateTrophySet} from '../engine/trophies';

describe('October screenshot inventory — schema 6',()=>{
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
  it('captures all twelve trophies including separate 3-modifier and shelf rolls',()=>{
    const gavels=screenshotTrophies();
    expect(gavels).toHaveLength(12);
    expect(gavels.find(t=>t.name==='Hologram +124% / Chrome +123% / Diamond +34%')?.modifiers).toHaveLength(3);
    for(const name of ['Hologram +154% / Silver +143%','Hologram +157% / Chrome +76%',
      'Void +86%','Chrome +133% / Diamond +129%','Hologram +93% / Silver +161%',
      'Void +74%','Huge +188% / Chrome +24%','Hologram +125%','Gem +194%',
      'Hologram +142%','Sandy +167%'])expect(gavels.map(g=>g.name)).toContain(name);
    expect(gavels.find(t=>t.name==='Chrome +133% / Diamond +129%')?.conditionPct).toBe(97);
    expect(gavels.find(t=>t.name==='Void +74%')?.conditionPct).toBe(92);
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
  it('records Wooden Certificate quantity 1, Epic, 56% condition',()=>{
    expect(screenshotCertificates()).toEqual([{id:'verified-oct17-cert-wooden-56',type:'Wooden Certificate of Authenticity',quantity:1,conditionPct:56,rarity:'Epic'}]);
  });
  it('upgrades legacy data once, without destroying older rolls or making duplicate new records',()=>{
    const legacy=makeInitialData() as any;
    legacy.schemaVersion=5;legacy.vehicleParts=legacy.vehicleParts.slice(0,3);
    legacy.trophies=[screenshotTrophies()[0]];
    legacy.ownedCertificates=[];
    const first=normalizeData(legacy);
    expect(first.schemaVersion).toBe(6);
    expect(first.vehicleParts).toHaveLength(10);
    expect(first.trophies).toHaveLength(12);
    expect(first.ownedCertificates).toHaveLength(1);
    const again=importJson(exportJson(first));
    expect(again.vehicleParts).toHaveLength(10);
    expect(again.trophies).toHaveLength(12);
    expect(again.ownedCertificates).toHaveLength(1);
    const deliberatelyRemoved={...again,vehicleParts:[],trophies:[],ownedCertificates:[]};
    const saved=importJson(exportJson(deliberatelyRemoved));
    expect(saved.vehicleParts).toHaveLength(0);
    expect(saved.trophies).toHaveLength(0);
    expect(saved.ownedCertificates).toHaveLength(0);
    expect(mergeScreenshotParts(screenshotVehicleParts())).toHaveLength(7);
    expect(mergeScreenshotTrophies(screenshotTrophies())).toHaveLength(12);
    expect(mergeScreenshotCertificates(screenshotCertificates())).toHaveLength(1);
  });
});
