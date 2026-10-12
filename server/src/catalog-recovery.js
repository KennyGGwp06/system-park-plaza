const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const identity = item => `${item.area}:${normalized(item.name)}`;

// Build a new state without changing the input. Never restore sales, stock,
// recipe-version database IDs, users, payments, stays or historical movements.
export function planCatalogRecovery(current, source) {
  if (source.originalCount !== 91 || source.menuItems?.length !== 91) throw Error('El catálogo de origen no contiene los 91 productos esperados.');
  const state = structuredClone(current);
  state.menuItems ||= []; state.inventory ||= [];
  const report = { addedMenu: [], addedIngredients: [], archivedDemo: [], preservedMenu: [], conflicts: [] };
  const ids = new Set(); const names = new Set();
  for (const item of source.menuItems) {
    if(ids.has(Number(item.id)) || names.has(identity(item))) throw Error('El catálogo de origen contiene duplicados.');
    ids.add(Number(item.id)); names.add(identity(item));
    const existing = state.menuItems.find(x=>Number(x.id)===Number(item.id));
    if (existing) {
      if(identity(existing)!==identity(item)) report.conflicts.push(`ID ${item.id}: ${existing.name} / ${item.name}`);
      else report.preservedMenu.push(item.id);
      continue;
    }
    // The original catalog intentionally replaced the archived demo Pisco Sour
    // with a different product ID; retain both IDs for historical orders.
    const duplicate=state.menuItems.find(x=>identity(x)===identity(item) && !(source.archivedDemo||[]).some(d=>Number(d.id)===Number(x.id)&&identity(d)===identity(x)));
    if(duplicate) { report.conflicts.push(`Nombre duplicado con otro ID: ${item.name} (${duplicate.id}/${item.id})`); continue; }
    state.menuItems.push({...structuredClone(item), salesEnabled:false});
    report.addedMenu.push(item.id);
  }
  const added=new Set(report.addedMenu);
  const ingredients=new Set(state.menuItems.filter(x=>added.has(x.id)).flatMap(x=>(x.recipe||[]).map(r=>Number(r.inventoryId))));
  for(const id of ingredients){
    const original=source.inventory.find(x=>Number(x.id)===id);
    if(!original){report.conflicts.push(`Falta la definición del ingrediente ${id}`);continue;}
    const existing=state.inventory.find(x=>Number(x.id)===id);
    if(existing){
      if(identity(existing)!==identity(original) || normalized(existing.baseUnit||existing.unit)!==normalized(original.baseUnit||original.unit)) report.conflicts.push(`Ingrediente ${id}: nombre, área o unidad no coinciden (${existing.name}/${original.name})`);
    }else{
      const duplicate=state.inventory.find(x=>identity(x)===identity(original));
      if(duplicate){report.conflicts.push(`Ingrediente duplicado con otro ID: ${original.name}`);continue;}
      state.inventory.push({...structuredClone(original),stock:0,reserved:0,openedStock:0});report.addedIngredients.push(id);
    }
  }
  for(const original of source.archivedDemo||[]){
    const item=state.menuItems.find(x=>Number(x.id)===Number(original.id));
    if(item&&identity(item)===identity(original)&&(item.active!==false||item.salesEnabled===true)){
      item.active=false;item.salesEnabled=false;report.archivedDemo.push(item.id);
    }
  }
  report.activeAfter=state.menuItems.filter(x=>x.active!==false).length;
  report.changed=Boolean(report.addedMenu.length||report.addedIngredients.length||report.archivedDemo.length);
  return {state,report};
}
