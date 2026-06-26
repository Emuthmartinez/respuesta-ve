# Sources Reference — respuesta-ingest

Catálogo completo de fuentes monitoreadas por el pipeline de ingesta.
Fuente de verdad: `scripts/sources.mjs`.

---

## 1. X / Twitter — Cuentas rastreadas (`ACCOUNTS`)

El agente hace una llamada `getTwitterPostsByAuthor` por cada cuenta en cada tick.

| Handle | Tier | Descripción |
|---|---|---|
| `@Southcom` | official | US Southern Command — actualizaciones militares oficiales |
| `@usembassyve` | official | Embajada EEUU Venezuela — alertas consulares oficiales |
| `@nayibbukele` | official | Presidente de El Salvador — posts de ayuda/solidaridad regional |
| `@SA_Defensa` | official | Ministerio de defensa venezolano / señales de protección civil |
| `@CaracasChron` | media | Caracas Chronicles — periodismo civil bilingüe |
| `@OrlvndoA` | journalist | Orlando Avendaño — periodista de opinión/campo |
| `@agusantonetti` | journalist | Agustín Antonetti — corresponsal / periodista de campo |
| `@EmmaRincon` | journalist | Emma Rincón — periodista venezolana |
| `@iamGermania` | journalist | Germania — periodista / narradora de campo |
| `@metavarce` | journalist | Meta Varce — hybrid social/journalist, cobertura La Guaira |
| `@rcamachovzla` | journalist | Rafael Camacho — periodista venezolano, fuerte cobertura en video |

**Pesos de confianza (trust.mjs `SOURCE_TIERS`):**
- `official` → base 0.95
- `media` → base 0.80
- `journalist` → base 0.75
- `social` (anónimo) → base 0.45
- `unknown` → base 0.35

Bumps adicionales:
- +0.05 si engagement > 500
- +0.10 si URL pertenece a un dominio de outlet establecido

---

## 2. Keyword Queries (`KEYWORD_QUERIES`)

15 queries usadas para `getTwitterPostsByKeywords`, `getRedditPostsByKeywords`,
`getInstagramPostsByKeywords`, `getTiktokPostsByKeywords`.

| # | Query | Idioma | maxResults |
|---|---|---|---|
| 1 | `terremoto Venezuela edificio colapso` | es | 50 |
| 2 | `sismo Venezuela derrumbe escombros` | es | 50 |
| 3 | `terremoto Venezuela atrapados rescate` | es | 50 |
| 4 | `edificio derrumbado Caracas 2026` | es | 30 |
| 5 | `colapso La Guaira Caraballeda Macuto` | es | 30 |
| 6 | `personas atrapadas Caracas terremoto` | es | 30 |
| 7 | `Residencias colapso Caracas terremoto` | es | 25 |
| 8 | `derrumbe La Candelaria San Bernardino sismo` | es | 25 |
| 9 | `Los Corales Tanaguarena caraballeda colapso` | es | 20 |
| 10 | `Venezuela earthquake building collapsed 2026` | en | 40 |
| 11 | `Venezuela earthquake trapped rescue rubble` | en | 40 |
| 12 | `Caracas earthquake building collapse` | en | 25 |
| 13 | `La Guaira Venezuela earthquake damage` | en | 25 |
| 14 | `terremoto Venezuela falso video fake IA` | es | 20 |
| 15 | `Venezuela earthquake fake video AI generated` | en | 20 |

**Nota:** Las queries 14 y 15 están diseñadas para capturar desinformación temprana
y alimentar `detectDebunk` antes de que se propaguen.

---

## 3. RSS Feeds (`RSS_FEEDS`)

9 feeds de noticias venezolanas e internacionales.
Todos procesados por `fetchRss()` en `fetch_web.mjs`.

| Outlet | URL | Idioma |
|---|---|---|
| Efecto Cocuyo | `https://efectococuyo.com/feed/` | es |
| El Pitazo | `https://elpitazo.net/feed/` | es |
| Runrunes | `https://runrun.es/feed/` | es |
| Tal Cual | `https://talcualdigital.com/feed/` | es |
| La Patilla | `https://www.lapatilla.com/feed/` | es |
| Crónica Uno | `https://cronica.uno/feed/` | es |
| El Nacional | `https://www.elnacional.com/feed/` | es |
| Reuters ES | `https://feeds.reuters.com/reuters/MXdomesticNews` | es |
| BBC Mundo | `https://feeds.bbci.co.uk/mundo/rss.xml` | es |

