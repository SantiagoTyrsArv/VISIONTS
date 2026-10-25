# Reporte de vulnerabilidades — VISIONTS

- **Fecha del escaneo:** 2026-10-23
- **Herramienta:** [OSV-Scanner](https://github.com/google/osv-scanner) 2.7.0 (`osv-scanner scan source -r .`)
- **Paquetes vulnerables:** 13
- **Vulnerabilidades únicas (agrupando alias):** 22

| Severidad | Cantidad |
|---|---|
| 🔴 Crítica | 4 |
| 🟠 Alta | 6 |
| 🟡 Media | 10 |
| 🟢 Baja | 2 |

## Estado: corregido (2026-10-25)

Nuevo escaneo con OSV-Scanner y `npm audit`: **0 vulnerabilidades**.

- **Backend:** mínimos explícitos para las dependencias transitivas en `requirements.txt` (`anyio>=4.14.2`, `h11>=0.16.0`, `idna>=3.15`) y `requirements-dev.txt` (`certifi>=2026.10.19`, `pygments>=2.20.0`).
- **Escritorio:** `vite` 7.3.7, `vitest` 5.0.5, `zod` 4.6.7 y `electron` 44.9.3; `npm audit fix` subió las transitivas (`follow-redirects` 1.16.1, `source-map-js` 1.2.2, `http-cache-semantics` 4.3.0, que ya tiene versión corregida). `npm audit` detectó además `electron` <44.9.1, `undici` y `fast-uri`, que OSV no marcaba; también quedaron corregidas.
- **Training:** OSV no puede resolver `training/requirements.txt` (`torch==2.14.1+cpu` vive en el índice de PyTorch), así que esa carpeta no queda cubierta por el escaneo.

## Resumen y plan de corrección

| ☐ | Paquete | Versión actual | Ecosistema | Archivo | Máx. severidad | Vulns | Actualizar a ≥ |
|---|---|---|---|---|---|---|---|
| ☑ | `anyio` | 4.9.0 | PyPI | `backend\requirements-dev.txt` | 🔴 Crítica | 2 | 4.14.2 |
| ☑ | `certifi` | 2026.7.22 | PyPI | `backend\requirements-dev.txt` | 🔴 Crítica | 1 | 2026.10.19 |
| ☑ | `anyio` | 4.9.0 | PyPI | `backend\requirements.txt` | 🔴 Crítica | 2 | 4.14.2 |
| ☑ | `h11` | 0.9.0 | PyPI | `backend\requirements.txt` | 🔴 Crítica | 1 | 0.16.0 |
| ☑ | `follow-redirects` | 1.16.0 | npm | `desktop\package-lock.json` | 🟠 Alta | 2 | 1.16.1 |
| ☑ | `http-cache-semantics` | 4.2.0 | npm | `desktop\package-lock.json` | 🟠 Alta | 1 | — |
| ☑ | `source-map-js` | 1.2.1 | npm | `desktop\package-lock.json` | 🟠 Alta | 1 | 1.2.2 |
| ☑ | `vite` | 7.3.6 | npm | `desktop\package-lock.json` | 🟠 Alta | 5 | 7.3.7 |
| ☑ | `zod` | 4.6.5 | npm | `desktop\package-lock.json` | 🟠 Alta | 1 | 4.6.6 |
| ☑ | `idna` | 3.9.0 | PyPI | `backend\requirements-dev.txt` | 🟡 Media | 1 | 3.15 |
| ☑ | `pygments` | 2.9.0 | PyPI | `backend\requirements-dev.txt` | 🟡 Media | 2 | 2.20.0 |
| ☑ | `idna` | 3.9.0 | PyPI | `backend\requirements.txt` | 🟡 Media | 1 | 3.15 |
| ☑ | `@vitest/mocker` | 5.0.2 | npm | `desktop\package-lock.json` | 🟡 Media | 2 | 5.0.3 |

## Detalle por paquete

### `anyio` 4.9.0 (PyPI)

- **Archivo:** `backend\requirements-dev.txt`
- **Versión mínima que corrige todo:** 4.14.2
- **Cómo arreglarlo:** Cambiar en `backend/requirements-dev.txt` a `anyio>=4.14.2` y reinstalar con `pip install -r requirements-dev.txt`

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [PYSEC-2026-4025](https://github.com/advisories/GHSA-82r6-8w77-94w6) | CVE-2026-63374, GHSA-82r6-8w77-94w6 | 🔴 Crítica (9.3) | 4.14.2 | AnyIO: TLSStream IDNA 2003 host name encoding enables potential TLS certificate spoofing |
| [PYSEC-2026-4024](https://github.com/advisories/GHSA-5p39-cfhj-2xmp) | CVE-2026-64847, GHSA-5p39-cfhj-2xmp | 🟡 Media (6.8) | 4.14.2 | AnyIO process-pool workers can block indefinitely on undrained stderr |

### `certifi` 2026.7.22 (PyPI)

- **Archivo:** `backend\requirements-dev.txt`
- **Versión mínima que corrige todo:** 2026.10.19
- **Cómo arreglarlo:** Cambiar en `backend/requirements-dev.txt` a `certifi>=2026.10.19` y reinstalar con `pip install -r requirements-dev.txt`

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [PYSEC-2026-4320](https://github.com/advisories/GHSA-6q48-6c7w-9gw2) | GHSA-6q48-6c7w-9gw2 | 🔴 Crítica (9.1) | 2026.10.19 | certifi bundles emSign root CAs with compromised intermediate CA keys |

### `anyio` 4.9.0 (PyPI)

- **Archivo:** `backend\requirements.txt`
- **Versión mínima que corrige todo:** 4.14.2
- **Cómo arreglarlo:** Cambiar en `backend/requirements.txt` a `anyio>=4.14.2` y reinstalar con `pip install -r requirements.txt`

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [PYSEC-2026-4025](https://github.com/advisories/GHSA-82r6-8w77-94w6) | CVE-2026-63374, GHSA-82r6-8w77-94w6 | 🔴 Crítica (9.3) | 4.14.2 | AnyIO: TLSStream IDNA 2003 host name encoding enables potential TLS certificate spoofing |
| [PYSEC-2026-4024](https://github.com/advisories/GHSA-5p39-cfhj-2xmp) | CVE-2026-64847, GHSA-5p39-cfhj-2xmp | 🟡 Media (6.8) | 4.14.2 | AnyIO process-pool workers can block indefinitely on undrained stderr |

### `h11` 0.9.0 (PyPI)

- **Archivo:** `backend\requirements.txt`
- **Versión mínima que corrige todo:** 0.16.0
- **Cómo arreglarlo:** Cambiar en `backend/requirements.txt` a `h11>=0.16.0` y reinstalar con `pip install -r requirements.txt`

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [PYSEC-2026-348](https://nvd.nist.gov/vuln/detail/CVE-2025-43859) | CVE-2025-43859, GHSA-vqfr-h8mv-ghfj | 🔴 Crítica (9.1) | 0.16.0 | h11 accepts some malformed Chunked-Encoding bodies |

### `follow-redirects` 1.16.0 (npm)

- **Archivo:** `desktop\package-lock.json`
- **Versión mínima que corrige todo:** 1.16.1
- **Cómo arreglarlo:** `npm install follow-redirects@^1.16.1` (o `npm audit fix`; si es transitiva, usar `overrides` en package.json)

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [GHSA-8r9p-f939-6h3c](https://nvd.nist.gov/vuln/detail/CVE-2026-111755) | CVE-2026-111755 | 🟠 Alta (8.2) | 1.16.1 | follow-redirects sensitiveHeaders regex escaping can expose credential headers |
| [GHSA-q3jh-wrc6-jgq8](https://osv.dev/vulnerability/GHSA-q3jh-wrc6-jgq8) | CVE-2026-111756 | 🟠 Alta (8.2) | 1.16.1 | follow-redirects array-form headers bypass cross-origin credential stripping |

### `http-cache-semantics` 4.2.0 (npm)

- **Archivo:** `desktop\package-lock.json`
- **Versión mínima que corrige todo:** no disponible
- **Cómo arreglarlo:** Sin versión corregida publicada; evaluar reemplazo o mitigación.

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [GHSA-ch52-4w7c-c8xp](https://nvd.nist.gov/vuln/detail/CVE-2026-93748) | CVE-2026-93748 | 🟠 Alta (8.7) | — | http-cache-semantics max-stale handling can disclose cross-user cached responses |

### `source-map-js` 1.2.1 (npm)

- **Archivo:** `desktop\package-lock.json`
- **Versión mínima que corrige todo:** 1.2.2
- **Cómo arreglarlo:** `npm install source-map-js@^1.2.2` (o `npm audit fix`; si es transitiva, usar `overrides` en package.json)

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [GHSA-68fv-2mgg-jv7q](https://nvd.nist.gov/vuln/detail/CVE-2026-93749) | CVE-2026-93749 | 🟠 Alta (8.7) | 1.2.2 | source-map-js allows event-loop denial of service through indexed source-map section offsets |

### `vite` 7.3.6 (npm)

- **Archivo:** `desktop\package-lock.json`
- **Versión mínima que corrige todo:** 7.3.7
- **Cómo arreglarlo:** `npm install vite@^7.3.7` (o `npm audit fix`; si es transitiva, usar `overrides` en package.json)

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [GHSA-587h-7wmj-h5pm](https://nvd.nist.gov/vuln/detail/CVE-2026-112942) | CVE-2026-112942 | 🟠 Alta (7.5) | 7.3.7 | launch-editor: `fs.existsSync()` existence check can be bypassed on Windows |
| [GHSA-698v-4r3x-3vcv](https://nvd.nist.gov/vuln/detail/CVE-2026-112943) | CVE-2026-112943 | 🟡 Media (6.3) | 7.3.7 | launch-editor: escapeCmdArgs() omits % escaping on Windows |
| [GHSA-r825-w8mm-5pxw](https://nvd.nist.gov/vuln/detail/CVE-2026-112944) | CVE-2026-112944 | 🟡 Media (6.3) | 7.3.7 | launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution for some editors |
| [GHSA-rq7h-c2jc-7f22](https://nvd.nist.gov/vuln/detail/CVE-2026-112946) | CVE-2026-112946 | 🟡 Media (6.3) | 7.3.7 | Vite: Files outside `server.fs.allow` could be served when project paths match system paths on non-Windows machine |
| [GHSA-9jrq-w75r-8gcw](https://nvd.nist.gov/vuln/detail/CVE-2026-112945) | CVE-2026-112945 | 🟢 Baja (2.1) | 7.3.7 | Vite: Cross origin script execution through Vite custom middleware |

### `zod` 4.6.5 (npm)

- **Archivo:** `desktop\package-lock.json`
- **Versión mínima que corrige todo:** 4.6.6
- **Cómo arreglarlo:** `npm install zod@^4.6.6` (o `npm audit fix`; si es transitiva, usar `overrides` en package.json)

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [GHSA-mrhx-c7xc-m3w5](https://nvd.nist.gov/vuln/detail/CVE-2023-54404) | CVE-2023-54404 | 🟠 Alta (8.2) | 4.6.6 | Zod can exhaust memory while validating oversized constrained collections |

### `idna` 3.9.0 (PyPI)

- **Archivo:** `backend\requirements-dev.txt`
- **Versión mínima que corrige todo:** 3.15
- **Cómo arreglarlo:** Cambiar en `backend/requirements-dev.txt` a `idna>=3.15` y reinstalar con `pip install -r requirements-dev.txt`

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [PYSEC-2026-215](https://github.com/kjd/idna/security/advisories/GHSA-65pc-fj4g-8rjx) | CVE-2026-45409, GHSA-65pc-fj4g-8rjx | 🟡 Media (6.9) | 3.15 | Internationalized Domain Names in Applications (IDNA) for Python provides support for Internationalized Domain Names in Applications (IDNA) and Unicode IDNA Compatibility Processing. In versions prior |

### `pygments` 2.9.0 (PyPI)

- **Archivo:** `backend\requirements-dev.txt`
- **Versión mínima que corrige todo:** 2.20.0
- **Cómo arreglarlo:** Cambiar en `backend/requirements-dev.txt` a `pygments>=2.20.0` y reinstalar con `pip install -r requirements-dev.txt`

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [PYSEC-2023-117](https://github.com/advisories/GHSA-mrwq-x4v8-fh7p) | CVE-2022-40896, GHSA-mrwq-x4v8-fh7p | 🟡 Media (6.8) | 2.15.1 | A ReDoS issue was discovered in pygments/lexers/smithy.py in pygments through 2.15.0 via SmithyLexer. |
| [PYSEC-2026-2987](https://nvd.nist.gov/vuln/detail/CVE-2026-4539) | CVE-2026-4539, GHSA-5239-wwwm-4pmq | 🟢 Baja (3.3) | 2.20.0 | Pygments has Regular Expression Denial of Service (ReDoS) due to Inefficient Regex for GUID Matching |

### `idna` 3.9.0 (PyPI)

- **Archivo:** `backend\requirements.txt`
- **Versión mínima que corrige todo:** 3.15
- **Cómo arreglarlo:** Cambiar en `backend/requirements.txt` a `idna>=3.15` y reinstalar con `pip install -r requirements.txt`

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [PYSEC-2026-215](https://github.com/kjd/idna/security/advisories/GHSA-65pc-fj4g-8rjx) | CVE-2026-45409, GHSA-65pc-fj4g-8rjx | 🟡 Media (6.9) | 3.15 | Internationalized Domain Names in Applications (IDNA) for Python provides support for Internationalized Domain Names in Applications (IDNA) and Unicode IDNA Compatibility Processing. In versions prior |

### `@vitest/mocker` 5.0.2 (npm)

- **Archivo:** `desktop\package-lock.json`
- **Versión mínima que corrige todo:** 5.0.3
- **Cómo arreglarlo:** `npm install @vitest/mocker@^5.0.3` (o `npm audit fix`; si es transitiva, usar `overrides` en package.json)

| ID | Alias | Severidad | Corregido en | Descripción |
|---|---|---|---|---|
| [GHSA-qxg6-89mg-rqv8](https://nvd.nist.gov/vuln/detail/CVE-2026-112949) | CVE-2026-112949 | 🟡 Media (4.7) | 5.0.3 | Vitest: Code injection via unauthenticated manual mock registration |
| [GHSA-xp26-3454-mjgp](https://nvd.nist.gov/vuln/detail/CVE-2026-112950) | CVE-2026-112950 | 🟡 Media (5.9) | 5.0.3 | Vitest: Windows backslash traversal bypasses the @vitest/mocker redirect allowlist fix |

## Verificación

Después de actualizar, vuelve a escanear desde la raíz del proyecto:

```powershell
osv-scanner scan source -r .
```

Para dependencias de desarrollo o falsos positivos que decidas aceptar, puedes documentarlos en un `osv-scanner.toml` con `[[IgnoredVulns]]`.
