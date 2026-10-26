import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CertificateScreen, GearScreen, SettingsScreen, OptimiseScreen } from './App';
import { makeInitialData } from './defaults';
import { optimise } from './engine/optimizer';
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

  it('Optimise displays the robust Main winner rather than the central-only winner',()=>{
    const data=makeInitialData();
    const h={...data.gear.find(g=>g.slot==='Head')!,id:'h',authenticated:false};
    const w={...data.gear.find(g=>g.slot==='Wrist')!,id:'w',authenticated:false};
    const base={...data.gear.find(g=>g.slot==='Back')!,authenticated:false};
    const staticBack={...base,id:'static',baseName:'Robust static winner',stats:{...base.stats,luck:80}};
    const dynamicBack={...base,id:'dynamic',baseName:'Central-only winner',stats:{...base.stats,luck:10},authenticated:true,authentication:{kind:'Premium' as const,effect:'Droughtbreaker',value:100}};
    data.gear=[h,w,staticBack,dynamicBack];
    const html=renderToStaticMarkup(<OptimiseScreen data={data} combinations={optimise(data.gear,data.settings,1)} limit={1} setLimit={()=>{}}/>);
    // First loadout is Main Auction. The chosen Back must match the optimiser.
    const firstLoadout=html.slice(html.indexOf('Your loadouts'),html.indexOf('SPECIALIST'));
    expect(firstLoadout).toContain('Robust static winner');
    expect(firstLoadout).not.toContain('Central-only winner');
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

