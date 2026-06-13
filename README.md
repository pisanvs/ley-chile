<div align="center">

# ley-chile

**Una historia de git del corpus jurídico chileno.**
Un commit por cada versión publicada de cada ley, desde 1810 hasta hoy.

[![Pipeline](https://github.com/pisanvs/ley-chile/actions/workflows/pipeline.yml/badge.svg)](https://github.com/pisanvs/ley-chile/actions/workflows/pipeline.yml)
[![Branch de datos](https://img.shields.io/badge/branch-historial-blue?logo=git)](https://github.com/pisanvs/ley-chile/tree/historial)
[![Licencia](https://img.shields.io/badge/licencia-MIT-green)](#licencia)

[**Ver el historial →**](https://github.com/pisanvs/ley-chile/tree/historial)

</div>

---

<!-- PIPELINE_STATUS_START -->
## Pipeline Status
| | |
|---|---|
| **Historial** | `███████████████████░` 95% · watermark 2026-05-29 · 339,059 normas |
| **Cache**     | `████████████████████` 100% · 357,257 / 358,221 normas fetched |
| **Last run**  | 2026-06-10 11:28 UTC |
<!-- PIPELINE_STATUS_END -->

<!-- GRAPH_STATUS_START -->
## Graph Build Status
| | |
|---|---|
| **Fetch normas** | `████████████████████` 100% · 357,259 / 358,221 normas · complete ✅ |
| **Last run**     | 2026-06-01 10:39 UTC |
<!-- GRAPH_STATUS_END -->

> **Cómo leer las barras.**
> *Graph Build Status* sigue la construcción única del grafo de metadatos (`graph.json`): `fetch_normas.py` descarga la metadata de las ~358 mil normas del catálogo BCN en tandas de 6 horas, y la barra avanza en cada corrida del workflow `update-graph`. Al llegar a ~95% el grafo se publica y se habilita la fase siguiente.
> *Pipeline Status* sigue lo que viene después: cuántas normas tienen ya su historial de versiones reconstruido en la branch `historial`.
> Este repo aún está en proceso de germinación. Lo entretenido llega al terminar esta fase.

---

## Por qué existe este proyecto

El sistema [LeyChile](https://www.bcn.cl/leychile) de la BCN publica *textos refundidos* — versiones consolidadas que incorporan todas las modificaciones — **sin diffs históricos**. Saber exactamente qué cambió, cuándo y por qué requiere comparar a mano los PDFs de cada versión, una tarea tediosa y propensa a errores.

Este repositorio reconstruye ese historial perdido reescribiéndolo como un repo git: **cada versión de cada ley es un commit**, ordenado cronológicamente, con mensajes que enlazan modificadoras y modificadas. Eso convierte dos siglos de legislación chilena en algo que `git log`, `git blame` y `git diff` pueden recorrer.

| Qué resuelve | Cómo lo resuelve |
|---|---|
| LeyChile no muestra diffs entre versiones de una ley | Cada versión es un commit; `git diff` muestra el cambio real |
| El texto vigente no dice qué ley introdujo cada cambio | El cuerpo del commit nombra la ley modificadora y enlaza al boletín del SIL |
| El orden de promulgación se pierde en el corpus consolidado | `rebuild_history.py` reordena por `(fecha, grupo, rango, seq)` |
| No hay forma estable de citar una ley *en un momento dado* | Cada commit es un SHA estable: el texto vigente al `2009-04-15`, por ejemplo |

---

## Arquitectura: dos branches, dos worktrees

```
┌─────────────────────┐          ┌─────────────────────┐
│  branch: main       │          │  branch: historial  │
│  (código)           │          │  (datos, huérfana)  │
├─────────────────────┤          ├─────────────────────┤
│  scripts/           │  drives  │  leyes/             │
│  tests/             │ ───────▶ │  modificaciones/    │
│  requirements.txt   │          │  graph.json         │
│  .github/workflows/ │          │  (un commit por     │
└─────────────────────┘          │   versión de ley)   │
                                 └─────────────────────┘
```

- **`main`** — sólo scripts, tests y configuración CI. Nunca contiene datos de leyes.
- **`historial`** — branch huérfana, datos reconstruidos cronológicamente por `rebuild_history.py`. Vive en el worktree `./historial/`.

### Layout de `main`

```
ley-chile/
├── scripts/
│   ├── trace_graph.py        # construye el grafo y descarga versiones
│   ├── rebuild_history.py    # reescribe el historial git en orden cronológico
│   ├── sync_daily.py         # detecta normas nuevas y resincroniza
│   └── fetch_tramitacion.py  # descarga sesiones y votaciones del SIL
├── tests/                    # cobertura de funciones puras (sin red ni git)
├── requirements.txt
└── pytest.ini
```

### Layout de `historial/`

```
historial/
├── leyes/{numero}/
│   ├── texto.md            # texto de ley en markdown normalizado
│   ├── metadata.json       # idNorma, tipo, organismo, fechas, estado
│   ├── versiones.json      # todas las versiones fechadas (committed: true/false)
│   └── tramitacion.json    # datos del SIL (opcional)
├── modificaciones/{numero}/  # leyes cuyo objeto principal es modificar otras
└── graph.json              # grafo de dependencias entre leyes
```

---

## Configuración inicial

```bash
# 1. Instalar dependencias
pip install -r requirements.txt

# 2. Crear la branch huérfana de datos (sólo la primera vez)
git checkout --orphan historial
git rm -rf .
git commit --allow-empty -m "init: historial branch"
git checkout -

# 3. Anclar el worktree
git worktree add historial historial
```

Después de esto, `./historial/` apunta a la branch `historial` y los scripts detectan automáticamente la ruta vía `LEYCHILE_DATA_ROOT`, presencia del worktree, o fallback al directorio raíz (modo legado).

---

## Scripts principales

### `trace_graph.py` — construir el grafo y descargar versiones

```bash
LEYCHILE_DATA_ROOT=./historial python scripts/trace_graph.py --id 235507 --ley 20000
```

Construye el grafo completo de dependencias a partir de una ley raíz y descarga todas las versiones encontradas.

- Traza **hacia atrás** (leyes derogadas/reemplazadas) y **hacia adelante** (modificadoras).
- Usa datos enlazados de [datos.bcn.cl](https://datos.bcn.cl) para el grafo de relaciones.
- Escribe `graph.json` y un commit git por cada versión de cada ley.
- **Idempotente**: versiones ya comprometidas (`committed: true`) se saltan.

---

### `rebuild_history.py` — reordenar cronológicamente

```bash
LEYCHILE_DATA_ROOT=./historial python scripts/rebuild_history.py

# Vista previa (no escribe nada)
LEYCHILE_DATA_ROOT=./historial python scripts/rebuild_history.py --dry-run
```

Reescribe el historial git en orden cronológico usando `git fast-import`.

- Agrupa todos los eventos `feat`/`update`/`derog` del mismo día y norma en un solo commit.
- Inyecta datos de tramitación parlamentaria en el cuerpo del commit si existe `tramitacion.json`.
- Ordena por `(fecha, grupo, rango, seq)` donde rango: `0=feat`, `1=update`, `2=derog`.

---

### `sync_daily.py` — sincronización diaria

```bash
LEYCHILE_DATA_ROOT=./historial python scripts/sync_daily.py

# Variantes
... sync_daily.py --dry-run        # vista previa sin escribir
... sync_daily.py --skip-rebuild   # no reordena (más rápido, útil en pruebas)
... sync_daily.py --days 7         # ampliar la ventana de búsqueda en opt=40
```

Detecta leyes nuevas y versiones nuevas, y reconstruye el historial cronológico.

<details>
<summary><b>Pasos internos</b></summary>

1. Carga `graph.json` desde `DATA_ROOT`.
2. Consulta LeyChile `opt=40` para detectar normas despachadas recientemente.
3. Filtra candidatas `modificatoria` no conocidas; confirma vía BCN JSON que modifican la cadena primaria.
4. Re-traza todas las leyes en el grafo (idempotente).
5. Actualiza `graph.json` con un commit.
6. Ejecuta `rebuild_history.rebuild()` para reordenar cronológicamente.

Sale con código `1` si ocurre algún error durante el proceso.
</details>

---

### `fetch_tramitacion.py` — datos parlamentarios

```bash
python scripts/fetch_tramitacion.py --numero 20000

# Si el boletín ya se conoce, evita el lookup
python scripts/fetch_tramitacion.py --numero 20000 --boletin 3182
```

Descarga sesiones y votos del SIL y la Cámara para una ley y escribe `{directorio_ley}/tramitacion.json`.

---

## Formato de commits

```text
feat(ley):   Ley 20000 publicada
update(ley): Ley 20000 modificada por Ley 20502 — versión 2011-02-21
derog(ley):  Ley 19366 derogada → Ley 20000
chore(meta): actualizar graph.json
```

| Tipo | Significado |
|---|---|
| `feat` | Primera versión de una ley |
| `update` | Modificación posterior |
| `derog` | Derogación |
| `fix` | Corrección de datos |

### Ejemplo de cuerpo de commit

```text
LEY SOBRE TRÁFICO ILÍCITO DE ESTUPEFACIENTES Y SUSTANCIAS PSICOTRÓPICAS

BCN idNorma=235507
Publicación: 2005-02-16

Boletín: 3182-07
Trámite: Promulgación — Senado
Sesión 47, Senado, 2004-12-15
Votación: 67 a favor · 12 en contra · 3 abstenciones (Aprobado)

Modifica: Ley 18403, Ley 19366
```

---

## Detección automática de `DATA_ROOT`

Los scripts buscan dónde viven los datos en este orden:

1. Variable de entorno `LEYCHILE_DATA_ROOT` *(máxima prioridad)*.
2. Worktree `./historial/` si existe y tiene `.git`.
3. Raíz del repositorio *(modo legado)*.

---

## Fuentes de datos

| Fuente | Endpoint | Rate limit |
|---|---|---|
| LeyChile XML | `https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma={id}&idVersion={YYYY-MM-DD}` | 1 req/s |
| BCN datos enlazados | `https://datos.bcn.cl/recurso/cl/ley/{numero}/datos.json` | 0.3 req/s |
| Senado tramitación | `https://tramitacion.senado.cl/wspublico/tramitacion.php?boletin={num}` | sin API oficial |
| Cámara votaciones | `https://opendata.congreso.cl/wscamaradiputados.asmx/getVotaciones_Boletin` | SOAP POST |

> **Fecha centinela.** LeyChile usa `2222-02-02` para versiones "vigentes". El filtro `int(d[:4]) <= 2100` la descarta.
>
> **Filtro de tipo.** Sólo se incluyen normas con `tipo == "Ley"` — quedan fuera DFL, Decretos Supremos, etc.

---

## Clasificación de leyes

- **`sustantiva`** — ley con materia propia → `leyes/{numero}/`
- **`modificatoria`** — ley cuyo objeto principal es modificar otras leyes → `modificaciones/{numero}/`

La clasificación se basa en si el título comienza con prefijos como `MODIFICA`, `INTRODUCE MODIFICACIONES`, `DEROGA`, etc.

---

## Tests

```bash
pip install pytest
python -m pytest
```

Cobertura: funciones puras de los scripts principales (parse, clasificación, XML, commits, agrupación de eventos). **Sin red ni git.**

---

## Proyectos similares

- [Free Law Project](https://free.law/) — jurisprudencia federal de EE. UU.
- [DC Council law-html](https://github.com/DCCouncil/law-html) — Código del Distrito de Columbia, en git
- [nickvido/us-code](https://github.com/nickvido/us-code)

---

## Licencia

Los textos legales son **documentos públicos del Estado de Chile**.
Los scripts de este repositorio se distribuyen bajo licencia **MIT**.
