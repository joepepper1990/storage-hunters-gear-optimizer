import type { AuthModelEntry, OwnedCertificate, Slot } from '../types';
import { canonicalEffect, catalogueOutcome, currentPool } from '../authentication';

export function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType'] {
  if(type==='Premium Certificate of Authenticity')return 'Premium Certificate of Authenticity';
  if(type==='Limited Certificate of Authenticity')return 'Limited Certificate of Authenticity';
  return 'Normal Certificate of Authenticity';
}

/**
 * Range/evidence rows for the fixed current outcome pool of a certificate tier on a slot,
 * one per canonical effect. Pool membership comes only from the canonical catalogue; the
 * editable rows supply ranges, confidence and observations. A row's `enabled` flag and
 * custom rows never add or remove an outcome. A missing row falls back to the catalogue.
 */
export function catalogueRowsFor(
  model:AuthModelEntry[],
  certificateType:OwnedCertificate['type'],
  slot:Slot
):AuthModelEntry[] {
  const modelType=authModelCertificateType(certificateType);
  return currentPool(certificateType,slot).map(effect=>{
    const rows=model.filter(row=>
      row.certificateType===modelType &&
      row.certificateInventoryType===certificateType &&
      canonicalEffect(row.outcome)===effect &&
      (row.slot==='Any'||row.slot===slot)
    );
    const row=rows.find(r=>r.slot===slot)??rows[0];
    if(row)return {...row,outcome:effect};
    const fallback=catalogueOutcome(certificateType,slot,effect)!;
    return {
      id:'catalogue:'+certificateType+'|'+slot+'|'+effect,certificateInventoryType:certificateType,certificateType:modelType,
      slot:fallback.slot,outcome:effect,category:fallback.category,assumedLikelihoodClass:'MEDIUM',
      observedSampleCount:0,observedValues:[],min:fallback.min,typical:fallback.typical,max:fallback.max,
      confidence:fallback.confidence,empiricalConfidence:'Unknown',enabled:true
    };
  });
}

export function authenticationCatalogueIssues(model:AuthModelEntry[]):string[] {
  const issues:string[]=[];
  const groups=new Map<string,AuthModelEntry[]>();
  for(const row of model){
    if(!row.certificateInventoryType)continue;
    const key=[row.certificateInventoryType,row.slot,row.outcome.trim().toLowerCase()].join('|');
    const rows=groups.get(key)??[];
    rows.push(row);
    groups.set(key,rows);
    if(row.min!==undefined&&row.max!==undefined&&row.min>row.max){
      issues.push(`${row.certificateInventoryType} · ${row.slot} · ${row.outcome}: min exceeds max.`);
    }
    if(row.typical!==undefined&&row.min!==undefined&&row.typical<row.min){
      issues.push(`${row.certificateInventoryType} · ${row.slot} · ${row.outcome}: typical is below min.`);
    }
    if(row.typical!==undefined&&row.max!==undefined&&row.typical>row.max){
      issues.push(`${row.certificateInventoryType} · ${row.slot} · ${row.outcome}: typical is above max.`);
    }
  }
  for(const rows of groups.values()){
    if(rows.length>1){
      const row=rows[0];
      issues.push(`Duplicate live catalogue row: ${row.certificateInventoryType} · ${row.slot} · ${row.outcome}. Only the first row is used.`);
    }
  }
  return [...new Set(issues)];
}

export function empiricalConfidenceForCount(count:number):AuthModelEntry['confidence'] {
  return count>=10?'Empirical':count>=4?'Medium':count>=1?'Low':'Unknown';
}
