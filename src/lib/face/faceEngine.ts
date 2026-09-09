/**
 * faceEngine.ts
 * -----------------------------------------------------------------------------
 * Capa de abstracción sobre @vladmandic/face-api (equivalente web de
 * face_recognition / DeepFace, con backend TensorFlow.js + OpenCV-like ops).
 *
 * Toda la librería es SOLO NAVEGADOR: se importa de forma diferida (dynamic
 * import) para no romper el render en servidor (SSR).
 */

// Tipo mínimo que necesitamos del módulo, para evitar importarlo en SSR.
type FaceApi = typeof import("@vladmandic/face-api");

/** URL pública con los pesos de los modelos (no requiere backend propio). */
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

/** Instancia única del módulo ya cargado (patrón singleton). */
let apiPromise: Promise<FaceApi> | null = null;

/**
 * Carga (una sola vez) la librería y los tres modelos necesarios:
 *  - ssdMobilenetv1      -> detección de rostros
 *  - faceLandmark68Net   -> 68 puntos faciales (alineación)
 *  - faceRecognitionNet  -> descriptor de 128 dimensiones (embedding)
 */
export async function loadFaceEngine(
  onProgress?: (mensaje: string) => void,
): Promise<FaceApi> {
  if (apiPromise) return apiPromise;

  apiPromise = (async () => {
    onProgress?.("Inicializando motor de visión…");
    const faceapi = await import("@vladmandic/face-api");

    // Elegimos el backend más rápido disponible (WebGL, con fallback a CPU).
    try {
      await faceapi.tf.setBackend("webgl");
      await faceapi.tf.ready();
    } catch {
      await faceapi.tf.setBackend("cpu");
      await faceapi.tf.ready();
    }

    onProgress?.("Descargando modelos de reconocimiento facial…");
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    onProgress?.("Motor listo.");
    return faceapi;
  })();

  // Si falla, permitimos reintentar en la siguiente llamada.
  apiPromise.catch(() => {
    apiPromise = null;
  });

  return apiPromise;
}

/** Descriptor facial: vector de 128 números que representa un rostro. */
export type Descriptor = Float32Array;

/**
 * Extrae TODOS los descriptores faciales de un elemento de imagen/canvas/video.
 * Devuelve un arreglo vacío si no se detecta ningún rostro (no lanza error).
 */
export async function extraerDescriptores(
  faceapi: FaceApi,
  entrada: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<Descriptor[]> {
  try {
    const resultados = await faceapi
      .detectAllFaces(entrada, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    return resultados.map((r) => r.descriptor);
  } catch (error) {
    console.error("[faceEngine] Error extrayendo descriptores:", error);
    return [];
  }
}

/** Distancia euclidiana entre dos descriptores (menor = más parecido). */
export function distancia(a: Descriptor, b: Descriptor): number {
  let suma = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i]! - b[i]!;
    suma += d * d;
  }
  return Math.sqrt(suma);
}

/**
 * Compara los rostros encontrados contra el set de referencias.
 * Devuelve la mejor (menor) distancia encontrada, o null si no hubo rostros.
 */
export function mejorCoincidencia(
  encontrados: Descriptor[],
  referencias: Descriptor[],
): number | null {
  let mejor: number | null = null;
  for (const rostro of encontrados) {
    for (const ref of referencias) {
      const d = distancia(rostro, ref);
      if (mejor === null || d < mejor) mejor = d;
    }
  }
  return mejor;
}

/** Umbral por defecto: 0.6 es el estándar de face_recognition/dlib. */
export const UMBRAL_POR_DEFECTO = 0.55;
