/* Arranque de la app del cliente (portada, reservas de los 5 servicios, estadía).
   Reemplaza el contenedor #root por la estructura de la página y carga los módulos. */
import "./app.css";
import "./v5.css";
import "./portada.css";

export async function bootApp() {
  const root = document.getElementById("root");
  const shell = document.createElement("div");
  shell.id = "pp-nuevo";
  shell.innerHTML = `<header class="top" id="top"></header><div id="app"></div>
    <div class="bar" id="bar"><div class="info"><small id="barSmall"></small><b id="barBig"></b></div><button class="btn" id="barBtn" type="button"></button></div><div id="layer"></div>`;
  if (root) root.replaceWith(shell); else document.body.appendChild(shell);
  document.title = "Park Plaza · Pucallpa";
  const theme = document.querySelector('meta[name="theme-color"]'); if (theme) theme.setAttribute("content", "#0B1020");
  await import("./main.js");
}
