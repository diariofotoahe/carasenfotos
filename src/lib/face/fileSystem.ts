/**
 * fileSystem.ts
 * -----------------------------------------------------------------------------
 * Acceso real a carpetas del equipo con la File System Access API,
 * equivalente web de tkinter.filedialog + shutil.copy2 de Python.
 */

import { esImagen, esVideo } from "./mediaUtils";

/** Archivo encontrado dentro de la carpeta fuente. */
export interface ArchivoFuente {
  nombre: string;
  ruta: string;
  tipo: "imagen" | "video";
  handle: FileSystemFileHandle;
}

/** ¿El navegador soporta la selección de carpetas? */
export function soportaCarpetas(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Abre el diálogo de navegación de carpetas con permiso de lectura/escritura. */
export async function elegirCarpeta(): Promise<FileSystemDirectoryHandle> {
  if (!soportaCarpetas()) {
    throw new Error(
      "Tu navegador no permite abrir carpetas. Usa Chrome, Edge u Opera en computadora.",
    );
  }
  // @ts-expect-error API disponible solo en navegadores compatibles.
  return window.showDirectoryPicker({ mode: "readwrite" });
}

/** Recorre la carpeta (y subcarpetas) recolectando fotos y videos. */
export async function explorarCarpeta(
  dir: FileSystemDirectoryHandle,
  opciones: { recursivo: boolean; excluir?: string },
  prefijo = "",
): Promise<ArchivoFuente[]> {
  const encontrados: ArchivoFuente[] = [];

  const iterable = dir as unknown as {
    values: () => AsyncIterable<FileSystemHandle>;
  };
  for await (const entrada of iterable.values()) {
    if (entrada.kind === "directory") {
      if (!opciones.recursivo) continue;
      if (opciones.excluir && entrada.name === opciones.excluir) continue;
      encontrados.push(
        ...(await explorarCarpeta(entrada as FileSystemDirectoryHandle, opciones, `${prefijo}${entrada.name}/`)),
      );
      continue;
    }

    const nombre = entrada.name as string;
    if (nombre.startsWith(".")) continue;
    const tipo = esImagen(nombre) ? "imagen" : esVideo(nombre) ? "video" : null;
    if (!tipo) continue;

    encontrados.push({
      nombre,
      ruta: `${prefijo}${nombre}`,
      tipo,
      handle: entrada as FileSystemFileHandle,
    });
  }

  return encontrados.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** Crea (o abre) la subcarpeta destino dentro de la carpeta indicada. */
export async function crearCarpetaDestino(
  padre: FileSystemDirectoryHandle,
  nombre: string,
): Promise<FileSystemDirectoryHandle> {
  const limpio = nombre.trim().replace(/[\\/:*?"<>|]/g, "-");
  if (!limpio) throw new Error("El nombre de la carpeta destino no puede estar vacío.");
  return padre.getDirectoryHandle(limpio, { create: true });
}

/** Copia un archivo al destino evitando sobrescribir (agrega sufijo numérico). */
export async function copiarArchivo(
  destino: FileSystemDirectoryHandle,
  nombre: string,
  contenido: Blob,
): Promise<string> {
  let final = nombre;
  let intento = 1;

  // Buscamos un nombre libre para no perder archivos con el mismo nombre.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await destino.getFileHandle(final);
      const punto = nombre.lastIndexOf(".");
      const base = punto === -1 ? nombre : nombre.slice(0, punto);
      const ext = punto === -1 ? "" : nombre.slice(punto);
      final = `${base}_${intento}${ext}`;
      intento += 1;
    } catch {
      break; // No existe: nombre disponible.
    }
  }

  const handle = await destino.getFileHandle(final, { create: true });
  const writable = await handle.createWritable();
  await writable.write(contenido);
  await writable.close();
  return final;
}
