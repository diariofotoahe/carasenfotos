/**
 * BuscadorRostros.tsx
 * -----------------------------------------------------------------------------
 * Interfaz principal del estudio: configuración paso a paso, proceso en vivo
 * (con barra de avance, vista previa y botones detener/cancelar/continuar) y
 * resumen final de movimientos.
 */

import { useMemo, useState } from "react";

import { FondoGaleria } from "./FondoGaleria";
import { useProcesador } from "./useProcesador";
import {
  loadFaceEngine,
  extraerDescriptores,
  UMBRAL_POR_DEFECTO,
  type Descriptor,
} from "@/lib/face/faceEngine";
import { cargarImagen, redimensionar, canvasAVistaPrevia } from "@/lib/face/mediaUtils";
import {
  crearCarpetaDestino,
  elegirCarpeta,
  explorarCarpeta,
  soportaCarpetas,
  type ArchivoFuente,
} from "@/lib/face/fileSystem";

interface Referencia {
  id: string;
  nombre: string;
  preview: string;
  descriptor: Descriptor;
}

export function BuscadorRostros() {
  // --- Configuración -------------------------------------------------------
  const [nombreApp, setNombreApp] = useState("");
  const [nombreConfirmado, setNombreConfirmado] = useState(false);
  const [fuente, setFuente] = useState<FileSystemDirectoryHandle | null>(null);
  const [archivos, setArchivos] = useState<ArchivoFuente[]>([]);
  const [recursivo, setRecursivo] = useState(true);
  const [nombreDestino, setNombreDestino] = useState("Coincidencias");
  const [destinoExterno, setDestinoExterno] = useState<FileSystemDirectoryHandle | null>(null);
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [umbral, setUmbral] = useState(UMBRAL_POR_DEFECTO);
  const [intervaloVideo, setIntervaloVideo] = useState(1);
  const [guardarFotogramas, setGuardarFotogramas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargandoRef, setCargandoRef] = useState(false);
  const [explorando, setExplorando] = useState(false);

  const proc = useProcesador();

  const fotos = archivos.filter((a) => a.tipo === "imagen").length;
  const videos = archivos.filter((a) => a.tipo === "video").length;
  const listo = Boolean(fuente) && archivos.length > 0 && referencias.length >= 2;
  const enProceso = proc.fase === "procesando" || proc.fase === "pausado" || proc.fase === "preparando";

  const resumen = useMemo(() => {
    const copiados = proc.registros.filter((r) => r.estado === "copiado");
    return {
      copiados: copiados.length,
      fotosCopiadas: copiados.filter((r) => r.tipo === "imagen").length,
      videosCopiados: copiados.filter((r) => r.tipo === "video").length,
      sinCoincidencia: proc.registros.filter((r) => r.estado === "sin-coincidencia").length,
      sinRostro: proc.registros.filter((r) => r.estado === "sin-rostro").length,
      errores: proc.registros.filter((r) => r.estado === "error").length,
    };
  }, [proc.registros]);

  /** Paso 2: seleccionar carpeta fuente y explorarla. */
  async function seleccionarFuente() {
    setError(null);
    try {
      const dir = await elegirCarpeta();
      setFuente(dir);
      setExplorando(true);
      const encontrados = await explorarCarpeta(dir, {
        recursivo,
        excluir: nombreDestino.trim() || undefined,
      });
      setArchivos(encontrados);
      if (encontrados.length === 0) {
        setError("La carpeta seleccionada no contiene fotos ni videos compatibles.");
      }
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "No fue posible abrir la carpeta.");
    } finally {
      setExplorando(false);
    }
  }

  /** Paso 3 (opcional): carpeta destino en otra ubicación. */
  async function seleccionarDestinoExterno() {
    setError(null);
    try {
      setDestinoExterno(await elegirCarpeta());
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "No fue posible abrir la carpeta destino.");
    }
  }

  /** Paso 4: cargar fotografías de referencia y calcular sus descriptores. */
  async function agregarReferencias(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setCargandoRef(true);
    try {
      const faceapi = await loadFaceEngine();
      const nuevas: Referencia[] = [];
      const sinRostro: string[] = [];

      for (const file of Array.from(files)) {
        const img = await cargarImagen(file);
        const lienzo = redimensionar(img, 720);
        const descriptores = await extraerDescriptores(faceapi, lienzo);
        if (descriptores.length === 0) {
          sinRostro.push(file.name);
          continue;
        }
        nuevas.push({
          id: crypto.randomUUID(),
          nombre: file.name,
          preview: canvasAVistaPrevia(lienzo),
          descriptor: descriptores[0]!,
        });
      }

      setReferencias((prev) => [...prev, ...nuevas]);
      if (sinRostro.length > 0) {
        setError(`Sin rostro detectable: ${sinRostro.join(", ")}. Usa fotos nítidas y de frente.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible analizar las referencias.");
    } finally {
      setCargandoRef(false);
    }
  }

  /** Paso 5: crear carpeta destino y arrancar el proceso. */
  async function comenzar() {
    setError(null);
    if (!fuente) return setError("Selecciona primero la carpeta con las fotos y videos.");
    if (referencias.length < 2) return setError("Se requieren al menos dos fotos de referencia.");

    try {
      const destino = await crearCarpetaDestino(destinoExterno ?? fuente, nombreDestino);
      await proc.iniciar({
        archivos,
        referencias: referencias.map((r) => r.descriptor),
        destino,
        umbral,
        intervaloVideo,
        guardarFotogramas,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible crear la carpeta destino.");
    }
  }

  const porcentaje = proc.total > 0 ? Math.round((proc.indice / proc.total) * 100) : 0;

  // --- Portada: nombre de la aplicación ------------------------------------
  if (!nombreConfirmado) {
    return (
      <>
        <FondoGaleria imagenes={proc.galeria} />
        <main className="relative flex min-h-screen items-center justify-center px-6 py-16">
          <section className="panel-estudio w-full max-w-md px-10 py-12 text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Estudio</p>
            <h1 className="mt-4 text-5xl font-semibold text-foreground">
              {nombreApp.trim() || "Retrato"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Encuentra un rostro entre miles de fotos y videos.
            </p>
            <form
              className="mt-8 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setNombreConfirmado(true);
              }}
            >
              <input
                value={nombreApp}
                onChange={(e) => setNombreApp(e.target.value)}
                placeholder="Nombre de tu aplicación"
                className="w-full rounded-xl border border-input bg-secondary px-4 py-3 text-center text-sm outline-none focus:border-ring"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                Comenzar
              </button>
            </form>
            {!soportaCarpetas() && (
              <p className="mt-6 text-xs text-destructive">
                Para copiar archivos a una carpeta usa Chrome, Edge u Opera en computadora.
              </p>
            )}
          </section>
        </main>
      </>
    );
  }

  // --- Aplicación ----------------------------------------------------------
  return (
    <>
      <FondoGaleria imagenes={proc.galeria} />
      <main className="relative mx-auto min-h-screen w-full max-w-5xl px-5 py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">Estudio</p>
            <h1 className="text-4xl font-semibold text-foreground">
              {nombreApp.trim() || "Retrato"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {fotos} fotos · {videos} videos detectados
          </p>
        </header>

        {error && (
          <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ----------------------- CONFIGURACIÓN ----------------------- */}
        {!enProceso && proc.fase !== "terminado" && proc.fase !== "cancelado" && (
          <div className="grid gap-5 md:grid-cols-2">
            {/* Paso 1: carpeta fuente */}
            <section className="panel-estudio p-6">
              <h2 className="text-lg font-semibold">1 · Carpeta de origen</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Elige la carpeta con tus fotografías y videos.
              </p>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recursivo}
                  onChange={(e) => setRecursivo(e.target.checked)}
                />
                Incluir subcarpetas
              </label>
              <button
                onClick={seleccionarFuente}
                className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                {explorando ? "Explorando…" : "Elegir carpeta"}
              </button>
              {fuente && (
                <p className="mt-3 truncate text-sm text-muted-foreground">
                  📁 {fuente.name} — {archivos.length} archivos
                </p>
              )}
            </section>

            {/* Paso 2: destino */}
            <section className="panel-estudio p-6">
              <h2 className="text-lg font-semibold">2 · Carpeta destino</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Se crea dentro de la carpeta de origen.
              </p>
              <input
                value={nombreDestino}
                onChange={(e) => setNombreDestino(e.target.value)}
                className="mt-4 w-full rounded-xl border border-input bg-secondary px-4 py-3 text-sm outline-none focus:border-ring"
                placeholder="Nombre de la carpeta destino"
              />
              <button
                onClick={seleccionarDestinoExterno}
                className="mt-3 w-full rounded-xl border border-input px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary"
              >
                {destinoExterno
                  ? `Otra ubicación: ${destinoExterno.name}`
                  : "Elegir otra ubicación (opcional)"}
              </button>
            </section>

            {/* Paso 3: referencias */}
            <section className="panel-estudio p-6 md:col-span-2">
              <h2 className="text-lg font-semibold">3 · Fotos de referencia del rostro</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Mínimo dos fotos claras de la persona a buscar.
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => agregarReferencias(e.target.files)}
                className="mt-4 block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2.5 file:text-sm file:text-primary-foreground"
              />
              {cargandoRef && (
                <p className="mt-3 text-sm text-muted-foreground">Analizando rostros…</p>
              )}
              {referencias.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {referencias.map((r, i) => (
                    <figure key={`${r.nombre}-${i}`} className="w-24">
                      <img
                        src={r.preview}
                        alt={r.nombre}
                        className="h-24 w-24 rounded-xl object-cover shadow-plate"
                      />
                      <button
                        onClick={() => setReferencias((p) => p.filter((_, j) => j !== i))}
                        className="mt-1 w-full text-xs text-muted-foreground hover:text-destructive"
                      >
                        Quitar
                      </button>
                    </figure>
                  ))}
                </div>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                {referencias.length}/2 referencias mínimas cargadas.
              </p>
            </section>

            {/* Paso 4: ajustes */}
            <section className="panel-estudio p-6 md:col-span-2">
              <h2 className="text-lg font-semibold">4 · Precisión</h2>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <label className="block text-sm">
                  Tolerancia del parecido: <strong>{umbral.toFixed(2)}</strong>
                  <input
                    type="range"
                    min={0.35}
                    max={0.75}
                    step={0.01}
                    value={umbral}
                    onChange={(e) => setUmbral(Number(e.target.value))}
                    className="mt-2 w-full accent-accent"
                  />
                  <span className="text-xs text-muted-foreground">
                    Menor = más estricto, menos falsos positivos.
                  </span>
                </label>
                <label className="block text-sm">
                  Revisar un fotograma cada <strong>{intervaloVideo}s</strong> de video
                  <input
                    type="range"
                    min={0.5}
                    max={5}
                    step={0.5}
                    value={intervaloVideo}
                    onChange={(e) => setIntervaloVideo(Number(e.target.value))}
                    className="mt-2 w-full accent-accent"
                  />
                  <span className="text-xs text-muted-foreground">
                    Intervalos cortos son más precisos pero más lentos.
                  </span>
                </label>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={guardarFotogramas}
                  onChange={(e) => setGuardarFotogramas(e.target.checked)}
                />
                Guardar también los fotogramas donde aparece el rostro
              </label>
            </section>

            <div className="md:col-span-2">
              <button
                disabled={!listo}
                onClick={comenzar}
                className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Iniciar búsqueda del rostro
              </button>
            </div>
          </div>
        )}

        {/* ------------------------- PROCESO --------------------------- */}
        {enProceso && (
          <section className="panel-estudio p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {proc.fase === "pausado" ? "En pausa" : "Analizando"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {proc.indice} de {proc.total} · {porcentaje}%
              </p>
            </div>

            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${porcentaje}%` }}
              />
            </div>

            <p className="mt-3 truncate text-sm text-muted-foreground">
              {proc.actual || proc.mensaje}
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-[1.2fr_1fr]">
              <div className="aspect-video overflow-hidden rounded-2xl bg-muted">
                {proc.vistaPrevia ? (
                  <img
                    src={proc.vistaPrevia}
                    alt="Archivo en revisión"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Preparando motor de reconocimiento…
                  </div>
                )}
              </div>

              <div className="max-h-64 overflow-auto rounded-2xl border border-border p-3 text-sm">
                {proc.registros
                  .slice()
                  .reverse()
                  .slice(0, 40)
                  .map((r, i) => (
                    <p key={i} className="truncate py-0.5">
                      <span
                        className={
                          r.estado === "copiado"
                            ? "text-accent"
                            : r.estado === "error"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        ●
                      </span>{" "}
                      {r.ruta}
                    </p>
                  ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {proc.fase === "procesando" && (
                <button
                  onClick={proc.pausar}
                  className="rounded-xl border border-input px-5 py-2.5 text-sm font-medium hover:bg-secondary"
                >
                  Detener
                </button>
              )}
              {proc.fase === "pausado" && (
                <button
                  onClick={proc.continuar}
                  className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground"
                >
                  Continuar
                </button>
              )}
              <button
                onClick={proc.cancelar}
                className="rounded-xl border border-destructive/40 px-5 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                Cancelar
              </button>
            </div>
          </section>
        )}

        {/* -------------------------- RESUMEN -------------------------- */}
        {(proc.fase === "terminado" || proc.fase === "cancelado") && (
          <section className="panel-estudio p-6">
            <h2 className="text-2xl font-semibold">Resumen de movimientos</h2>
            <p className="mt-1 text-sm text-muted-foreground">{proc.mensaje}</p>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ["Copiados", resumen.copiados],
                ["Fotos", resumen.fotosCopiadas],
                ["Videos", resumen.videosCopiados],
                ["Sin coincidencia", resumen.sinCoincidencia + resumen.sinRostro],
                ["Errores", resumen.errores],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta as string} className="rounded-2xl bg-secondary p-4">
                  <p className="text-3xl font-semibold">{valor}</p>
                  <p className="text-xs text-muted-foreground">{etiqueta}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 max-h-80 overflow-auto rounded-2xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-secondary">
                  <tr>
                    <th className="px-3 py-2">Archivo</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {proc.registros.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="max-w-[16rem] truncate px-3 py-2">{r.ruta}</td>
                      <td className="px-3 py-2">
                        {r.estado === "copiado"
                          ? "Copiado"
                          : r.estado === "error"
                            ? "Error"
                            : r.estado === "sin-rostro"
                              ? "Sin rostro"
                              : "Sin coincidencia"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.detalle}
                        {r.distancia !== undefined && ` · parecido ${r.distancia.toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={proc.reiniciar}
              className="mt-5 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
            >
              Nueva búsqueda
            </button>
          </section>
        )}
      </main>
    </>
  );
}
