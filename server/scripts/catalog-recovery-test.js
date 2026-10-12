import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planCatalogRecovery} from '../src/catalog-recovery.js';
const source=JSON.parse(await readFile(new URL('../data/park-plaza-original-catalog.json',import.meta.url),'utf8'));
const base=()=>({menuItems:source.archivedDemo.map(x=>({...x,active:true,salesEnabled:true,recipe:[]})),inventory:[],orders:[{id:45,total:98}],payments:[{id:22,amount:98}],rooms:[{id:1,status:'OCUPADA'}]});
test('recupera 29 platos y 62 bebidas; conserva los cinco registros archivados',()=>{
 const {state,report}=planCatalogRecovery(base(),source);
 assert.deepEqual(report.conflicts,[]);assert.equal(report.activeAfter,91);assert.equal(state.menuItems.length,96);
 assert.equal(state.menuItems.filter(x=>x.active!==false&&x.area==='RESTAURANTE').length,29);
 assert.equal(state.menuItems.filter(x=>x.active!==false&&x.area==='BARTENDER').length,62);
});
test('no publica productos, no carga stock del respaldo ni altera pedidos, cobros o habitaciones',()=>{
 const before=base(),copy=structuredClone(before);const {state}=planCatalogRecovery(before,source);
 assert.deepEqual(before,copy);for(const key of ['orders','payments','rooms'])assert.deepEqual(state[key],before[key]);
 assert.ok(state.menuItems.every(x=>x.salesEnabled===false));assert.ok(state.inventory.every(x=>x.stock===0&&x.reserved===0));
 assert.ok(state.menuItems.every(x=>!Object.hasOwn(x,'recipeVersionId')));
});
test('conserva precios y gramajes recuperados sin inventar recetas faltantes',()=>{
 const {state}=planCatalogRecovery(base(),source);
 for(const original of source.menuItems){const item=state.menuItems.find(x=>x.id===original.id);assert.equal(item.price,original.price);assert.deepEqual(item.recipe,original.recipe);}
 assert.equal(state.menuItems.filter(x=>x.active!==false&&x.recipe?.length).length,70);
});
test('repetir la recuperación no duplica ni cambia productos',()=>{
 const first=planCatalogRecovery(base(),source);const second=planCatalogRecovery(first.state,source);
 assert.deepEqual(second.state,first.state);assert.equal(second.report.changed,false);
});
test('conserva cambios recientes de precio, pausa, archivo y stock',()=>{
 const state=planCatalogRecovery(base(),source).state;state.menuItems.find(x=>x.id===6).price=73;state.menuItems.find(x=>x.id===6).salesEnabled=true;state.menuItems.find(x=>x.id===7).active=false;state.inventory[0].stock=123;state.inventory[0].reserved=8;
 assert.deepEqual(planCatalogRecovery(state,source).state,state);
});
test('detecta un ID ocupado por otro plato',()=>{
 const state=base();state.menuItems.push({id:6,area:'RESTAURANTE',name:'Nuevo plato real',price:55});
 const result=planCatalogRecovery(state,source);assert.ok(result.report.conflicts.some(x=>x.includes('ID 6')));
 assert.equal(result.state.menuItems.find(x=>x.id===6).name,'Nuevo plato real');
});
test('detecta conflicto de ingrediente o unidad antes de aplicar',()=>{
 const state=base();state.inventory.push({...source.inventory[0],unit:'unidad',baseUnit:'unidad',name:'Otro insumo'});
 assert.ok(planCatalogRecovery(state,source).report.conflicts.some(x=>x.includes('Ingrediente')));
});
test('detecta el mismo plato creado con otro ID para impedir duplicación',()=>{
 const state=base();state.menuItems.push({...source.menuItems[0],id:999});
 assert.ok(planCatalogRecovery(state,source).report.conflicts.some(x=>x.includes('Nombre duplicado')));
});
