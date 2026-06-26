# Misinformation & Trust Policy — respuesta-ingest

Política de confianza, detección de desinformación y manejo de contenido falso
para el pipeline de ingesta del terremoto Venezuela 2026.

---

## Contexto: por qué la desinformación es crítica aquí

Durante desastres naturales, la desinformación sobre estructuras derrumbadas
puede causar:
- Desvío de equipos de rescate a ubicaciones inexistentes
- Pánico innecesario en zonas no afectadas
- Saturación de recursos de emergencia
- Daño a la credibilidad de la plataforma Respuesta VE

El pipeline usa tres mecanismos defensivos en cascada:
1. `detectDebunk` — ruteniza fact-checks como reportes de desinformación
2. `isLikelyMisinformation` — descarta contenido con marcadores de producción sintética
3. Tier-based trust scoring — pondera leads por la confiabilidad de su fuente

---

## Mecanismo 1: detectDebunk (trust.mjs)

Detecta cuando un item **ES** un fact-check o desmentido.

### ¿Qué captura?

Posts y artículos que CORRIGEN desinformación:
- `'generado a partir de un videojuego'` — el caso real del terremoto VE 2026
- `'modificado con ia'` / `'modificado con inteligencia artificial'`
- `'es falso'` / `'esto es falso'` / `'es fake'`
- `'desmentido'` / `'hemos desmentido'` / `'fue desmentido'`
- `'falso video'` / `'falso vídeo'` / `'vídeo falso'`
- `'verificado: falso'`
- `'no es cierto'` / `'no es verdad'` / `'es mentira'`
- `'fact check'` / `'fact-check'` / `'debunked'`
- `'verified false'` / `'misinformation'`
- `'not real footage'` / `'not real video'`

### Caso real que DEBE ser detectado

```
"Falso video que muestra el colapso de dos edificios en Caraballeda
 circula en redes. El clip fue generado a partir de un videojuego y
 modificado con IA para parecer real."
```

Este texto dispara `'generado a partir de un videojuego'` y `'modificado con ia'`
en `DEBUNK_PHRASES`. Resultado:

```json
{
  "claim": "Falso video que muestra el colapso de dos edificios...",
  "verdict": "false",
  "explanation": "Texto detectado como desmentido/verificación. Frase clave: 'generado a partir de un videojuego'. Fuente: ...",
  "related_place": "Caraballeda",
  "severity": "high"
}
```

Severity = `high` porque menciona `colapso`.

### Flujo en el pipeline

```
item.text → detectDebunk(text, url) → MisinformationItem|null
  ├── si retorna item → push a misinformation[] + continue
  │     (NO se convierte en lead; el `continue` salta el resto del procesamiento)
  └── si retorna null → continúa al siguiente paso
```

**Invariante:** un fact-check NUNCA se convierte en lead.

---

## Mecanismo 2: isLikelyMisinformation (trust.mjs)

Descarta items que **PROPAGAN** contenido falso o sintético.

### ¿Qué captura?

Items cuyo texto sugiere que el propio contenido es fabricado:

**MISINFO_SIGNALS** (marcadores de producción sintética):
- `'generado con ia'` / `'generada con ia'` / `'generado por ia'`
- `'ai-generated'` / `'generated with ai'` / `'ai generated'`
- `'videojuego'` / `'video game'` / `'gameplay'`
- `'captura de pantalla del juego'`
- `'renderizado'` / `'deepfake'` / `'cgi'` / `'computer generated'`

**FAKE_SIGNALS** (indicadores de falsedad):
- `'falso'` / `'fake'` / `'manipulado'` / `'montaje'`
- `'hoax'` / `'satira'` / `'sátira'`
- `'no es real'` / `'es mentira'`
- `'desinformacion'` / `'desinformación'`

### Política de combinación

| Señales presentes | Acción |
|---|---|
| MISINFO solamente | DROP (señal fuerte de contenido sintético) |
| MISINFO + FAKE | DROP |
| FAKE solamente | NO DROP (puede ser una alerta legítima: "este video es falso y debe ser reportado") |
| Ninguna | Continúa procesamiento |

### Diferencia con detectDebunk

| | detectDebunk | isLikelyMisinformation |
|---|---|---|
| ¿Qué detecta? | Posts que CORRIGEN desinformación | Posts que PROPAGAN desinformación |
| ¿Qué hace? | Crea MisinformationItem + continúa | Descarta el item silenciosamente |
| ¿Registra algo? | Sí → tabla misinformation_reports | No → drop silencioso |
| ¿El item puede ser un lead? | No | No |

---

## Mecanismo 3: Trust Scoring (trust.mjs)

`trustScore(item)` → `0..1` — no bloquea leads, pero el pipeline puede usarlo
para priorizar revisión o para futuros filtros de umbral.

### Pesos base por tier

