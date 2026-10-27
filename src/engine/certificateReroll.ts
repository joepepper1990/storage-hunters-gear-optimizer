import type { AppData, CertificateRollLog, OwnedCertificate } from '../types';
import {
  analyseCertificate,
  analyseConditionalNumberReroll,
  type CertificateTargetDecision
} from './certificateDecision';
import { rebuildEmpiricalModel } from './certificateRolls';
import { MODEL_ASSUMPTIONS } from './modelAssumptions';

export const AUTHENTICATOR_REROLL_COST_ROBUX=MODEL_ASSUMPTIONS.authenticator.paidRerollRobux;

export interface PostRollOption {
  action:'REROLL EFFECT'|'REROLL NUMBER';
  recommendable:boolean;
  expectedMainPct:number;
  chancePotentialWorsePct:number;
  unresolvedOutcomeMassPct:number;
  expectedContextualMainPct:number;
  expectedDrinkPrepPct:number;
  expectedGradingPct:number;
  expectedShopPct:number;
  expectedPersonalPreferenceDelta:number;
  note:string;
}

export interface PostRollDecision {
  roll:CertificateRollLog;
  costRobux:number;
  recommendation:'ACCEPT'|'REROLL EFFECT'|'REROLL NUMBER';
  effectReroll?:PostRollOption;
  numberReroll?:PostRollOption;
  reason:string;
}

function syntheticCertificate(roll:CertificateRollLog):OwnedCertificate|undefined {
  if(!roll.certificateInventoryType)return undefined;
  return {
    id:'post-roll-'+roll.id,
    type:roll.certificateInventoryType,
    quantity:1,
    gradeStars:roll.certificateGradeStars,
    mutation:roll.certificateMutation
  };
}

function option(
  action:PostRollOption['action'],
  values:Pick<PostRollOption,'expectedMainPct'|'chancePotentialWorsePct'|'unresolvedOutcomeMassPct'|'expectedContextualMainPct'|'expectedDrinkPrepPct'|'expectedGradingPct'|'expectedShopPct'|'expectedPersonalPreferenceDelta'>|undefined,
  extraNote=''
):PostRollOption|undefined {
  if(!values)return undefined;
  const resolved=values.unresolvedOutcomeMassPct<1e-9;
  const lowDownside=values.chancePotentialWorsePct<45;
  // A lower-priority benefit can only justify spending when every higher
  // priority is neutral. In particular, Shop cannot pay for lost Drink Prep.
  const priorities=priorityTuple(values);
  const minimumGains=[.25,1,.20,3,3,3];
  const firstMaterial=priorities.findIndex(value=>value!==0);
  const benefit=firstMaterial>=0&&priorities[firstMaterial]>=minimumGains[firstMaterial]&&
    (firstMaterial!==0||priorities[0]>.25);
  return {
    action,...values,recommendable:resolved&&lowDownside&&benefit,
    note:!resolved
      ?'Incomplete same-certificate evidence prevents a paid reroll recommendation. '+extraNote
      :!lowDownside?'Downside is too high for a paid reroll recommendation. '+extraNote
      :'Compared directly against accepting the existing roll. '+extraNote
  };
}

type OptionValues=Pick<PostRollOption,
  'expectedMainPct'|'expectedContextualMainPct'|'expectedPersonalPreferenceDelta'|
  'expectedDrinkPrepPct'|'expectedGradingPct'|'expectedShopPct'>;

function priorityTuple(value:OptionValues):number[] {
  const neutralMain=Math.abs(value.expectedMainPct)<=.25;
  const material=(amount:number,tolerance:number)=>Math.abs(amount)<tolerance?0:amount;
  return [
    neutralMain?0:value.expectedMainPct,
    material(value.expectedContextualMainPct,.25),
    // Personal tiers are ordinal and can only break a neutral Main result.
    neutralMain?material(value.expectedPersonalPreferenceDelta,.20):0,
    material(value.expectedDrinkPrepPct,.25),
    material(value.expectedGradingPct,.25),
    material(value.expectedShopPct,.25)
  ];
}

function compareOptions(left:PostRollOption,right:PostRollOption):number {
  const a=[...priorityTuple(left),-left.chancePotentialWorsePct];
  const b=[...priorityTuple(right),-right.chancePotentialWorsePct];
  for(let i=0;i<a.length;i++){
    if(a[i]!==b[i])return a[i]>b[i]?1:-1;
  }
  return 0;
}

