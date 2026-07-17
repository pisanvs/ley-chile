# SEO + contenido — plan (2026-07-16)

Objetivo: capturar demanda orgánica real sobre leyes chilenas sin publicar 333k
páginas delgadas. Todo dato legal que se afirme sale del corpus (Postgres) o de
una fuente citada.

## 0. Hallazgo que motiva el diseño

`lib/jsonld.ts` exporta `legislationJsonLd()` — **ninguna ruta lo renderiza**.
Peor: `app/[tipo]/[numero]/page.tsx` sólo devuelve `<LawView>`, que es un
componente cliente que trae el texto por react-query desde `/api/text/…`. El
HTML que recibe Googlebot no contiene el articulado: sólo el shell del IDE.

Los ~333k lectores son, hoy, páginas sin contenido indexable. Las rutas del
lector están fuera de alcance en este trabajo (constraint), así que la
estrategia es: **crear superficies SSR paralelas que sí lleven el texto**, y que
canonicalicen hacia sí mismas y enlacen al lector como herramienta.

Recomendación aparte (no ejecutada aquí): renderizar en el servidor el articulado
vigente dentro del lector, o al menos inyectar `legislationJsonLd`.

## 1. Investigación de demanda

Patrones reales que escriben los chilenos (WebSearch, ver fuentes al final):

| Patrón | Intención | Ejemplo real |
|---|---|---|
| `ley karin` / `ley karin qué es` | nombre coloquial → norma | Ley 21.643, vigente 2024-08-01 |
| `ley 21719` / `ley de datos personales` | número → contenido | Ley 21.719, publicada 2024-12-13 |
| `ley de arriendo` | tema → norma | Ley 18.101 (+ 21.461) |
| `ley del consumidor` | tema → norma | Ley 19.496 (9 versiones, 13 mods) |
| `qué dice la ley X` / `ley X resumen` | contenido | genérico, 22k normas sustantivas |
| `qué cambió la ley X` / `modificaciones ley X` | cambio | 5.4k normas multi-versión |
| `ley 40 horas` | nombre coloquial | Ley 21.561 |
| `ley X cuándo entra en vigencia` | vigencia | corpus tiene `desde`/`hasta` |

Dos observaciones estructurales:

1. **El nombre coloquial es el query, no el número.** "ley karin" >> "ley 21643".
   Necesitamos una capa de alias curada.
2. **~700 leyes reales están en `tipo='otras'`.** Ley Karin es `/otras/21643`,
   datos personales es `/otras/21719`. `/ley/21643` no existe. El alias resolver
   ya cubre el 308, pero el contenido editorial debe usar `normaHref` siempre.

## 2. Taxonomía → plantillas

### `/guia/[tipo]/[numero]` — "Qué dice la Ley X"
Responde `qué dice`, `qué es`, `resumen`, `cuándo entra en vigencia`.
Contenido SSR: título, organismo, fecha de publicación, estado de vigencia,
línea de tiempo de versiones, **índice real de artículos con texto**, qué normas
modifica / la modifican. JSON-LD: `Legislation` + `FAQPage` (preguntas generadas
desde hechos del corpus, nunca inventadas).

**Gate:** `tipo ∈ (ley, dl, dfl, cod, otras)` ∧ `≥5 artículos` → **6.602
páginas** (medido). Todo lo demás → 404, fuera del sitemap. Un decreto de dos
líneas no merece una guía; sería duplicado delgado.

El gate original era `≥3 artículos ∧ ≥2000 chars` (7.853 páginas). Se cayó, y la
razón importa: `body` está TOAST'd, así que `sum(length(body))` sobre las ~872k
filas de `articulo` desTOASTea el corpus entero. En bulk (índice `/guia` +
sitemap) el spill a temp reventó Postgres en producción con
`could not write to file "base/pgsql_tmp/…": No space left on device` — 500 en
dos rutas. Contar filas es barato. De las 6.602 que pasan, sólo 429 tienen menos
de 2.000 chars y la más delgada tiene 801: texto legal real, no duplicado.

