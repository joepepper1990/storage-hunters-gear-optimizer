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
  /** Cautious-state chance the best re-optimised loadout improves over keeping this roll. */
  improveChancePct:number;
  /** Cautious-state chance it gets worse, including unresolved outcomes that could. */
  worseChancePct:number;
  unresolvedOutcomeMassPct:number;
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

const POLICY=MODEL_ASSUMPTIONS.certificate.use;

function fromCertificateTarget(target:CertificateTargetDecision|undefined):PostRollOption|undefined {
  if(!target)return undefined;
  // The same verdict as a fresh certificate on this item: cautious-safe and a real chance to help.
  return {
    action:'REROLL EFFECT',
    recommendable:target.verdict==='USE',
    improveChancePct:target.improveChanceLowerPct.cautious,
    worseChancePct:target.worseChanceUpperPct,
    unresolvedOutcomeMassPct:target.unresolvedOutcomeMassPct,
    note:target.verdict==='USE'?'Compared directly against keeping the current roll.':'The effect reroll is not safe or likely enough to help.'
  };
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

  // Dedicated conditional number-reroll calculation: keep the effect, redraw only its
  // strength, and compare with keeping the current gear.
  const number=analyseConditionalNumberReroll(trainingData,roll,cert);
  const numberReroll:PostRollOption|undefined=number&&{
    action:'REROLL NUMBER',
    recommendable:number.unresolvedMassPct<1e-9&&number.worseChanceUpperPct<=POLICY.maxCautiousWorsePct&&number.improveChancePct>=POLICY.minCautiousImprovePct,
    improveChancePct:number.improveChancePct,
    worseChancePct:Math.min(100,number.worseChanceUpperPct+number.unresolvedMassPct),
    unresolvedOutcomeMassPct:number.unresolvedMassPct,
    note:number.modelNote
  };

  const best=[effectReroll,numberReroll]
    .filter((value):value is PostRollOption=>!!value?.recommendable)
    .reduce<PostRollOption|undefined>((winner,value)=>
      !winner||value.improveChancePct-value.worseChancePct>winner.improveChancePct-winner.worseChancePct?value:winner,undefined);
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

