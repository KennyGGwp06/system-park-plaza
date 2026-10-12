// Catálogo y precios › Textos e imágenes. La portada de cada servicio en la app del cliente: lugar, título, subtítulo,
// descripción y foto. Las fotos de habitaciones y de la carta están en sus propias vistas.
// Rutas: GET/PUT /api/admin/commercial-settings (experienceMedia), POST/DELETE /api/admin/experience-media/:code/image.
import { useEffect, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Field, PageHead, Seg, useBusy, useToast } from "./kit";
import { imageSrc, uploadImage } from "./RoomsCatalogPage";

const LABEL = { HOSPEDAJE: "Hospedaje", PISCINA: "Piscina", MIRADOR: "Mirador", TERRAZA: "Terraza", EVENTOS: "Eventos", BAR: "Bar", RESTAURANTE: "Restaurante" };

export function SiteContentPage({ navigate }) {
  const settings = useFetch("/admin/commercial-settings", { initialData: null, realtime: false });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [media, setMedia] = useState(null);
  const [code, setCode] = useState("HOSPEDAJE");
  useEffect(() => { if (settings.data?.experienceMedia) setMedia(structuredClone(settings.data.experienceMedia)); }, [settings.data]);
  if (!media) return <LoadingSpinner label="Cargando contenido…" />;
  const current = media.find((row) => row.code === code) || media[0];
  const dirty = JSON.stringify(media) !== JSON.stringify(settings.data.experienceMedia);
  const set = (patch) => setMedia(media.map((row) => (row.code === current.code ? { ...row, ...patch } : row)));
  const save = () => run(async () => { await api("/admin/commercial-settings", { method: "PUT", body: { experienceMedia: media } }); show("Textos guardados: la app del cliente ya los muestra."); settings.reload(); });
  const photo = (file) => run(async () => { await uploadImage(`/admin/experience-media/${current.code}/image`, file); show(`Portada de ${LABEL[current.code] || current.code} guardada.`); settings.reload(); });
  const removePhoto = () => run(async () => { await api(`/admin/experience-media/${current.code}/image`, { method: "DELETE" }); show("Imagen quitada."); settings.reload(); });
  return <>
    <PageHead title="Textos e imágenes" tools={<button className="rx-btn rx-btn--primary" type="button" disabled={!dirty || busy} onClick={save}>Guardar textos</button>}>La portada de cada servicio en la app del cliente. Las fotos de habitaciones y de platos y bebidas se cambian en Habitaciones y en Carta del cliente.</PageHead>
    <div style={{ marginBottom: 12 }}><Seg value={current.code} onChange={setCode} options={media.map((row) => [row.code, LABEL[row.code] || row.code])} /></div>
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    <div className="ow-split">
      <Card title={`Portada de ${LABEL[current.code] || current.code}`}>
        <div className="ow-form">
          <Field label="Lugar (línea pequeña)" full><input className="rx-input" value={current.place || ""} onChange={(event) => set({ place: event.target.value })} /></Field>
          <Field label="Título"><input className="rx-input" value={current.title || ""} onChange={(event) => set({ title: event.target.value })} /></Field>
          <Field label="Segunda línea del título"><input className="rx-input" value={current.title2 || ""} onChange={(event) => set({ title2: event.target.value })} /></Field>
          <Field label="Descripción" full><textarea className="rx-input" style={{ height: 90, paddingTop: 8 }} value={current.description || ""} onChange={(event) => set({ description: event.target.value })} /></Field>
        </div>
      </Card>
      <Card title="Cómo lo ve el cliente" subtitle="Vista previa">
        <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#0B1020", aspectRatio: "16 / 10" }}>
          {current.imageUrl ? <img src={imageSrc(current.imageUrl)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.75 }} /> : null}
          <div style={{ position: "absolute", left: 16, bottom: 14, right: 16, color: "#fff" }}><small style={{ letterSpacing: ".1em", fontSize: 11, opacity: 0.85 }}>{current.place}</small><div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{current.title} {current.title2}</div><p style={{ margin: "6px 0 0", fontSize: 12.5, opacity: 0.9 }}>{current.description}</p></div>
        </div>
        <div className="ow-toolbar" style={{ marginTop: 10 }}><label className="rx-btn rx-btn--sm" style={{ position: "relative" }}><ImagePlus />Cambiar imagen<input type="file" accept="image/jpeg,image/png,image/webp" style={{ position: "absolute", inset: 0, opacity: 0 }} onChange={(event) => photo(event.target.files?.[0])} /></label>{current.imageUrl ? <button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" onClick={removePhoto}><Trash2 />Quitar</button> : null}</div>
        <div className="ow-toolbar" style={{ marginTop: 10 }}><button className="rx-btn rx-btn--sm" type="button" onClick={() => navigate("catalogo", "habitaciones")}>Fotos de habitaciones</button><button className="rx-btn rx-btn--sm" type="button" onClick={() => navigate("catalogo", "carta")}>Fotos de la carta</button></div>
      </Card>
    </div>
  </>;
}
