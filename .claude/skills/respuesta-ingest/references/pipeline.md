# Pipeline Reference — respuesta-ingest

Especificación detallada del pipeline de procesamiento de items crudos a leads estructurados.

---

## Visión general del flujo

```
[Fuentes: social / RSS / web / video / sitios]
         ↓
[rawItems: RawItem[]]
         ↓
[seen.mjs: dedup por platform:id]  ← filtra re-ingesta entre ticks
         ↓
[process.mjs: processBatch()]
  ├── detectDebunk → MisinformationItem (+ continue)
  ├── isLikelyMisinformation → skip (silent drop)
  ├── detectMissing → MissingMention (+ continue processing)
  ├── classifyDamage → null = skip
  ├── bestPlace → null = skip
  ├── extractNamedBuilding → landmark_description
  ├── buildDescription → string ≤1900 chars
  ├── dedupKey → _dedupKey string
  └── isDuplicate vs existing → mergeInto OR push new lead
         ↓
[leads: Lead[], missing: MissingMention[], misinformation: MisinformationItem[]]
         ↓
[insert.mjs]
  ├── insertLeads → POST /rest/v1/buildings (moderation_status='pending')
  └── insertMisinformation → POST /rest/v1/rpc/submit_misinformation_report
         ↓
[saveSeen + report]
```

---

## Tipos de datos

### RawItem
```ts
{
  source:     string     // e.g. 'rss:efectococuyo', 'x:@metavarce', 'yt:abc123'
  platform:   string     // 'twitter'|'reddit'|'instagram'|'tiktok'|'youtube'|'rss'|'web'|'site'
  handle?:    string     // '@OrlvndoA' — para lookup de tier en trust.mjs
  id:         string     // id nativo de la plataforma o hash-sha256(url)[:16]
  url:        string     // URL canónica del item
  text:       string     // título + descripción + subtítulos (max 5-6k chars)
  createdAt?: string     // ISO 8601 o YYYYMMDD
  mediaUrls?: string[]   // URLs de imágenes/video adjuntas
  engagement?: number    // likes + RT + vistas (para trust bump)
}
```

### Lead (enviado a buildings)
```ts
{
  lat:                  number    // centroide del lugar (gazetteer)
  lng:                  number
  estado:               string    // enum ESTADOS de taxonomy.ts
  municipio:            string
  parroquia:            string|null
  landmark_description: string|null  // e.g. 'Edificio Las Torres'
  damage_level:         DamageLevel  // 'collapsed'|'severe'|'moderate'|'minor'|'no_visible_damage'|'unknown'
  people_status:        PeopleStatus // 'confirmed_trapped'|'possible'|'none_reported'|'unknown'
  description:          string    // '[TAG - verificar] <body>. Fuente: <url>' ≤1900 chars
  source_channel:       string    // 'social_scan'|'news_scrape'|'video_scan'|'site_scan'
  corroboration_count:  number    // 1 = primer avistamiento; >1 = corroborado
  _dedupKey:            string    // campo interno, stripped antes de POST
  _sources:             string[]  // URLs de fuentes, stripped antes de POST
}
```

### MisinformationItem (enviado a misinformation_reports)
```ts
{
  claim:         string   // primeros 200 chars del texto detectado
  verdict:       'false'|'misleading'|'unverified'|'satire'
  explanation:   string   // frase detectada + fuente
  debunk_url?:   string   // URL del fact-check si está disponible
  source_url:    string   // URL del item original
  related_place?: string  // lugar mencionado si se pudo extraer
  severity:      'low'|'medium'|'high'
}
```

### MissingMention (link-out, NUNCA insertado en buildings)
```ts
{
  name?:           string   // nombre si se detectó en el texto
  last_seen_text?: string   // primeros 280 chars del texto
  estado?:         string   // estado si se geolocalizó
  source_url:      string   // URL del item de origen
  registry:        string   // 'desaparecidosterremotovenezuela' siempre
  note:            string   // instrucción de derivación
}
```

---

## Paso 1 — Dedup inter-tick (seen.mjs)

**Clave:** `<platform>:<id>` en minúsculas.  
Ejemplo: `twitter:1234567890`, `youtube:dQw4w9WgXcQ`, `rss:hash16chars`

**Almacenamiento:** `$HOME/.respuesta-ingest/seen.json` como `{ key: 1, ... }`.

