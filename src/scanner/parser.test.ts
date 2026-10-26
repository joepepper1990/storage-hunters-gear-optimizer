import { describe, expect, it } from 'vitest';
import { parseGearOcrText, scanToGearDraft } from './parser';

describe('parseGearOcrText', () => {
  it('parses a wrist item with signed base stats and a numeric authentication', () => {
    const scan = parseGearOcrText(`
Jellyfish Wristband
Wrist
+54% Luck
-32% Bid Arrow Speed
-1% Walkspeed
Authenticated: Bid Recovery +7.4%
`);

    expect(scan.baseName).toBe('Jellyfish Wristband');
    expect(scan.slot).toBe('Wrist');
    expect(scan.stats.luck).toBe(54);
    expect(scan.stats.arrowReduction).toBe(32);
    expect(scan.stats.walk).toBe(-1);
    expect(scan.stats.recovery).toBe(0);
    expect(scan.authenticated).toBe(true);
    expect(scan.authentication.effect).toBe('Bid Recovery');
    expect(scan.authentication.value).toBe(7.4);
    expect(scan.confidence).toBe('High');
  });

  it('recognises noisy OCR aliases and item-name slot hints', () => {
    const scan = parseGearOcrText(`
Police Vest
Luck +65%
Energy Drink Tirne +28%
NPC Offer Bonus +9.7%
`);

    expect(scan.baseName).toBe('Police Vest');
    expect(scan.slot).toBe('Back');
    expect(scan.stats.luck).toBe(65);
    expect(scan.stats.energy).toBe(28);
    expect(scan.stats.npc).toBe(9.7);
    expect(scan.warnings).not.toContain('Slot could not be identified — review before saving.');
  });

  it('parses Zone and Arrow when the number appears after the label', () => {
    const scan = parseGearOcrText(`
Pearl Dominus
Bid Zone Width +76%
Bid Arrow Speed -35%
Luck +100%
`);

    expect(scan.slot).toBe('Head');
    expect(scan.stats.zone).toBe(76);
    expect(scan.stats.arrowReduction).toBe(35);
    expect(scan.stats.luck).toBe(100);
  });

  it('parses slot-exclusive passive authentication without treating it as a base stat', () => {
    const scan = parseGearOcrText(`
Pearl Dominus
Head
Luck +100%
Bid Zone Width +76%
AUTHENTICATED
Nocturnal +35%
`);

    expect(scan.authenticated).toBe(true);
    expect(scan.authentication.effect).toBe('Nocturnal');
    expect(scan.authentication.value).toBe(35);
    expect(scan.stats.luck).toBe(100);
  });

  it('recognises a current Premium Certificate perk', () => {
    const scan = parseGearOcrText(`
Pearl Dominus
Head
+100% Luck
AUTHENTICATED
Mutated Luck +75%
`);

    expect(scan.authenticated).toBe(true);
    expect(scan.authentication.kind).toBe('Premium');
    expect(scan.authentication.effect).toBe('Mutated Luck');
    expect(scan.authentication.value).toBe(75);
  });

  it('recognises current Limited passives, including Grade Re-Roll, without misclassifying them as Alien',()=>{
    for(const [effect,slot] of [['Auto X-Ray','Head'],['Grade Re-Roll','Head'],['Luck Frenzy','Back'],['Featherweight','Back'],['Second Chance','Wrist'],['Steady Hand','Wrist']] as const){
      const name=slot==='Head'?'Pearl Dominus':slot==='Back'?'Police Vest':'Jellyfish Wristband';
      const scan=parseGearOcrText(`${name}\n${slot}\n+10% Luck\nAUTHENTICATED\n${effect} +12%`);
      expect(scan.authentication.kind).toBe('Limited');
      expect(scan.authentication.effect).toBe(effect);
      expect(scan.warnings.some(w=>w.includes('Legacy Alien'))).toBe(false);
    }
  });

  it('recognises a blue visual Grade Re-Roll as current Limited rather than legacy Alien',()=>{
    const raw='Pearl Dominus\\n+100% Luck\\nGrade Re-Roll +20%';
    const lines=[
      {text:'Pearl Dominus',bbox:{x0:500,y0:100,x1:720,y1:135},color:'neutral'},
      {text:'+100% Luck',bbox:{x0:500,y0:150,x1:760,y1:185},color:'green'},
      {text:'Grade Re-Roll +20%',bbox:{x0:500,y0:200,x1:830,y1:235},color:'blue'}
    ] as const;
    const scan=parseGearOcrText(raw,lines as any);
    expect(scan.authentication).toMatchObject({kind:'Limited',effect:'Grade Re-Roll',value:20});
    expect(scan.warnings.some(w=>w.includes('Legacy Alien'))).toBe(false);
  });

  it('recognises Club Pact as Premium',()=>{
    const scan=parseGearOcrText('Jellyfish Wristband\nWrist\n+54% Luck\nAUTHENTICATED\nClub Pact +4%');
    expect(scan.authentication).toMatchObject({kind:'Premium',effect:'Club Pact',value:4});
  });

  it('captures explicit mutation and condition labels without guessing from item name',()=>{
    const scan=parseGearOcrText(`
Diamond Crypto Necklace
Head
Mutation: Diamond
Condition: 83%
+60% Luck
+46% Bid Zone Width
-1.5% NPC Offers Bonus
`);
    expect(scan.baseName).toBe('Diamond Crypto Necklace');
    expect(scan.mutation).toBe('Diamond');
    expect(scan.conditionPct).toBe(83);
    const draft=scanToGearDraft(scan);
    expect(draft.mutation).toBe('Diamond');
    expect(draft.conditionPct).toBe(83);

    const noMetadata=parseGearOcrText('Gold Crypto Necklace\\nHead\\n+46% Luck');
    expect(noMetadata.mutation).toBeUndefined();
    expect(noMetadata.conditionPct).toBeUndefined();
  });

  it('recognises a blue nonnumeric Mutated Luck visual enchantment',()=>{
    const raw=`Reactor Fedora
+75% Luck
-45% Bid Arrow Speed
Mutated Luck
Mutation: None
Condition: 55%`;
    const lines=[
      {text:'Reactor Fedora',bbox:{x0:500,y0:110,x1:700,y1:140},color:'neutral'},
      {text:'+75% Luck',bbox:{x0:500,y0:151,x1:720,y1:184},color:'green'},
      {text:'-45% Bid Arrow Speed',bbox:{x0:500,y0:195,x1:830,y1:228},color:'green'},
      {text:'Mutated Luck',bbox:{x0:500,y0:240,x1:760,y1:273},color:'blue'},
      {text:'Mutation: None',bbox:{x0:500,y0:285,x1:730,y1:300},color:'neutral'},
      {text:'Condition: 55%',bbox:{x0:500,y0:308,x1:740,y1:323},color:'neutral'}
    ] as const;
    const scan=parseGearOcrText(raw,lines as any);
    expect(scan.baseName).toBe('Reactor Fedora');
    expect(scan.authentication).toMatchObject({kind:'Premium',effect:'Mutated Luck',value:0});
    expect(scan.mutation).toBe('None');
    expect(scan.conditionPct).toBe(55);
  });

  it('infers slots for user-provided necklace, fedora, hood, goggles and baton items',()=>{
    const examples:Array<[string,'Head'|'Wrist']>=[
      ['Reactor Fedora','Head'],['Gold Crypto Necklace','Head'],
      ['Diamond Steampunk Goggle','Head'],['Desert Hood','Head'],
      ['Police Baton','Wrist']
    ];
    for(const [name,slot] of examples){
      const scan=parseGearOcrText(`${name}\n+5% Luck`);
      expect(scan.slot).toBe(slot);
      expect(scan.slotDetected).toBe(true);
    }
  });

  it('flags legacy Alien text for manual review instead of creating an Alien auth', () => {
    const scan = parseGearOcrText(`
Jellyfish Wristband
Wrist
Luck +54%
Rush +10%
Alien
`);

    expect(scan.authentication.kind).toBe('None');
    expect(scan.warnings.some(w => w.includes('Legacy Alien'))).toBe(true);
  });

  it('returns low confidence when no item or stats can be recognised', () => {
    const scan = parseGearOcrText('blurred screenshot text only');
    expect(scan.confidence).toBe('Low');
    expect(scan.warnings.length).toBeGreaterThan(0);
  });
});


  it('uses the largest visual stat cluster and blue text to identify the tooltip authentication', () => {
    const raw = `TOTAL BONUSES
-29% Bid Arrow Speed
+13.4% NPC Offers Bonus
Race Valk
-76% Bid Arrow Speed
+64% Energy Drink Time
+7.7% NPC Offers Bonus`;
    const lines = [
      { text: 'TOTAL BONUSES', bbox: { x0: 420, y0: 150, x1: 530, y1: 166 }, color: 'neutral' },
      { text: '-29% Bid Arrow Speed', bbox: { x0: 420, y0: 170, x1: 535, y1: 181 }, color: 'green' },
      { text: '+13.4% NPC Offers Bonus', bbox: { x0: 420, y0: 182, x1: 540, y1: 194 }, color: 'green' },
      { text: 'Race Valk', bbox: { x0: 680, y0: 210, x1: 850, y1: 250 }, color: 'neutral' },
      { text: '-76% Bid Arrow Speed', bbox: { x0: 680, y0: 260, x1: 1010, y1: 296 }, color: 'green' },
      { text: '+64% Energy Drink Time', bbox: { x0: 680, y0: 305, x1: 1040, y1: 341 }, color: 'green' },
      { text: '+7.7% NPC Offers Bonus', bbox: { x0: 680, y0: 350, x1: 1030, y1: 386 }, color: 'blue' }
    ];
    const scan = parseGearOcrText(raw, lines as any);

    expect(scan.baseName).toBe('Race Valk');
    expect(scan.slot).toBe('Head');
    expect(scan.stats.arrowReduction).toBe(76);
    expect(scan.stats.energy).toBe(64);
    expect(scan.stats.npc).toBe(0);
    expect(scan.authenticated).toBe(true);
    expect(scan.authentication.effect).toBe('NPC Offers Bonus');
    expect(scan.authentication.value).toBe(7.7);
  });

describe('scanToGearDraft', () => {
  it('creates an unsaved GearItem draft without folding auth stats into base stats', () => {
    const scan = parseGearOcrText(`Jellyfish Wristband\nWrist\n+54% Luck\n-32% Bid Arrow Speed\nAuth Bid Recovery +7.4%`);
    const item = scanToGearDraft(scan, '2026-09-03T20:00:00.000Z', 'test-id');

    expect(item.id).toBe('test-id');
    expect(item.baseName).toBe('Jellyfish Wristband');
    expect(item.slot).toBe('Wrist');
    expect(item.stats.arrowReduction).toBe(32);
    expect(item.stats.recovery).toBe(0);
    expect(item.authentication.effect).toBe('Bid Recovery');
    expect(item.createdAt).toBe('2026-09-03T20:00:00.000Z');
  });
});
