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
  const benefit=values.expectedMainPct>.25 ||
    values.expectedContextualMainPct>=1 ||
    values.expectedDrinkPrepPct>=3 ||
    values.expectedGradingPct>=3 ||
    values.expectedShopPct>=3 ||
    values.expectedPersonalPreferenceDelta>=.20;
  return {
    action,...values,recommendable:resolved&&lowDownside&&benefit,
    note:!resolved
      ?'Incomplete same-certificate evidence prevents a paid reroll recommendation. '+extraNote
      :!lowDownside?'Downside is too high for a paid reroll recommendation. '+extraNote
      :'Compared directly against accepting the existing roll. '+extraNote
  };
}

function optionRank(value:PostRollOption|undefined):number {
  if(!value?.recommendable)return -Infinity;
  const specialist=Math.max(
    value.expectedContextualMainPct,
    value.expectedDrinkPrepPct,
    value.expectedGradingPct,
    value.expectedShopPct,
    value.expectedPersonalPreferenceDelta
  );
  return value.expectedMainPct*10_000+specialist*100-value.chancePotentialWorsePct;
}

function fromCertificateTarget(target:CertificateTargetDecision|undefined):PostRollOption|undefined {
  return option('REROLL EFFECT',target&&{
    expectedMainPct:target.expectedImprovementPct,
    chancePotentialWorsePct:target.chancePotentialWorsePct,
    unresolvedOutcomeMassPct:target.unresolvedOutcomeMassPct,
    expectedContextualMainPct:target.expectedContextualMainPct,
    expectedDrinkPrepPct:target.expectedDrinkPrepPct,
    expectedGradingPct:target.expectedGradingPct,
    expectedShopPct:target.expectedShopPct,
    expectedPersonalPreferenceDelta:target.expectedPersonalPreferenceDelta
  },'Authentication effect is selected from the applicable catalogue.');
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

  const effectTarget=analyseCertificate(trainingData,cert).targets.find(t=>t.item.id===roll.itemId);
  const effectReroll=fromCertificateTarget(effectTarget);

  // Dedicated conditional number-reroll calculation: retain the existing effect,
  // sample only values of that same effect, and compare to accepting current gear.
  const number=analyseConditionalNumberReroll(trainingData,roll,cert);
  const numberReroll=option('REROLL NUMBER',number&&{
    expectedMainPct:number.expectedMainPct,
    chancePotentialWorsePct:number.chanceAnyWorsePct+number.unresolvedMassPct>100
      ?100:number.chanceAnyWorsePct+number.unresolvedMassPct,
    unresolvedOutcomeMassPct:number.unresolvedMassPct,
    expectedContextualMainPct:number.expectedContextualMainPct,
    expectedDrinkPrepPct:number.expectedDrinkPrepPct,
    expectedGradingPct:number.expectedGradingPct,
    expectedShopPct:number.expectedShopPct,
    expectedPersonalPreferenceDelta:0
  },number?.modelNote??'');

  const effectRank=optionRank(effectReroll);
  const numberRank=optionRank(numberReroll);
  let recommendation:PostRollDecision['recommendation']='ACCEPT';
  if(effectRank>0||numberRank>0)recommendation=numberRank>effectRank?'REROLL NUMBER':'REROLL EFFECT';

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
