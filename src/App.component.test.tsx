import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CertificateScreen, GearScreen, SettingsScreen } from './App';
import { makeInitialData } from './defaults';
import { scoreStandalone } from './engine/scoring';
import type { ItemAnalysis } from './types';

describe('component safety states',()=>{
  it('hides stale destructive gear controls while recalculation is not current',()=>{
    const data=makeInitialData();
    const item=data.gear[0];
    const stale:ItemAnalysis={
      item,
      verdict:'SAFE TO DISCARD',
      reason:'stale proof',
      standalone:scoreStandalone(item,data.settings),
      currentlyEquipped:false,
      loadoutMemberships:[]
    };
    const html=renderToStaticMarkup(
      <GearScreen gear={[item]} analyses={[stale]} settings={data.settings} analysisCurrent={false}
        onAdd={()=>{}} onScan={()=>{}} onEdit={()=>{}} onClone={()=>{}} onDelete={()=>{}} onFav={()=>{}} onBulkDiscard={()=>{}}/>
    );
    expect(html).toContain('Recalculating gear verdicts');
    expect(html).not.toContain('proven SAFE TO DISCARD');
  });

  it('starts the certificate screen in a stale-safe state with previous advice hidden',()=>{
    const data=makeInitialData();
    const html=renderToStaticMarkup(<CertificateScreen data={data} setData={()=>{}}/>);
    expect(html).toContain('Recalculating certificate decisions');
    expect(html).not.toContain('BEST CURRENT TARGET');
  });

  it('surfaces catalogue conflicts in Settings',()=>{
    const data=makeInitialData();
    const row=data.authModel.find(m=>m.certificateInventoryType==='Wooden Certificate of Authenticity'&&m.outcome==='Bid Recovery')!;
    data.authModel.push({...row,id:'duplicate-ui'});
    const html=renderToStaticMarkup(<SettingsScreen data={data} setData={()=>{}} showToast={()=>{}}/>);
    expect(html).toContain('Catalogue conflicts');
    expect(html).toContain('Duplicate live catalogue row');
  });
});
