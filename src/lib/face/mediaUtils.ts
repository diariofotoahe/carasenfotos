/**
 * mediaUtils.ts
 * -----------------------------------------------------------------------------
 * Utilidades de carga y decodificación de imágenes y videos en el navegador.
 * Sustituyen a cv2.imread / cv2.VideoCapture del mundo Python.
 */

export const EXT_IMAGEN = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "avif"];
export const EXT_VIDEO = ["mp4", "webm", "mov", "m4v", "ogg", "ogv"];

/** Devuelve la extensión en minúsculas de un nombre de archivo. */
export function extension(nombre: string): string {
  const i = nombre.lastIndexOf(".");
  return i === -1 ? "" : nombre.slice(i + 1).toLowerCase();
}

export const esImagen = (nombre: string) => EXT_IMAGEN.includes(extension(nombre));
export const esVideo = (nombre: string) => EXT_VIDEO.includes(extension(nombre));

/** Carga un File/Blob como HTMLImageElement ya decodificado. */
export function cargarImagen(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Formato de imagen no soportado o archivo corrupto."));
    };
    img.src = url;
  });
}

/** Reduce una imagen/canvas a un canvas con lado máximo `max` (acelera el análisis). */
export function redimensionar(
  fuente: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  max = 720,
): HTMLCanvasElement {
  const w =
    "naturalWidth" in fuente
      ? fuente.naturalWidth
      : "videoWidth" in fuente
        ? fuente.videoWidth
        : fuente.width;
  const h =
    "naturalHeight" in fuente
      ? fuente.naturalHeight
      : "videoHeight" in fuente
        ? fuente.videoHeight
        : fuente.height;

  const escala = Math.min(1, max / Math.max(w || 1, h || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((w || 1) * escala));
  canvas.height = Math.max(1, Math.round((h || 1) * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No fue posible crear el contexto 2D del canvas.");
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Convierte un canvas a data URL ligera para la vista previa en vivo. */
export const canvasAVistaPrevia = (c: HTMLCanvasElement) => c.toDataURL("image/jpeg", 0.7);

/** Crea un <video> oculto listo para hacer "seek" cuadro a cuadro. */
export function cargarVideo(blob: Blob): Promise<{ video: HTMLVideoElement; liberar: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const liberar = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => resolve({ video, liberar });
    video.onerror = () => {
      liberar();
      reject(new Error("Formato de video incompatible con el navegador."));
    };
    video.src = url;
  });
}

/** Posiciona el video en un segundo exacto y espera a que el cuadro esté listo. */
export function irASegundo(video: HTMLVideoElement, segundo: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const limpiar = () => {
      video.removeEventListener("seeked", ok);
      video.removeEventListener("error", fail);
    };
    const ok = () => {
      limpiar();
      resolve();
    };
    const fail = () => {
      limpiar();
      reject(new Error("No fue posible leer el fotograma solicitado."));
    };
    video.addEventListener("seeked", ok);
    video.addEventListener("error", fail);
    try {
      video.currentTime = Math.min(segundo, Math.max(0, (video.duration || 0) - 0.05));
    } catch {
      fail();
    }
  });
}

/** Formatea segundos como mm:ss. */
export function tiempoLegible(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
