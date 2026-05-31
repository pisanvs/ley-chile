# ley-chile

[LINK AL BRANCH CON DATOS](https://github.com/pisanvs/ley-chile/tree/historial)

Repositorio git que reconstruye el historial completo de cambios en el corpus jurídico chileno, haciendo un commit por cada versión publicada de cada ley.

<!-- PIPELINE_STATUS_START -->
## Pipeline Status
| | |
|---|---|
| **Historial** | `████████████████████` 99% · watermark 2026-05-31 · 353,513 normas |
| **Cache**     | `░░░░░░░░░░░░░░░░░░░░` 0% · 1,708 / 357,259 normas fetched |
| **Last run**  | 2026-05-31 04:35 UTC |
<!-- PIPELINE_STATUS_END -->

<!-- GRAPH_STATUS_START -->
## Graph Build Status
| | |
|---|---|
| **Fetch normas** | `████████████████░░░░` 81% · 288,771 / 358,221 normas · fetching… |
| **Last run**     | 2026-05-31 01:01 UTC |
<!-- GRAPH_STATUS_END -->

> **Sobre estas barras.** *Graph Build Status* sigue la construcción única del grafo de metadatos (`graph.json`): `fetch_normas.py` descarga la metadata de las ~358 mil normas del catálogo BCN en tandas de 6 horas, y la barra avanza en cada corrida del workflow `update-graph`. Al llegar al ~95% el grafo se publica y se habilita la fase siguiente. *Pipeline Status* sigue lo que viene después: cuántas normas tienen ya su historial de versiones reconstruido en la branch `historial`. Este repo aún está en proceso de germinación. Lo entretenido llega al terminar esta fase!

## Por qué existe este proyecto

El sistema [LeyChile](https://www.bcn.cl/leychile) de la BCN publica *textos refundidos* — versiones consolidadas que incorporan todas las modificaciones — sin diffs históricos. Este repositorio reconstruye ese historial de cambios haciendo un commit de cada versión de cada ley a medida que fue modificándose.

## Estructura del repositorio

El repositorio usa un diseño de dos branches:

- **branch de código** (`main`): contiene sólo scripts, requisitos y configuración CI. Nunca contiene datos de leyes.
- **branch de datos** (`historial`, branch huérfana): contiene los commits de leyes, reconstruidos cronológicamente por `rebuild_history.py`.

```
ley-chile/
├── scripts/
│   ├── trace_graph.py        # construye el grafo legislativo y descarga versiones
│   ├── rebuild_history.py    # reescribe el historial git en orden cronológico
│   └── fetch_tramitacion.py  # descarga datos de tramitación parlamentaria
├── tests/
│   ├── conftest.py
│   ├── test_trace_graph.py
│   ├── test_fetch_tramitacion.py
│   └── test_rebuild_history.py
├── requirements.txt
└── pytest.ini
```

Los datos viven en el worktree `historial/`:

```
historial/
├── leyes/{numero}/
│   ├── texto.md          # texto de ley en markdown normalizado
│   ├── metadata.json     # idNorma, tipo, organismo, fechas, estado
│   ├── versiones.json    # todas las versiones fechadas (committed: true/false)
│   └── tramitacion.json  # datos del SIL (opcional)
├── modificaciones/{numero}/   # leyes cuyo objeto principal es modificar otras leyes
└── graph.json            # grafo de dependencias entre leyes
```

## Configuración

```bash
pip install -r requirements.txt
```

Crear el worktree de datos (primera vez):

```bash
git checkout --orphan historial
git rm -rf .
git commit --allow-empty -m "init: historial branch"
git checkout -
git worktree add historial historial
```

## Scripts principales

### trace_graph.py

Construye el grafo completo de dependencias a partir de una ley raíz y descarga todas las versiones.

```bash
LEYCHILE_DATA_ROOT=./historial python scripts/trace_graph.py --id 235507 --ley 20000
```

- Traza hacia atrás (leyes derogadas/reemplazadas) y hacia adelante (modificadoras).
- Usa datos enlazados de [datos.bcn.cl](https://datos.bcn.cl) para el grafo de relaciones.
- Escribe `graph.json` y un commit git por cada versión de cada ley.
- Es idempotente: versiones ya comprometidas (`committed: true`) se saltan.

### rebuild_history.py

Reescribe el historial git en orden cronológico usando `git fast-import`.

```bash
LEYCHILE_DATA_ROOT=./historial python scripts/rebuild_history.py

# Ver la lista de eventos sin escribir nada
LEYCHILE_DATA_ROOT=./historial python scripts/rebuild_history.py --dry-run
```

- Agrupa todos los eventos `feat`/`update`/`derog` del mismo día y norma en un solo commit.
- Inyecta datos de tramitación parlamentaria en el cuerpo del commit si existe `tramitacion.json`.
- Ordena por `(fecha, grupo, rango, seq)` donde rango: 0=feat, 1=update, 2=derog.

### sync_daily.py

Sincronización diaria: detecta leyes nuevas y versiones nuevas, y reconstruye el historial cronológico.

```bash
LEYCHILE_DATA_ROOT=./historial python scripts/sync_daily.py

# Vista previa sin modificar nada
LEYCHILE_DATA_ROOT=./historial python scripts/sync_daily.py --dry-run

# Sin reescribir el historial (más rápido, útil en pruebas)
LEYCHILE_DATA_ROOT=./historial python scripts/sync_daily.py --skip-rebuild

# Ampliar la ventana de búsqueda en opt=40
LEYCHILE_DATA_ROOT=./historial python scripts/sync_daily.py --days 7
```

Pasos internos:
1. Carga `graph.json` desde DATA_ROOT.
2. Consulta LeyChile `opt=40` para detectar normas despachadas recientemente.
3. Filtra candidatas `modificatoria` no conocidas; confirma vía BCN JSON que modifican la cadena primaria.
4. Retrace de todas las leyes en el grafo (idempotente).
5. Actualiza `graph.json` con un commit.
6. Ejecuta `rebuild_history.rebuild()` para reordenar cronológicamente.

Sale con código 1 si ocurre algún error durante el proceso.

### fetch_tramitacion.py

Descarga datos de tramitación (sesiones, votos) del SIL y la Cámara para una ley.

```bash
python scripts/fetch_tramitacion.py --numero 20000
# Con boletín conocido:
python scripts/fetch_tramitacion.py --numero 20000 --boletin 3182
```

Escribe `{directorio_ley}/tramitacion.json`.

## Formato de commits

```
feat(ley): Ley 20000 publicada
update(ley): Ley 20000 modificada por Ley 20502 — versión 2011-02-21
derog(ley): Ley 19366 derogada → Ley 20000
chore(meta): actualizar graph.json
```

Tipos: `feat` (primera versión), `update` (modificación), `derog` (derogación), `fix` (corrección).

### Ejemplo de cuerpo de commit

```
LEY SOBRE TRÁFICO ILÍCITO DE ESTUPEFACIENTES Y SUSTANCIAS PSICOTRÓPICAS

BCN idNorma=235507
Publicación: 2005-02-16

Boletín: 3182-07
Trámite: Promulgación — Senado
Sesión 47, Senado, 2004-12-15
Votación: 67 a favor · 12 en contra · 3 abstenciones (Aprobado)

Modifica: Ley 18403, Ley 19366
```

## Detección automática de DATA_ROOT

Ambos scripts detectan automáticamente dónde viven los datos:

1. Variable de entorno `LEYCHILE_DATA_ROOT` (prioridad máxima).
2. Worktree `./historial/` si existe y tiene `.git`.
3. Raíz del repositorio (modo legado).

## Fuentes de datos

| Fuente | Endpoint | Notas |
|--------|---------|-------|
| LeyChile XML | `https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma={id}&idVersion={YYYY-MM-DD}` | Límite: 1 req/s |
| BCN datos enlazados | `https://datos.bcn.cl/recurso/cl/ley/{numero}/datos.json` | Límite: 0.3 req/s |
| Senado tramitación | `https://tramitacion.senado.cl/wspublico/tramitacion.php?boletin={num}` | Sin API oficial |
| Cámara votaciones | `https://opendata.congreso.cl/wscamaradiputados.asmx/getVotaciones_Boletin` | SOAP POST |

**Fecha centinela**: LeyChile usa `2222-02-02` para versiones "vigentes". El filtro `int(d[:4]) <= 2100` la descarta.

**Filtro de tipo**: Sólo se incluyen normas con `tipo == "Ley"` — excluye DFL, Decretos Supremos, etc.

## Clasificación de leyes

- `sustantiva`: ley con materia propia → `leyes/{numero}/`
- `modificatoria`: ley cuyo objeto principal es modificar otras leyes → `modificaciones/{numero}/`

La clasificación se basa en si el título comienza con prefijos como `MODIFICA`, `INTRODUCE MODIFICACIONES`, `DEROGA`, etc.

## Tests

```bash
pip install pytest
python -m pytest
```

Los tests cubren todas las funciones puras de los tres scripts (parse, clasificación, XML, commits, agrupación de eventos) sin requerir red ni git.

## Proyectos similares

- [Free Law Project](https://free.law/) — jurisprudencia federal de EE. UU.
- [DC Council law-html](https://github.com/DCCouncil/law-html) — Código del Distrito de Columbia en git
- [nickvido/us-code](https://github.com/nickvido/us-code)

## Licencia

Los textos legales son documentos públicos del Estado de Chile. Los scripts se distribuyen bajo licencia MIT.
