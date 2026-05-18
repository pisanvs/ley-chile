# ley-chile

Repositorio git que registra el corpus jurídico chileno completo, con actualizaciones diarias desde el Diario Oficial e historial de diferencias de cada cambio legislativo.

## Por qué existe este proyecto

El sistema [LeyChile](https://www.bcn.cl/leychile) de la BCN contiene ~392.000 *normas* (leyes, decretos, DFL, reglamentos, ordenanzas, etc.) actualizadas diariamente desde el Diario Oficial. La BCN publica *textos refundidos* — textos consolidados que incorporan todas las modificaciones — por lo que su API siempre devuelve el texto vigente fusionado, sin diffs históricos. Este repositorio reconstruye ese historial de cambios haciendo un commit de cada versión a medida que se modifica.

## Estructura del repositorio

```
ley-chile/
├── leyes/{numero}/
│   ├── texto.md          # texto normalizado en markdown desde el XML
│   ├── metadata.json     # idNorma, tipo, organismo, fechas, estado
│   └── versiones.json    # todas las versiones fechadas en BCN
├── decretos/{tipo}/      # dto, dfl, ds, etc.
├── reglamentos/
├── ordenanzas/
├── tramitacion/{boletin}/
│   ├── historial.json    # todas las etapas en SIL
│   └── sesiones.json     # datos de sesiones vinculadas
├── scripts/
│   ├── fetch_norma.py        # descarga una norma por idNorma
│   ├── sync_daily.py         # cron: consulta opt=40, descarga y hace commit
│   ├── bootstrap_catalog.py  # ejecución única: crawl SPARQL para construir index.json
│   ├── bootstrap_texts.py    # ejecución única: descarga todos los textos del catálogo
│   ├── build_commit.py       # genera mensajes de commit semánticos desde metadata
│   └── sparql_helpers.py     # helpers SPARQL con lógica de reintentos
├── index.json            # catálogo completo: idNorma → metadata
└── CHANGELOG.md          # resumen diario generado automáticamente
```

## Fuentes de datos

### 1. Servicio web XML de LeyChile (fuente principal)

No requiere autenticación.

| Endpoint | Descripción |
|---|---|
| `GET /Consulta/obtxml?opt=7&idNorma={id}` | XML completo de una norma por ID BCN |
| `GET /Consulta/obtxml?opt=40` | Normas despachadas recientemente (sincronización diaria) |
| `GET /Navegar?idNorma={id}` | Texto completo en HTML (alternativa) |

El `idNorma` es el ID numérico interno de la BCN, no el número de ley. Ejemplo: Ley 20000 → `idNorma=206396`.

### 2. datos.bcn.cl — Datos abiertos enlazados + SPARQL

```
Endpoint: http://datos.bcn.cl/sparql
```

Se usa para el crawl masivo del catálogo y para el acceso a versiones históricas. Agregar `.datos.json`, `.datos.rdf` o `.datos.ttl` a cualquier URI de recurso para obtener formatos legibles por máquina.

Acceso a versión específica de una norma: `http://datos.bcn.cl/recurso/cl/ley/{organismo}/{fecha}/{numero}/es@{version-date}`

### 3. SIL — Sistema de Información Legislativa

Sin API oficial; se requiere scraping para votos, datos de sesiones e informes de comisión.

## Formato de commits

```
feat(ley): Ley 21680 actualizada — versión 2026-05-17

Fuente: Diario Oficial / BCN idNorma=1182340
Modifica: Arts. 3, 17, 42 de la Ley 20.936
Trámite: Boletín 14220-03, despachado 2026-05-15
Sesión: Cámara, 28ª ordinaria, 2026-05-13
```

Tipos de commit: `feat` (norma nueva), `update` (modificación a norma existente), `derog` (derogación), `fix` (corrección de la BCN).

## Primeros pasos

```bash
pip install -r requirements.txt

# Construir el catálogo completo de normas desde SPARQL (ejecutar una vez)
python scripts/bootstrap_catalog.py

# Descargar textos de todas las normas en index.json (ejecutar una vez, demora días)
python scripts/bootstrap_texts.py

# Descargar una norma específica por ID BCN
python scripts/fetch_norma.py --id 206396

# Ejecutar la sincronización diaria manualmente
python scripts/sync_daily.py
```

## Límites de velocidad

LeyChile no documenta límites de velocidad, pero un crawl sin restricciones arriesga bloqueo de IP. Los scripts usan por defecto **≤1 solicitud/seg**. El endpoint SPARQL de `datos.bcn.cl` tiene caídas intermitentes; todas las consultas incluyen lógica de reintentos con backoff exponencial.

## Proyectos similares

- [Free Law Project](https://free.law/) — descarga masiva de jurisprudencia federal de EE. UU.
- [DC Council law-html](https://github.com/DCCouncil/law-html) — Código del Distrito de Columbia en git
- [nickvido/us-code](https://github.com/nickvido/us-code)

## Licencia

Los textos legales son documentos públicos oficiales del Estado de Chile. Los scripts de este repositorio se distribuyen bajo licencia MIT.
