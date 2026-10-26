import type { AppData, CertificateRollLog, OwnedCertificate } from '../types';
import { analyseCertificate, type CertificateTargetDecision } from './certificateDecision';
import { MODEL_ASSUMPTIONS } from './modelAssumptions';

export const AUTHENTICATOR_REROLL_COST_ROBUX=MODEL_ASSUMPTIONS.authenticator.paidRerollRobux;

export interface PostRollOption {
  action:'REROLL EFFECT'|'REROLL NUMBER';
  target:CertificateTargetDecision;
  recommendable:boolean;
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

function targetFor(data:AppData,roll:CertificateRollLog,cert:OwnedCertificate):CertificateTargetDecision|undefined {
  return analyseCertificate(data,cert).targets.find(target=>target.item.id===roll.itemId);
}

function option(action:PostRollOption['action'],target:CertificateTargetDecision|undefined):PostRollOption|undefined {
  if(!target)return undefined;
  const recommendable=
    target.unresolvedOutcomeMassPct<1e-9 &&
    target.chancePotentialWorsePct<45 &&
    (target.verdict==='USE'||target.verdict==='CONSIDER') &&
    (
      target.expectedImprovementPct>.25 ||
      target.expectedContextualMainPct>=1 ||
      target.expectedDrinkPrepPct>=3 ||
      target.expectedGradingPct>=3 ||
      target.expectedShopPct>=3 ||
      target.expectedPersonalPreferenceDelta>=.20
    );
  return {
    action,target,recommendable,
    note:target.unresolvedOutcomeMassPct>0
      ?'Unresolved outcome/range evidence prevents a paid reroll recommendation.'
      :target.chancePotentialWorsePct>=45
        ?'Modelled downside is too high for a paid reroll recommendation.'
        :'Compared against accepting the current recorded result.'
  };
}

function optionRank(value:PostRollOption|undefined):number {
  if(!value?.recommendable)return -Infinity;
  const verdict=value.target.verdict==='USE'?2:value.target.verdict==='CONSIDER'?1:0;
  const specialist=Math.max(
    value.target.expectedContextualMainPct,
    value.target.expectedDrinkPrepPct,
    value.target.expectedGradingPct,
    value.target.expectedShopPct,
    value.target.expectedPersonalPreferenceDelta
  );
  return verdict*1_000_000+value.target.expectedImprovementPct*10_000+specialist*100-value.target.chancePotentialWorsePct;
}

/**
 * Models the two temporary 199-Robux buttons shown immediately after authentication.
 * The Robux cost is surfaced but deliberately not converted into gear utility.
 */
export function analysePostRollOptions(data:AppData,roll:CertificateRollLog):PostRollDecision|undefined {
  const cert=syntheticCertificate(roll);
  if(!cert||!data.gear.some(item=>item.id===roll.itemId))return undefined;

  const effectTarget=targetFor(data,roll,cert);

  const numberData:AppData={
    ...data,
    authModel:data.authModel.map(row=>{
      if(row.certificateInventoryType!==cert.type)return row;
      return {...row,enabled:row.outcome===roll.newAuthentication};
    })
  };
  const numberTarget=targetFor(numberData,roll,cert);

  const effectReroll=option('REROLL EFFECT',effectTarget);
  const numberReroll=option('REROLL NUMBER',numberTarget);
  const effectRank=optionRank(effectReroll);
  const numberRank=optionRank(numberReroll);

  let recommendation:PostRollDecision['recommendation']='ACCEPT';
  if(effectRank>0||numberRank>0)recommendation=numberRank>effectRank?'REROLL NUMBER':'REROLL EFFECT';

  return {
    roll,
    costRobux:AUTHENTICATOR_REROLL_COST_ROBUX,
    recommendation,
    effectReroll,
    numberReroll,
    reason:recommendation==='ACCEPT'
      ?'No fully-resolved paid reroll option currently clears the modelled benefit/downside threshold. Accept is the conservative gear-only choice.'
      :'This ranks gear utility only. Both paid options cost the same, but the model does not assign a cash/Robux value to that cost.'
  };
}
