import type { AuthModelEntry, OwnedCertificate, Slot } from '../types';

export function authModelCertificateType(type:OwnedCertificate['type']):AuthModelEntry['certificateType'] {
  if(type==='Premium Certificate of Authenticity')return 'Premium Certificate of Authenticity';
  if(type==='Limited Certificate of Authenticity')return 'Limited Certificate of Authenticity';
  return 'Normal Certificate of Authenticity';
}

export function catalogueRowsFor(
  model:AuthModelEntry[],
  certificateType:OwnedCertificate['type'],
  slot:Slot
):AuthModelEntry[] {
  const modelType=authModelCertificateType(certificateType);
  const scoped=model.filter(row=>
    row.enabled &&
    row.certificateType===modelType &&
    row.certificateInventoryType===certificateType &&
    (row.slot==='Any'||row.slot===slot)
  );

  // One effect can have an Any row or a slot-specific override. Slot-specific wins.
  // Duplicate rows at the same specificity are ignored after the first deterministic row.
  const grouped=new Map<string,AuthModelEntry>();
  for(const row of scoped){
    const existing=grouped.get(row.outcome);
    if(!existing || (existing.slot==='Any'&&row.slot===slot))grouped.set(row.outcome,row);
  }
  return [...grouped.values()];
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
