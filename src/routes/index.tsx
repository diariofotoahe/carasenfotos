import { createFileRoute, ClientOnly } from "@tanstack/react-router";

import { BuscadorRostros } from "@/components/buscador/BuscadorRostros";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Buscador de rostros en fotos y videos" },
      {
        name: "description",
        content:
          "Aplicación de estudio fotográfico que localiza a una persona en tus fotos y videos y copia las coincidencias a una carpeta destino.",
      },
      { property: "og:title", content: "Buscador de rostros en fotos y videos" },
      {
        property: "og:description",
        content: "Reconocimiento facial en el navegador: busca, encuentra y organiza.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas">
          <p className="text-sm text-muted-foreground">Cargando estudio…</p>
        </div>
      }
    >
      <BuscadorRostros />
    </ClientOnly>
  );
}
