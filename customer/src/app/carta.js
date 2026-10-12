import { V, A, BACK, go, esc, money } from "./core.js";
import { catalog } from "./common.js";

BACK.carta = "servicios";
V.carta = () => {
  const menu = catalog().fullMenu || catalog().restaurantMenu || [];
  const group = (area, title) => {
    const items = menu.filter(item => item.area === area);
    return `<div class="card stack"><h2>${title} · ${items.length}</h2><div class="menu">${items.map(item => `<article class="dish"><div class="im">${item.photoPending ? `<span class="micro">Foto pendiente</span>` : `<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`}</div><div class="tx"><b>${esc(item.name)}</b><span class="micro">${esc(item.category)}</span>${item.description ? `<p class="micro">${esc(item.description)}</p>` : ""}<div class="q"><b>${money(item.price)}</b><span class="pill ${item.available ? "ok" : "gray"}">${item.available ? "Disponible" : "No disponible"}</span></div></div></article>`).join("")}</div></div>`;
  };
  return `<section class="view"><div class="layout" style="max-width:1100px;margin:auto"><header><span class="eyebrow">Restaurante y Bar</span><h1>Nuestra carta</h1><p class="lead">Todos nuestros platos y bebidas. Los pedidos se hacen desde tu reserva; la disponibilidad cambia durante el día.</p></header>${group("RESTAURANTE", "Restaurante")}${group("BARTENDER", "Bar")}<button class="btn" type="button" data-a="carta-volver">Ver experiencias</button></div></section>`;
};
Object.assign(A, {
  "carta": () => go("carta"),
  "carta-volver": () => go("servicios")
});
