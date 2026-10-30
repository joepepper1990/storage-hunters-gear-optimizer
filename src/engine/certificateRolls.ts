import type { AppData, AuthModelEntry, CertificateRollLog, GearItem, GearStats, OwnedCertificate } from '../types';
import { effectiveItemStats } from './scoring';
import { empiricalConfidenceForCount } from './authModel';
import { canonicalEffect } from '../authentication';

export function authModelTypeForOwnedCertificate(cert:OwnedCertificate):AuthModelEntry['certificateType'] {
  if(cert.type==='Premium Certificate of Authenticity') return 'Premium Certificate of Authenticity';
  if(cert.type==='Limited Certificate of Authenticity') return 'Limited Certificate of Authenticity';
  return 'Normal Certificate of Authenticity';
}

function matchingModelEntry(model:AuthModelEntry[],roll:CertificateRollLog):AuthModelEntry|undefined {
  const candidates=model.filter(m=>
    m.certificateType===roll.certificateType &&
    (!roll.certificateInventoryType||m.certificateInventoryType===roll.certificateInventoryType) &&
    canonicalEffect(m.outcome)===canonicalEffect(roll.newAuthentication) &&
    (m.slot==='Any'||m.slot===roll.slot)
  );
  return candidates.find(m=>m.slot===roll.slot)??candidates.find(m=>m.slot==='Any');
}

export function rollModelWarnings(model:AuthModelEntry[],roll:CertificateRollLog):string[] {
  const target=matchingModelEntry(model,roll);
  if(!target)return [`No catalogue row currently matches ${roll.newAuthentication} for this certificate tier/slot.`];
  const warnings:string[]=[];
  if(target.min!==undefined&&roll.newValue<target.min){
    warnings.push(`Observed ${roll.newValue}% is below the configured minimum ${target.min}% for ${target.outcome}.`);
  }
  if(target.max!==undefined&&roll.newValue>target.max){
    warnings.push(`Observed ${roll.newValue}% is above the configured maximum ${target.max}% for ${target.outcome}.`);
  }
  return warnings;
}

export function recordEmpiricalRoll(model:AuthModelEntry[],roll:CertificateRollLog):AuthModelEntry[] {
  const target=matchingModelEntry(model,roll);
  if(!target)return model;
  return model.map(m=>{
    if(m.id!==target.id)return m;
    const values=[...m.observedValues,roll.newValue].filter(Number.isFinite);
    return {
      ...m,
      observedValues:values,
      observedSampleCount:values.length,
      empiricalConfidence:empiricalConfidenceForCount(values.length)
      // Mechanic/range confidence deliberately remains unchanged.
    };
  });
}

/**
 * Remove observations already represented by rollLog, leaving only imported/manual
 * legacy evidence. This lets a historical roll be corrected/deleted without either
 * duplicating samples or throwing away model-only evidence. Each roll is removed from the
 * same catalogue row recordEmpiricalRoll adds it to, so a rebuild never drifts.
 */
function stripRollDerivedObservations(model:AuthModelEntry[],rollLog:CertificateRollLog[]):AuthModelEntry[] {
  const remaining=new Map(model.map(entry=>[entry.id,[...(entry.observedValues??[])]]));
  for(const roll of rollLog){
    const target=matchingModelEntry(model,roll);
    const values=target&&remaining.get(target.id);
    if(!values)continue;
    const index=values.findIndex(value=>Math.abs(value-roll.newValue)<1e-9);
    if(index>=0)values.splice(index,1);
  }
  return model.map(entry=>{
    const values=remaining.get(entry.id)!;
    return {...entry,observedValues:values,observedSampleCount:values.length,empiricalConfidence:empiricalConfidenceForCount(values.length)};
  });
}

export function rebuildEmpiricalModel(
  model:AuthModelEntry[],
  oldRollLog:CertificateRollLog[],
  nextRollLog:CertificateRollLog[]
):AuthModelEntry[] {
  let rebuilt=stripRollDerivedObservations(model,oldRollLog);
  for(const roll of nextRollLog)rebuilt=recordEmpiricalRoll(rebuilt,roll);
  return rebuilt;
}