El mismo número gobierna la página y el sitemap. No pueden divergir: un gate
barato en el sitemap y uno estricto en la página publica URLs que dan 404.

### `/cambios/[tipo]/[numero]` — "Qué cambió la Ley X"
Responde `qué cambió`, `modificaciones`, `historial`.
Contenido SSR: una fila por versión con su causa real (`version.subject`,
`modificacion.causa_id`), enlazada al redline del lector.

**Gate:** `≥2 versiones` ∧ `≥1 modificación` → **5.390 páginas** (medido).
Una norma de una sola versión no tiene historia que contar.

### `/temas/[slug]` — hubs curados
Mapean el nombre coloquial al número. ~8 páginas escritas a mano, cada una
apuntando a normas verificadas en el corpus. Es la capa que gana "ley de
arriendo" sin fingir que un algoritmo sabe qué es "la ley de arriendo".

### `/blog/[slug]` — editorial
Casos de uso reales del producto, con diffs y cadenas de modificación reales
sacadas de Postgres, y capturas del producto en vivo.

## 3. Escala — por qué esto no nos hunde

~12k páginas programáticas (6.602 guías + 5.390 cambios + 8 temas + 3 posts)
contra 333k normas. Cada una es única por construcción (texto legal distinto,
cadena de modificaciones distinta), no una plantilla rellenada con un número
diferente. Las páginas que no pasan el gate no existen (404), no son `noindex` —
no gastan crawl budget.

`canonicalPath()` sigue gobernando el lector: `/ley/X/<fecha>` → `/ley/X` cuando
hay una sola versión. Las guías canonicalizan a sí mismas y enlazan al lector con
`normaHref()`.

## 4. Enlazado interno

```
/temas/{slug} ──► /guia/{tipo}/{numero} ──► /cambios/{tipo}/{numero}
                        │                          │
                        └──────► /{tipo}/{numero} ◄┘   (lector)
/blog/{slug} ──► /guia/… , /temas/… , lector
```

Cada guía enlaza a su par `/cambios` y viceversa. Las guías enlazan a las normas
que modifican y que las modifican — eso teje el grafo de 7.8k páginas sin
granjas de enlaces.

## 5. Rutas reservadas

`guia`, `cambios`, `temas`, `blog` se agregan a `RESERVED_TIPOS` en
`lib/jsonld.ts`. Ninguno colisiona con un tipo real (verificado contra el
`string_agg(distinct tipo)` del corpus), pero el guard es obligatorio: un tipo
nuevo con ese nombre rompería todas las URLs de leyes.

## 6. Sitemap

`app/sitemap.ts` (shards de normas) queda intacto — su lógica de OFFSET es
frágil y no aporta tocarla. Se agrega `app/sitemap-contenido.xml/route.ts` con
guías + cambios + temas + blog, y `robots.ts` publica ambos sitemaps.

## 7. Fuentes

- Ley Karin: [ISL](https://www.isl.gob.cl/ley-karin/), [ChileAtiende](https://www.chileatiende.gob.cl/preguntas-frecuentes/ley-karin), [BCN Ley Fácil](https://www.bcn.cl/api-leyfacil/servicio/ObtenerGuiaPublicadaHTML?uri=acoso-sexual-acoso-laboral-y-violencia-en-el-trabajo)
- Ley 21.719: [BCN](https://www.bcn.cl/leychile/navegar?idNorma=1209272)
- Ley de arriendo: [Ley 18.101 en BCN](https://www.bcn.cl/leychile/navegar?idNorma=29390)

Hechos verificados contra el corpus el 2026-07-16 (333.020 normas):
Ley Karin = `otras/21643`, id_norma 1200096, publicada 2024-01-15, 2 versiones
(la segunda por Ley 21.724 el 2025-01-03), modifica 5 cuerpos legales con fecha
2024-08-01. Ley 21.719 = `otras/21719`, id_norma 1209272, publicada 2024-12-13,
modificada por Ley 21.755 (2025-07-11) y Ley 21.806 (2026-02-05).
