import { describe, expect, it } from 'vitest';
import { countStars, parsePanel, type PanelLine } from './panel';
import { applyDraft, knownSlots, matchDraft } from '../data/screenshotImport';
import { makeInitialData } from '../defaults';

const g = (text: string): PanelLine => ({ text, color: 'green' });
const r = (text: string): PanelLine => ({ text, color: 'red' });
const b = (text: string): PanelLine => ({ text, color: 'blue' });
const n = (text: string): PanelLine => ({ text, color: 'neutral' });

// Text as OCR returned it from the user's 27 October screenshots.
describe('reading the item panel',()=>{
  it('reads a gear piece with mutations, a Premium effect and its description',()=>{
    const scan=parsePanel({stars:3,infoLines:['[Diamond] [Silver] Steampunk','Goggle','Epic','$451,200','Condition: 85%'],
      statLines:[g('+136% Luck'),g('+64% Bid Zone Width'),r('-2% Tip Chance'),b('Mutated Luck'),n('Each worn accessory adds luck based'),n('on its mutator')]});
    expect(scan).toMatchObject({kind:'gear',baseName:'Steampunk Goggle',mutation:'Diamond + Silver',slot:'Head',conditionPct:85,stars:3,
      authentication:{kind:'Premium',effect:'Mutated Luck',value:0}});
    expect(scan.kind==='gear'&&scan.stats).toMatchObject({luck:136,zone:64,tip:-2});
  });
  it('stores Bid Arrow by its game sign: green -45% is +45 reduction, red +3% is -3',()=>{
    const fedora=parsePanel({stars:2,infoLines:['Reactor Fedora','Mythical','$53,136','Condition: 55%'],statLines:[g('-45% Bid Arrow Speed'),g('+75% Luck'),b('Mutated Luck')]});
    expect(fedora.kind==='gear'&&fedora.stats.arrowReduction).toBe(45);
    const helm=parsePanel({stars:1,infoLines:['[Diamond] Steampunk Valk Helm','Epic','Condition: 97%'],statLines:[g('+13% Bid Recovery'),g('+7.5% NPC Offers Bonus'),r('+3% Bid Arrow Speed')]});
    expect(helm).toMatchObject({kind:'gear',slot:'Head',mutation:'Diamond'});
    expect(helm.kind==='gear'&&helm.stats).toMatchObject({recovery:13,npc:7.5,arrowReduction:-3});
  });
  it('takes the direction of a stat from its colour when the sign is misread',()=>{
    const valk=parsePanel({stars:3,infoLines:['[Cobwebbed] Race Valk','Mythical'],statLines:[g('76% Bid Arrow Speed'),g('+64% Energy Drink Time')]});
    expect(valk.kind==='gear'&&valk.stats).toMatchObject({arrowReduction:76,energy:64});
    const bunny=parsePanel({stars:1,infoLines:['[Limited] Franken Bunny Wristband','Legendary'],statLines:[r('6% Energy Drink Time'),r('3% Bid Arrow Speed')]});
    expect(bunny.kind==='gear'&&bunny.stats).toMatchObject({energy:-6,arrowReduction:-3});
  });
  it('reads a numeric authentication shown in blue',()=>{
    const vest=parsePanel({stars:2,infoLines:['[Police] Police Vest','Legendary','$63,763.20','Condition: 96%'],statLines:[g('+65% Luck'),g('+9.7% NPC Offers Bonus'),b('+18% Bid Zone Width')]});
    expect(vest).toMatchObject({kind:'gear',slot:'Back',authentication:{kind:'Normal',effect:'Bid Zone Width',value:18}});
    expect(vest.kind==='gear'&&vest.stats.zone).toBe(0);
  });
  it('ignores the grey description under an effect even when it contains a percentage',()=>{
    const wrist=parsePanel({stars:2,infoLines:['[Cobwebbed] Reactor Wristband','Mythical','Condition: 55%'],statLines:[g('+8.9% Tip Chance'),g('+60% Luck'),b('+2% Connected'),n('Each friend grants +2% extra luck')]});
    expect(wrist.kind==='gear'&&wrist.stats).toMatchObject({tip:8.9,luck:60});
    expect(wrist).toMatchObject({slot:'Wrist',authentication:{effect:'Connected',value:2}});
  });
  it('treats everything after the effect as its description, even when the artwork tints it',()=>{
    const pearl=parsePanel({stars:2,infoLines:['Pearl Dominus','Mythical','Condition: 51%'],
      statLines:[g('+76% Bid Zone Width'),g('+100% Luck'),b('+35% Nocturnal'),g('+35% luck during the night')]});
    expect(pearl.kind==='gear'&&pearl.stats).toMatchObject({zone:76,luck:100});
    expect(pearl).toMatchObject({authentication:{effect:'Nocturnal',value:35},warnings:[]});
  });
  it('ignores stray symbols read from the item artwork',()=>{
    const helm=parsePanel({stars:1,infoLines:['[Diamond] Steampunk Valk Helm','Epic'],statLines:[g('+13% Bid Recovery'),b('aa VV :'),b('ff [ i (')]});
    expect(helm).toMatchObject({authentication:{kind:'None'},warnings:[]});
  });
  it('uses the inventory to find the slot of a name it cannot place',()=>{
    const scan=parsePanel({stars:1,infoLines:['Mystery Thing','Rare'],statLines:[g('+5% Luck')]},new Map([['mystery thing','Back']]));
    expect(scan).toMatchObject({kind:'gear',slot:'Back'});
    const unknown=parsePanel({stars:1,infoLines:['Mystery Thing','Rare'],statLines:[g('+5% Luck')]});
    expect(unknown.kind==='gear'&&unknown.slot).toBeUndefined();
    expect(unknown.warnings.join()).toMatch(/Slot unknown/);
  });
  it('reads Gavels and certificates',()=>{
    expect(parsePanel({stars:2,infoLines:['[Void +74%] Gavel Trophy','Legendary','$2,286.90','Condition: 92%'],statLines:[]}))
      .toMatchObject({kind:'gavel',modifiers:[{mutation:'Void',boostPct:74}],conditionPct:92,stars:2});
    expect(parsePanel({stars:0,infoLines:['[Chrome +133%] [Diamond +129%]','Gavel Trophy','Legendary','Condition: 97%'],statLines:[]}))
      .toMatchObject({kind:'gavel',modifiers:[{mutation:'Chrome',boostPct:133},{mutation:'Diamond',boostPct:129}],stars:0});
    expect(parsePanel({stars:2,infoLines:['Wooden Certificate Of Authenticity','Epic','$2,160','Condition: 50%'],statLines:[]}))
      .toMatchObject({kind:'certificate',type:'Wooden Certificate of Authenticity',stars:2});
    expect(parsePanel({stars:2,infoLines:['[Limited] Limited Certificate Of','Authenticity','Limited'],statLines:[]}))
      .toMatchObject({kind:'certificate',type:'Limited Certificate of Authenticity',mutation:undefined});
  });
  it('flags a screenshot with no item panel',()=>{
    expect(parsePanel({stars:0,infoLines:[],statLines:[]}).kind).toBe('unknown');
  });
  it('counts star icons from bright columns',()=>{
    const icon=Array(30).fill(5),gap=Array(8).fill(0);
    expect(countStars([...gap,...icon,...gap,...icon,...gap],15)).toBe(2);
    expect(countStars([...gap,1,1,...gap],15)).toBe(0);
    expect(countStars([...icon,0,0,...icon],15)).toBe(1); // A 2-pixel gap is inside one icon.
  });
});