| Tier | Score base | Ejemplos |
|---|---|---|
| `official` | 0.95 | @Southcom, @usembassyve, @nayibbukele |
| `media` | 0.80 | @CaracasChron, outlets RSS |
| `journalist` | 0.75 | @OrlvndoA, @agusantonetti, @EmmaRincon |
| `social` | 0.45 | Cuentas anónimas de Twitter/TikTok/Instagram |
| `unknown` | 0.35 | Fuentes sin tier asignado |

### Bumps

- `+0.05` si `engagement > 500` (más viralidad → más ojos → más verificación implícita)
- `+0.10` si el dominio de la URL pertenece a un outlet establecido:
  `efectococuyo.com`, `elpitazo.net`, `runrunes.net`, `talcualdigital.com`,
  `lapatilla.com`, `cronica.uno`, `elnacional.com`, `reuters.com`, `apnews.com`,
  `bbc.com`, `elpais.com`, `france24.com`, `dw.com`

Score máximo: 1.0 (cap).

### Lookup de tier

1. `item.handle` (stripped de `@`, lowercase) → lookup en `SOURCE_TIERS`
2. Si `item.source` tiene formato `'x:@Handle'` → extrae y lookup en `SOURCE_TIERS`
3. Platform fallback: `web`/`rss` → `media`; redes sociales → `social`; else → `unknown`

---

## Tabla misinformation_reports

Los `MisinformationItem[]` se insertan vía RPC:

```sql
-- Migration 0013
SELECT submit_misinformation_report(
  p_claim := '...',
  p_verdict := 'false',         -- 'false'|'misleading'|'unverified'|'satire'
  p_explanation := '...',
  p_debunk_url := null,         -- URL del fact-check si disponible
  p_source_url := '...',
  p_related_place := 'Caraballeda',
  p_severity := 'high'          -- 'low'|'medium'|'high'
);
```

Los coordinadores revisan estos reportes en el panel de administración.
Los reportes de `severity: high` deben revisarse con prioridad máxima.

---

## Casos de prueba de referencia

### Caso 1: video fake del terremoto (DEBE → MisinformationItem high)

Input:
```
"Falso video que muestra el colapso de dos edificios en Caraballeda
 circula en redes. El clip fue generado a partir de un videojuego y
 modificado con IA para parecer real. No confundir con imágenes reales."
```

Resultado esperado:
- `detectDebunk` → dispara en `'generado a partir de un videojuego'`
- `verdict: 'false'`, `severity: 'high'`, `related_place: 'Caraballeda'`
- **NO** se inserta en buildings

### Caso 2: artículo legítimo de El Pitazo (DEBE → Lead collapsed)

Input:
```
"Al menos dos edificios colapsaron en el sector Caraballeda tras el sismo
 de magnitud 6.8. Equipos de rescate buscan personas atrapadas bajo los
 escombros. Fuente: elpitazo.net"
```

Resultado esperado:
- `detectDebunk` → null (no es un desmentido)
- `isLikelyMisinformation` → `{ flag: false }` (no hay marcadores sintéticos)
- `classifyDamage` → `{ damage_level: 'collapsed', people_status: 'confirmed_trapped' }`
- `bestPlace` → Caraballeda (La Guaira)
- Trust score: 0.80 (media) + 0.10 (elpitazo.net) = 0.90

### Caso 3: tweet anónimo de propaganda (DEBE → drop silencioso)

Input:
```
"Miren este video falso generado con IA que muestra Caracas destruida
 y que circula como real. No caigan en la trampa, es un deepfake."
```

Resultado esperado:
- `detectDebunk` → puede disparar en `'generado con ia'` o `'deepfake'`
  → MisinformationItem (el tweet en sí es un desmentido)
- OR si el texto no tiene frases exactas de DEBUNK_PHRASES:
  `isLikelyMisinformation` → flag=true (MISINFO: 'generado con ia') → drop

### Caso 4: missing person + daños (DEBE → MissingMention + Lead)

Input:
```
"Busco a mi hermana María González, la última vez que la vi fue en
 el Edificio Las Torres de Petare antes del sismo. El edificio quedó
 con daños graves, hay personas atrapadas."
```

Resultado esperado:
- `detectMissing` → MissingMention { name: 'María González', estado: 'Miranda' }
- `classifyDamage` → `{ damage_level: 'severe', people_status: 'confirmed_trapped' }`
- `bestPlace` → Petare (Miranda)
- `extractNamedBuilding` → 'Edificio Las Torres'
- Lead creado (además del MissingMention)

---

## Lista de outlets confiables (trusted domains)

Estos dominios reciben un +0.10 en trust score:

```
efectococuyo.com   — Venezuela, independiente
elpitazo.net       — Venezuela, independiente
runrunes.net       — Venezuela, investigación
talcualdigital.com — Venezuela, independiente
lapatilla.com      — Venezuela
cronica.uno        — Venezuela
elnacional.com     — Venezuela
reuters.com        — Internacional, wire service
apnews.com         — Internacional, AP
bbc.com            — Internacional, BBC (incluye bbc.co.uk)
elpais.com         — España/LatAm
france24.com       — Internacional
dw.com             — Internacional, Deutsche Welle
```