export function withObservedAuthenticationStats(item:GearItem, displayed:GearStats):GearItem {
  const baseline={...item,authentication:{...item.authentication,statDeltas:undefined}};
  const expected=effectiveItemStats(baseline);
  const statDeltas:Partial<GearStats>={};
  for(const key of Object.keys(expected) as Array<keyof GearStats>){
    const delta=(displayed[key]??0)-expected[key];
    if(Math.abs(delta)>1e-9)statDeltas[key]=delta;
  }
  return {
    ...item,
    authentication:{
      ...item.authentication,
      statDeltas:Object.keys(statDeltas).length?statDeltas:undefined
    }
  };
}

export function applyRecordedCertificateRoll(
  data:AppData,
  certificateId:string,
  roll:CertificateRollLog,
  updated:GearItem
):AppData {
  const certificate=data.ownedCertificates.find(c=>c.id===certificateId);
  if(!certificate)throw new Error('The selected owned certificate no longer exists.');
  if(certificate.quantity<1)throw new Error('The selected certificate has already been used.');

  const baseRoll:CertificateRollLog={
    ...roll,
    certificateId:certificate.id,
    certificateGradeStars:certificate.gradeStars,
    certificateMutation:certificate.mutation,
    certificateInventoryType:certificate.type,
    certificateType:authModelTypeForOwnedCertificate(certificate),
    observedStatDeltas:updated.authentication.statDeltas
  };
  const normalizedRoll={...baseRoll,modelWarnings:rollModelWarnings(data.authModel,baseRoll)};
  const nextRollLog=[...data.rollLog,normalizedRoll];

  return {
    ...data,
    gear:data.gear.map(g=>g.id===updated.id?updated:g),
    authModel:rebuildEmpiricalModel(data.authModel,data.rollLog,nextRollLog),
    rollLog:nextRollLog,
    ownedCertificates:data.ownedCertificates.map(c=>c.id===certificate.id?{...c,quantity:c.quantity-1}:c)
  };
}

export function correctRecordedCertificateRoll(
  data:AppData,
  rollId:string,
  patch:Pick<CertificateRollLog,'newAuthentication'|'newValue'>
):AppData {
  const existing=data.rollLog.find(r=>r.id===rollId);
  if(!existing)throw new Error('Roll history entry no longer exists.');
  if(!patch.newAuthentication.trim())throw new Error('Authentication effect is required.');
  if(!Number.isFinite(patch.newValue))throw new Error('Authentication value must be finite.');

  const correctedBase={...existing,newAuthentication:patch.newAuthentication.trim(),newValue:patch.newValue};
  const corrected={...correctedBase,modelWarnings:rollModelWarnings(data.authModel,correctedBase)};
  const nextRollLog=data.rollLog.map(r=>r.id===rollId?corrected:r);
  return {
    ...data,
    authModel:rebuildEmpiricalModel(data.authModel,data.rollLog,nextRollLog),
    rollLog:nextRollLog
  };
}

export function deleteRecordedCertificateRoll(data:AppData,rollId:string):AppData {
  if(!data.rollLog.some(r=>r.id===rollId))return data;
  const nextRollLog=data.rollLog.filter(r=>r.id!==rollId);
  return {
    ...data,
    authModel:rebuildEmpiricalModel(data.authModel,data.rollLog,nextRollLog),
    rollLog:nextRollLog
  };
}


/** Observed stat deltas belong to one authentication identity, never its replacement. */
export function editAuthentication(current:GearItem['authentication'],patch:Partial<GearItem['authentication']>):GearItem['authentication'] {
  const next={...current,...patch};
  if(next.kind!==current.kind||next.effect!==current.effect||next.value!==current.value)delete next.statDeltas;
  return next;
}