describe('approving screenshots',()=>{
  const data=makeInitialData();
  const slots=knownSlots(data);
  it('updates the matching gear piece instead of adding a copy',()=>{
    const cow=data.gear.find(x=>x.baseName==='Cow Dominus')!;
    const scan=parsePanel({stars:1,infoLines:['Cow Dominus','Mythical','Condition: 54%'],statLines:[g('+58% Luck'),g('-35% Bid Arrow Speed')]},slots);
    expect(matchDraft(data,scan)).toEqual({status:'update',id:cow.id,name:'Cow Dominus',changes:['Stars: — → 1']});
    const misread={...scan,conditionPct:60,authentication:{kind:'Normal' as const,effect:'Luck',value:7}};
    expect(matchDraft(data,misread)).toMatchObject({changes:['Condition: 54% → 60%','Stars: — → 1','Effect: none → Luck 7%']});
    const next=applyDraft(data,scan);
    expect(next.gear).toHaveLength(data.gear.length);
    expect(next.gear.find(x=>x.id===cow.id)).toMatchObject({gradeStars:1,conditionPct:54});
  });
  it('adds new gear and Gavels, and one more of a certificate',()=>{
    const hat=parsePanel({stars:0,infoLines:['Brand New Hat','Rare','Condition: 100%'],statLines:[g('+20% Luck')]});
    expect(matchDraft(data,hat).status).toBe('new');
    const withHat=applyDraft(data,{...hat,slot:'Head'} as typeof hat,'2026-10-28T00:00:00.000Z','hat');
    expect(withHat.gear.find(x=>x.id==='hat')).toMatchObject({baseName:'Brand New Hat',slot:'Head',gradeStars:0,favourite:false});
    const gavel=parsePanel({stars:0,infoLines:['[Gold +50%] Gavel Trophy'],statLines:[]});
    expect(applyDraft(data,gavel).trophies).toHaveLength(data.trophies.length+1);
    const cert=parsePanel({stars:2,infoLines:['Wooden Certificate Of Authenticity'],statLines:[]});
    expect(matchDraft(data,cert)).toEqual({status:'add-one',owned:6});
    const total=(d:typeof data)=>d.ownedCertificates.reduce((s,c)=>s+c.quantity,0);
    expect(total(applyDraft(data,cert))).toBe(total(data)+1);
  });
  it('refuses a draft without a name or slot',()=>{
    const thing=parsePanel({stars:0,infoLines:['Brand New Thing'],statLines:[g('+20% Luck')]});
    expect(matchDraft(data,thing)).toEqual({status:'invalid',reason:'Choose a slot.'});
    expect(()=>applyDraft(data,thing)).toThrow('Choose a slot.');
  });
});