El `seenCheckAndAdd()` es atómico en memoria — devuelve `true` si ya se procesó
(saltar), `false` + agrega la clave si es nuevo (procesar).

`saveSeen()` escribe al disco al finalizar el tick. Si el proceso muere antes,
el tick siguiente re-procesará los items de ese tick — el dedup de leads en
`process.mjs` previene duplicados en la DB de todas formas.

---

## Paso 2 — Detección de desmentidos (detectDebunk)

`detectDebunk(text, url)` en `trust.mjs` — ejecutado **antes** que los filtros
de clasificación para que los fact-checks nunca se conviertan en leads.

**Lógica:** busca cualquier frase en `DEBUNK_PHRASES` (normalizada sin diacríticos).
Si hay match → retorna `MisinformationItem`; de lo contrario → `null`.

**Frases clave que DEBEN ser detectadas:**
- `'generado a partir de un videojuego'` → el video fake del terremoto venezolano
- `'modificado con ia'` / `'modificado con inteligencia artificial'`
- `'es falso'` / `'esto es falso'` / `'desmentido'` / `'falso video'`
- `'fact check'` / `'debunked'` / `'verified false'`

**Severidad:**
- `high` si menciona colapso/atrapados/muertos
- `medium` si menciona IA/videojuego
- `low` en otros casos

---

## Paso 3 — Pre-filtro de desinformación (isLikelyMisinformation)

`isLikelyMisinformation(text)` — ejecutado después de detectDebunk.  
Si flagea → item descartado sin registro en ninguna tabla.

**Lógica:** requiere señal de producción sintética (`MISINFO_SIGNALS`) para
descartar. La señal de falsedad sola no es suficiente (un tweet diciendo
"esto es falso" puede ser una alerta legítima).

**Signals:**
- `MISINFO_SIGNALS`: marcadores de contenido sintético (videojuego, IA, deepfake, CGI, etc.)
- `FAKE_SIGNALS`: falsedad explícita (falso, fake, montaje, hoax, etc.)

La combinación MISINFO + FAKE → drop. Solo MISINFO → drop (señal fuerte).  
Solo FAKE sin MISINFO → NO drop (podría ser una alerta legítima de desinformación).

---

## Paso 4 — Detección de desaparecidos (detectMissing)

Heurística de palabras clave (`MISSING_KW`): busca `desaparecido`, `busco a`,
`sin noticias de`, `missing`, etc.  
Si hay match → retorna `MissingMention`, pero el item **continúa procesándose**
(puede haber daños estructurales junto a la mención de persona desaparecida).

**Invariante crítico:** los `MissingMention` NUNCA se insertan en `buildings`.
Son link-outs al registro de desaparecidosterremotovenezuela.com.

---

## Paso 5 — Clasificación de daños (classify.mjs)

`classifyDamage(text)` → `{ damage_level, people_status }|null`

**Gate:** debe tener al menos una keyword de `DAMAGE_ANY`. Si no → `null` → skip.

**Jerarquía de damage_level (mayor a menor severidad):**
1. `no_visible_damage` — frases explícitas de ausencia de daños
2. `collapsed` — colaps, derrumb, escombr, desplom, sepult, rubble, etc.
3. `severe` — grave, severo, heavily damaged, partial collapse
4. `moderate` — grieta, agriet, crack, damag
5. `minor` — leve, pequeño, minor, slight
6. `unknown` — hay daño pero no se puede clasificar

El nivel `no_visible_damage` se evalúa primero para no falso-positivear cuando
alguien dice "el edificio X no tiene daños visibles".

**people_status:**
- `confirmed_trapped` — atrapado/a, bajo los escombros, sepultado, trapped, buried alive
- `possible` — rescate, búsqueda, desaparecid, survivor, rescue
- `none_reported` — sin víctimas, nadie atrapado, everyone safe, no casualties
- `unknown` — sin señal de personas

**Política de false-negatives preferidos en people_status:** `confirmed_trapped`
requiere lenguaje explícito. Si hay ambigüedad → `possible` o `unknown`.

---

## Paso 6 — Geolocalización (gazetteer.mjs)

`bestPlace(text)` → `GazEntry|null`

Busca en el texto cualquier topónimo del gazetteer (`GAZ` array, ~40 lugares).
Si no se puede geolocali·zar → `null` → skip.

