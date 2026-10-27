import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CertificateScreen,GearScreen} from './App';
import {makeEmptyData} from './defaults';

it('empty certificate inventory exposes certificate creation',()=>{
 const html=renderToStaticMarkup(<CertificateScreen data={makeEmptyData()} setData={()=>{}}/>);
 expect(html).toContain('Add certificate');
 expect(html).not.toContain('Expected-value decisions');
});

it('gear inventory contains entry actions without algorithm explanations',()=>{
 const data=makeEmptyData();
 const html=renderToStaticMarkup(<GearScreen gear={[]} analyses={[]} settings={data.settings} analysisCurrent={true} onAdd={()=>{}} onScan={()=>{}} onEdit={()=>{}} onClone={()=>{}} onDelete={()=>{}} onFav={()=>{}} onBulkDiscard={()=>{}}/>);
 expect(html).toContain('Add');expect(html).toContain('Scan');
 expect(html).not.toContain('Standalone');
 expect(html).not.toContain('score is not a loadout verdict');
});
