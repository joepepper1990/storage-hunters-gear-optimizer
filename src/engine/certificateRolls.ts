import type { AppData, AuthModelEntry, CertificateRollLog, GearItem, OwnedCertificate } from '../types';

export function authModelTypeForOwnedCertificate(cert:OwnedCertificate):AuthModelEntry['certificateType'] {
  if(cert.type==='Premium Certificate of Authenticity') return 'Premium Certificate of Authenticity';
  if(cert.type==='Limited Certificate of Authenticity') return 'Limited Certificate of Authenticity';
  return 'Normal Certificate of Authenticity';
}

export function recordEmpiricalRoll(model:AuthModelEntry[],roll:CertificateRollLog):AuthModelEntry[] {
  const candidates=model.filter(m=>m.certificateType===roll.certificateType&&m.outcome===roll.newAuthentication&&(m.slot==='Any'||m.slot===roll.slot));
  const target=candidates.find(m=>m.slot===roll.slot)??candidates[0];
  if(!target)return model;
  return model.map(m=>{
    if(m.id!==target.id)return m;
    const values=[...m.observedValues,roll.newValue].filter(Number.isFinite);
    if(!values.length)return m;
    const sorted=[...values].sort((a,b)=>a-b);
    const mid=sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
    return {
      ...m,
      observedValues:values,
      observedSampleCount:values.length,
      min:Math.min(...values),
      typical:mid,
      max:Math.max(...values),
      confidence:values.length>=10?'Empirical':values.length>=4?'Medium':'Low'
    };
  });
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

  const normalizedRoll:CertificateRollLog={
    ...roll,
    certificateId:certificate.id,
    certificateGradeStars:certificate.gradeStars,
    certificateInventoryType:certificate.type,
    certificateType:authModelTypeForOwnedCertificate(certificate)
  };

  return {
    ...data,
    gear:data.gear.map(g=>g.id===updated.id?updated:g),
    authModel:recordEmpiricalRoll(data.authModel,normalizedRoll),
    rollLog:[...data.rollLog,normalizedRoll],
    ownedCertificates:data.ownedCertificates.map(c=>c.id===certificate.id?{...c,quantity:c.quantity-1}:c)
  };
}
