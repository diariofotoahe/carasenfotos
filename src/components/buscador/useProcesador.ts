/**
 * useProcesador.ts
 * -----------------------------------------------------------------------------
 * Motor de proceso: recorre fotos y videos, compara rostros contra las
 * referencias y copia las coincidencias a la carpeta destino.
 * Soporta detener / pausar / continuar y publica progreso en vivo.
 */

import { useCallback, useRef, useState } from "react";

import {
  loadFaceEngine,
  extraerDescriptores,
  mejorCoincidencia,
  type Descriptor,
} from "@/lib/face/faceEngine";
import {
  cargarImagen,
  cargarVideo,
  canvasAVistaPrevia,
  irASegundo,
  redimensionar,
  tiempoLegible,
} from "@/lib/face/mediaUtils";
import { copiarArchivo, type ArchivoFuente } from "@/lib/face/fileSystem";

export type Fase = "inactivo" | "preparando" | "procesando" | "pausado" | "terminado" | "cancelado";

export interface Registro {
  ruta: string;
  tipo: "imagen" | "video";
  estado: "copiado" | "sin-coincidencia" | "sin-rostro" | "error";
  detalle: string;
  distancia?: number;
  vistaPrevia?: string;
}

export interface OpcionesProceso {
  archivos: ArchivoFuente[];
  referencias: Descriptor[];
  destino: FileSystemDirectoryHandle;
  umbral: number;
  intervaloVideo: number;
  guardarFotogramas: boolean;
}