**Comportamiento en error:** `fetchRss` devuelve `[]` en cualquier falla de red o
parseo — nunca interrumpe el pipeline.

---

## 4. Búsqueda semántica — Exa (`EXA_QUERIES`)

3 queries para `fetchExa()` vía `mcporter call exa.web_search_exa`.

| Query | n |
|---|---|
| `terremoto Venezuela 2026 edificio colapsado OR derrumbe` | 6 |
| `Venezuela earthquake 2026 building collapsed rescue` | 6 |
| `La Guaira Caraballeda terremoto 2026 colapso` | 5 |

Exa usa búsqueda semántica neural — encuentra artículos relevantes aunque no
contengan las keywords exactas. Ideal para artículos de análisis y reportajes largos.

---

## 5. GDELT DOC 2.0

Query fija idéntica a `ingest-worker/src/index.ts fetchNews()`:
```
(terremoto OR sismo OR earthquake) (edificio OR colapso OR derrumbe OR collapse OR building OR rubble) sourcecountry:venezuela
```

Parámetros: `mode=ArtList`, `format=json`, `maxrecords=75`, `timespan=7d`, `sort=DateDesc`.

GDELT monitorea +100.000 fuentes de noticias globales. Útil para outlets internacionales
que no tienen RSS configurado pero cubren el terremoto.

---

## 6. YouTube / Video (`YT_QUERIES`)

6 queries para `scanVideos()` en `video.mjs` vía yt-dlp.

| Query | maxResults |
|---|---|
| `terremoto Venezuela edificio colapso 2026` | 5 |
| `sismo Venezuela derrumbe Caracas` | 5 |
| `terremoto La Guaira Caraballeda colapso` | 5 |
| `Venezuela earthquake building collapse 2026` | 5 |
| `Caracas earthquake collapse rescue` | 4 |
| `terremoto Venezuela atrapados rescate video` | 4 |

**Extracción de texto:** yt-dlp descarga subtítulos auto-generados en VTT (es, en),
parseados a texto plano. No descarga video.
**`sampleFrames()`** — disponible para visión del agente, no en el pipeline automático.

---

## 7. Sitios monitoreados (`SITES`)

| Sitio | URL | Rol |
|---|---|---|
| desaparecidosterremotovenezuela.com | `https://desaparecidosterremotovenezuela.com` | missing_registry |
| sosvenezuela2026.com | `https://sosvenezuela2026.com` | crisis_platform |
| sosvenezuela2026.com/noticias | `https://sosvenezuela2026.com/noticias` | crisis_platform |

### desaparecidosterremotovenezuela.com
- Registro voluntario de desaparecidos. Sin API pública.
- **Política**: link-out únicamente. Los items extraídos se convierten en `MissingMention[]`
  con `registry: 'desaparecidosterremotovenezuela'`.
- **NUNCA** insertar registros de este sitio en la tabla `buildings`.
- `external_source` enum value: `'desaparecidosterremotovenezuela'` (migration 0004)

### sosvenezuela2026.com
- Plataforma paralela de crisis. Monitorear `/noticias` para leads de daños y desmentidos.
- Tratar como fuente de federación: los items pueden ser leads O desmentidos.
- `fetchSite()` extrae texto limpio vía Jina reader proxy.

---

## 8. Políticas de source_channel

El campo `source_channel` en `buildings` refleja el origen del lead:

| Plataforma de origen | source_channel |
|---|---|
| twitter, tiktok, instagram, reddit | `social_scan` |
| youtube | `video_scan` |
| rss, web (gdelt, exa) | `news_scrape` |
| site (sosvenezuela2026, etc.) | `site_scan` |

---

## 9. Seen.json — dedup persistente entre ticks

Ubicación: `$HOME/.respuesta-ingest/seen.json`
Formato: `{ "platform:id": 1, ... }` (flat object, sin timestamps)
Crecimiento estimado: ~500-1000 keys/día. Pruning manual si supera 100k keys.

Clave de seen para cada item: `seenKey(platform, id)` → `"twitter:1234567890"`