function fromCertificateTarget(target:CertificateTargetDecision|undefined):PostRollOption|undefined {
  const result=option('REROLL EFFECT',target&&{
    expectedMainPct:target.expectedImprovementPct-(target.numericalMainEvErrorPct??0),
    chancePotentialWorsePct:Math.min(100,target.chancePotentialWorsePct+(target.numericalProbabilityErrorPct??0)),
    unresolvedOutcomeMassPct:target.unresolvedOutcomeMassPct,
    expectedContextualMainPct:target.expectedContextualMainLowerBoundPct??target.expectedContextualMainPct,
    expectedDrinkPrepPct:target.expectedDrinkPrepLowerBound??target.expectedDrinkPrepPct,
    expectedGradingPct:target.expectedGradingLowerBound??target.expectedGradingPct,
    expectedShopPct:target.expectedShopLowerBound??target.expectedShopPct,
    expectedPersonalPreferenceDelta:target.expectedPersonalPreferenceDelta
  },'Authentication effect is selected from the applicable catalogue.');
  if(result&&target&&target.verdict!=='USE'&&target.verdict!=='CONSIDER'){
    result.recommendable=false;
    result.note='The certificate target verdict does not support rerolling this effect. '+result.note;
  }
  return result;
}

/** Only use this during a real, user-confirmed open Authenticator prompt.
 * This is not a property of historical roll evidence and must never be restored
 * automatically from saved rollLog.
 */
export function analysePostRollOptions(data:AppData,roll:CertificateRollLog):PostRollDecision|undefined {
  const cert=syntheticCertificate(roll);
  const item=data.gear.find(g=>g.id===roll.itemId);
  if(!cert||!item||!item.authenticated||
    item.authentication.effect!==roll.newAuthentication||
    Math.abs(item.authentication.value-roll.newValue)>1e-8)return undefined;

  // Rebuild historical model evidence without the result currently being judged.
  // It must not train the probability model for its own replacement.
  const history=data.rollLog.filter(r=>r.id!==roll.id);
  const trainingData:AppData={
    ...data,
    rollLog:history,
    authModel:rebuildEmpiricalModel(data.authModel,data.rollLog,history)
  };

  const effectTarget=analyseCertificate(trainingData,cert,undefined,roll.itemId).targets.find(t=>t.item.id===roll.itemId);
  const effectReroll=fromCertificateTarget(effectTarget);

  // Dedicated conditional number-reroll calculation: retain the existing effect,
  // sample only values of that same effect, and compare to accepting current gear.
  const number=analyseConditionalNumberReroll(trainingData,roll,cert);
  const numberReroll=option('REROLL NUMBER',number&&{
    expectedMainPct:number.expectedMainLowerBoundPct??number.expectedMainPct,
    chancePotentialWorsePct:(number.chanceAnyWorseUpperBoundPct??number.chanceAnyWorsePct)+number.unresolvedMassPct>100
      ?100:(number.chanceAnyWorseUpperBoundPct??number.chanceAnyWorsePct)+number.unresolvedMassPct,
    unresolvedOutcomeMassPct:number.unresolvedMassPct,
    expectedContextualMainPct:number.expectedContextualMainLowerBoundPct??number.expectedContextualMainPct,
    expectedDrinkPrepPct:number.expectedDrinkPrepLowerBound??number.expectedDrinkPrepPct,
    expectedGradingPct:number.expectedGradingLowerBound??number.expectedGradingPct,
    expectedShopPct:number.expectedShopLowerBound??number.expectedShopPct,
    expectedPersonalPreferenceDelta:0
  },number?.modelNote??'');

  const candidates=[effectReroll,numberReroll].filter(
    (value):value is PostRollOption=>!!value?.recommendable
  );
  const best=candidates.reduce<PostRollOption|undefined>((winner,value)=>
    !winner||compareOptions(value,winner)>0?value:winner,undefined);
  const recommendation:PostRollDecision['recommendation']=best?.action??'ACCEPT';

  return {
    roll,
    costRobux:AUTHENTICATOR_REROLL_COST_ROBUX,
    recommendation,effectReroll,numberReroll,
    reason:recommendation==='ACCEPT'
      ?'Neither paid alternative has a sufficiently supported gain over accepting the current roll. No Robux value has been assumed.'
      :'Computed against accepting the current result. This recommendation considers gear benefit only, not the personal value of 199 Robux.'
  };
}

/** Historical rolls alone do not imply the game still offers paid reroll buttons.
 * Only a fresh, unpersisted UI session token can activate these choices.
 */
export function analyseActivePostRoll(data:AppData,activePostRollId?:string):PostRollDecision|undefined {
  if(!activePostRollId)return undefined;
  const latest=data.rollLog.at(-1);
  return latest?.id===activePostRollId?analysePostRollOptions(data,latest):undefined;
}