export function useProcesador() {
  const [fase, setFase] = useState<Fase>("inactivo");
  const [mensaje, setMensaje] = useState("");
  const [indice, setIndice] = useState(0);
  const [total, setTotal] = useState(0);
  const [actual, setActual] = useState<string>("");
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [galeria, setGaleria] = useState<string[]>([]);

  // Banderas de control leídas dentro del bucle asíncrono.
  const pausaRef = useRef(false);
  const cancelarRef = useRef(false);

  const esperarSiPausado = useCallback(async () => {
    while (pausaRef.current && !cancelarRef.current) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }, []);

  const pausar = useCallback(() => {
    pausaRef.current = true;
    setFase("pausado");
  }, []);

  const continuar = useCallback(() => {
    pausaRef.current = false;
    setFase("procesando");
  }, []);

  const cancelar = useCallback(() => {
    cancelarRef.current = true;
    pausaRef.current = false;
  }, []);

  const reiniciar = useCallback(() => {
    cancelarRef.current = false;
    pausaRef.current = false;
    setFase("inactivo");
    setRegistros([]);
    setGaleria([]);
    setIndice(0);
    setTotal(0);
    setActual("");
    setVistaPrevia(null);
    setMensaje("");
  }, []);

  /** Ejecuta el proceso completo. */
  const iniciar = useCallback(
    async (op: OpcionesProceso) => {
      cancelarRef.current = false;
      pausaRef.current = false;
      setRegistros([]);
      setGaleria([]);
      setIndice(0);
      setTotal(op.archivos.length);
      setFase("preparando");

      let faceapi;
      try {
        faceapi = await loadFaceEngine(setMensaje);
      } catch (error) {
        console.error(error);
        setMensaje("No fue posible cargar los modelos de reconocimiento facial.");
        setFase("terminado");
        return;
      }

      setFase("procesando");
      const nuevos: Registro[] = [];

      for (let i = 0; i < op.archivos.length; i += 1) {
        if (cancelarRef.current) break;
        await esperarSiPausado();
        if (cancelarRef.current) break;

        const archivo = op.archivos[i]!;
        setIndice(i + 1);
        setActual(archivo.ruta);

        try {
          const file = await archivo.handle.getFile();

          if (archivo.tipo === "imagen") {
            // --- FOTOGRAFÍAS -------------------------------------------------
            const img = await cargarImagen(file);
            const lienzo = redimensionar(img, 720);
            const preview = canvasAVistaPrevia(lienzo);
            setVistaPrevia(preview);

            const descriptores = await extraerDescriptores(faceapi, lienzo);
            if (descriptores.length === 0) {
              nuevos.push({
                ruta: archivo.ruta,
                tipo: "imagen",
                estado: "sin-rostro",
                detalle: "No se detectaron rostros.",
              });
            } else {
              const d = mejorCoincidencia(descriptores, op.referencias);
              if (d !== null && d <= op.umbral) {
                const nombreFinal = await copiarArchivo(op.destino, archivo.nombre, file);
                nuevos.push({
                  ruta: archivo.ruta,
                  tipo: "imagen",
                  estado: "copiado",
                  detalle: `Copiada como ${nombreFinal}`,
                  distancia: d,
                  vistaPrevia: preview,
                });
                setGaleria((g) => [preview, ...g].slice(0, 12));
              } else {
                nuevos.push({
                  ruta: archivo.ruta,
                  tipo: "imagen",
                  estado: "sin-coincidencia",
                  detalle: `Rostros detectados: ${descriptores.length}`,
                  distancia: d ?? undefined,
                });
              }
            }
          } else {
            // --- VIDEOS ------------------------------------------------------
            const { video, liberar } = await cargarVideo(file);
            let coincide = false;
            let mejorD: number | undefined;
            let momento = 0;
            let fotogramasGuardados = 0;
            const duracion = Number.isFinite(video.duration) ? video.duration : 0;

            for (let t = 0; t < Math.max(duracion, 0.1); t += op.intervaloVideo) {
              if (cancelarRef.current) break;
              await esperarSiPausado();
              if (cancelarRef.current) break;

              await irASegundo(video, t);
              const lienzo = redimensionar(video, 640);
              const preview = canvasAVistaPrevia(lienzo);
              setVistaPrevia(preview);
              setActual(`${archivo.ruta} · ${tiempoLegible(t)}`);

              const descriptores = await extraerDescriptores(faceapi, lienzo);
              if (descriptores.length === 0) continue;

              const d = mejorCoincidencia(descriptores, op.referencias);
              if (d !== null && (mejorD === undefined || d < mejorD)) mejorD = d;

              if (d !== null && d <= op.umbral) {
                if (!coincide) {
                  coincide = true;
                  momento = t;
                  setGaleria((g) => [preview, ...g].slice(0, 12));
                }
                if (op.guardarFotogramas) {
                  // Guardamos el fotograma coincidente como JPG en el destino.
                  const blob = await new Promise<Blob | null>((res) =>
                    lienzo.toBlob((b) => res(b), "image/jpeg", 0.92),
                  );
                  if (blob) {
                    await copiarArchivo(
                      op.destino,
                      `${archivo.nombre.replace(/\.[^.]+$/, "")}_frame_${Math.round(t)}s.jpg`,
                      blob,
                    );
                    fotogramasGuardados += 1;
                  }
                } else {
                  break; // Con una coincidencia basta para copiar el video.
                }
              }
            }

            liberar();

            if (coincide) {
              const nombreFinal = await copiarArchivo(op.destino, archivo.nombre, file);
              nuevos.push({
                ruta: archivo.ruta,
                tipo: "video",
                estado: "copiado",
                detalle: `Coincidencia en ${tiempoLegible(momento)} · copiado como ${nombreFinal}${
                  fotogramasGuardados ? ` · ${fotogramasGuardados} fotogramas` : ""
                }`,
                distancia: mejorD,
              });
            } else {
              nuevos.push({
                ruta: archivo.ruta,
                tipo: "video",
                estado: "sin-coincidencia",
                detalle: "El rostro no aparece en los fotogramas analizados.",
                distancia: mejorD,
              });
            }
          }
        } catch (error) {
          console.error("[procesador]", archivo.ruta, error);
          nuevos.push({
            ruta: archivo.ruta,
            tipo: archivo.tipo,
            estado: "error",
            detalle: error instanceof Error ? error.message : "Error desconocido.",
          });
        }

        setRegistros([...nuevos]);
      }

      setVistaPrevia(null);
      setActual("");
      setFase(cancelarRef.current ? "cancelado" : "terminado");
      setMensaje(
        cancelarRef.current
          ? "Proceso detenido por el usuario."
          : "Proceso finalizado correctamente.",
      );
    },
    [esperarSiPausado],
  );

  return {
    fase,
    mensaje,
    indice,
    total,
    actual,
    vistaPrevia,
    registros,
    galeria,
    iniciar,
    pausar,
    continuar,
    cancelar,
    reiniciar,
  };
}
