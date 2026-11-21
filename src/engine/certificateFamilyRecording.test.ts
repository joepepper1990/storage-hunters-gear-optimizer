import {expect,it} from 'vitest';
import {authModelTypeForOwnedCertificate} from './certificateRolls';
it('keeps Carnival records in their actual certificate family',()=>{expect(authModelTypeForOwnedCertificate({id:'c',type:'Certificate of Clownticity',quantity:1})).toBe('Certificate of Clownticity');});