**GAZ cubre:**
- Distrito Capital: La Candelaria, San Bernardino, La Pastora, Pinto Salinas, El Valle, Catedral, Caracas genérico
- Miranda: Altamira, Los Palos Grandes, Chacao, Baruta, El Hatillo, Petare, Los Teques
- La Guaira: Los Corales, Tanaguarena, Caraballeda, Macuto, Catia La Mar, Maiquetía, Naiguatá, La Guaira genérico
- Aragua: Maracay
- Carabobo: Valencia
- Trujillo: Valera
- Falcón: Coro
- Lara: Barquisimeto
- Yaracuy: San Felipe

`extractNamedBuilding(text)` extrae nombres propios de edificios con regex:
```regex
/\b(Edificio|Residencias?|Torre|Hotel|Conjunto(?: Residencial)?)\s+([A-ZÁÉÍÓÚÑ]...)/g
```

---

## Paso 7 — Dedup de leads (dedup.mjs)

### dedupKey(lead)
- Con landmark: `estado|parroquia|<normalised_landmark>`
- Sin landmark: `estado|parroquia|<lat_3dp>|<lng_3dp>` (grid ~110m)

### isDuplicate(lead, existing)
Dos leads son duplicados si:
- **(A)** Misma `_dedupKey` (misma clave exacta), O
- **(B)** Dentro de 150m + misma parroquia + similitud de texto:
  - Ambos tienen landmark → Jaccard(landmark_A, landmark_B) ≥ 0.70
  - Ninguno tiene landmark → Jaccard(description_A, description_B) ≥ 0.55
  - Mixto (uno con landmark, uno sin) → Jaccard(description) ≥ 0.65

La similitud Jaccard se calcula sobre **trigramas de caracteres** del texto
normalizado (sin diacríticos, minúsculas).

### mergeInto(existing, lead)
Cuando se detecta un duplicado:
- `corroboration_count += 1`
- `_sources = union(_sources_existing, _sources_lead)`
- `damage_level` = el más severo de los dos (orden: collapsed > severe > moderate > minor > no_visible_damage > unknown)
- `people_status` = el más urgente (confirmed_trapped > possible > none_reported > unknown)
- `landmark_description` = se rellena si el existente no tenía uno

---

## Paso 8 — Descripción de leads

Formato: `[TAG - verificar] <body truncado a 300 chars>. Fuente: <url>` ≤1900 chars.

Tags por source_channel:
- `social_scan` → `[SOCIAL - verificar]`
- `news_scrape` → `[AUTO-RSS - verificar]`
- `video_scan` → `[VIDEO - verificar]`
- `site_scan` → `[SITIO - verificar]`

El prefijo `- verificar` informa al coordinador que este lead no ha sido
verificado por humanos.

---

## Paso 9 — Inserción en Supabase

### insertLeads → POST /rest/v1/buildings

Campos enviados:
- `lat`, `lng`, `estado`, `municipio`, `parroquia`
- `landmark_description`, `damage_level`, `people_status`
- `description`, `source_channel`, `corroboration_count`
- `moderation_status: 'pending'` (siempre)
- `verified: false` (siempre)
- `is_sample_data: false` (siempre)

Campos internos stripped: `_dedupKey`, `_sources`.

HTTP 409 Conflict → `skipped++` (ya existe, dedup upstream debería haber
prevenido esto, pero puede ocurrir en races).

### insertMisinformation → POST /rest/v1/rpc/submit_misinformation_report

Parámetros RPC: `p_claim`, `p_verdict`, `p_explanation`, `p_debunk_url`,
`p_source_url`, `p_related_place`, `p_severity`.

Definido en migration 0013.

---

## Leads pre-existentes (evitar duplicar)

4 leads ya insertados antes del primer tick automatizado:

| Landmark | Parroquia | Estado | damage_level | people_status |
|---|---|---|---|---|
| Residencias Rita | — | Distrito Capital | collapsed | confirmed_trapped |
| Edificio Candelaria Center | La Candelaria | Distrito Capital | collapsed | confirmed_trapped |
| — (colapso masivo) | Caraballeda | La Guaira | collapsed | confirmed_trapped |
| — (sector) | Los Corales | La Guaira | severe | possible |

El dedup `isDuplicate` los absorbará automáticamente:
- Los dos primeros por landmark_description match.
- Los dos últimos por geo-grid + parroquia match.
