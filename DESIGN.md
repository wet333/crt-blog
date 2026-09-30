# Documento de diseño — CRT Ámbar

> Fuente de verdad de las decisiones visuales y estructurales.
> Leelo completo antes de cambiar el diseño y actualizalo después de cada cambio.

## 1. Brief

- **Tema:** blog personal de desarrollo de software (wet333).
- **Audiencia:** desarrolladores; lectores que disfrutan la estética de terminal.
- **Objetivo principal:** leer posts cómodamente dentro de la ilusión de un monitor CRT ámbar.
- **Voz:** técnica, lacónica, con guiños de shell (`cd`, `cat`, prompts).
- **Nivel de originalidad:** 3 — Creative. El monitor CRT es el elemento firma; el resto es disciplinado.

## 2. Tokens de color (`src/styles/global.css`, `@theme`)

| Token | Hex | Rol |
| --- | --- | --- |
| `amber-hot` | #ffd060 | Alta intensidad (`strong`) — 13.4:1 |
| `amber-bright` | #ffb000 | Texto, enlaces, fondo del video inverso — 10.6:1 |
| `amber-dim` | #cc8c00 | Bordes, metadatos (fecha/categoría) — 6.8:1 |
| `amber-faint` | #a87400 | Historial del prompt (decorativo) — 4.8:1 |
| `bg-black` | #110d00 | Vidrio del tubo encendido (fondo) |
| `bg-dark` | #000 | Tubo apagado (encendido del tubo) |

Contraste medido sobre `bg-black`. Nunca usar `opacity` para atenuar texto: usar `amber-dim`/`amber-faint`, que tienen el contraste verificado. `theme-color` en `BaseLayout.astro` repite `bg-black`.

## 3. Tipografía

Una sola familia: **Departure Mono** (fuente pixel, grilla nativa de 11px). También es la fuente mono por defecto (`pre`, `code`, formularios).

**Regla:** solo tamaños múltiplos de 5.5px. Así cada pixel de la fuente cae entero en pantallas 1x y 2x; a 18px o 24px los trazos salen irregulares. La jerarquía es como en una terminal: pocos tamaños, y el resto se resuelve con intensidad (color) y video inverso.

| Token (`text-*`) | Mobile | md+ (≥768px) | Uso |
| --- | --- | --- | --- |
| `meta` | 11px | 16.5px | Historial, fecha/categoría, listas del aside, botón del footer |
| `body` | 16.5px / 27.5 | 22px / 33 | Cuerpo, `p`, `li`, `h3`–`h6` |
| `title` | 22px | 33px | `h1`, `h2` (títulos de post y tarjetas) |
| `prompt` | 27.5px | 44px | Prompt del header |

- Sin negrita: la fuente solo tiene peso regular y la negrita sintética emborrona los pixeles. `strong` = más brillo + halo.
- Los enlaces dentro del texto van subrayados (todo el texto es ámbar; el color solo no alcanza).

## 4. Espaciado y layout

- Contenedor: `body` con `max-w-[960px] mx-auto`, gutter `px-4` en mobile y `p-5` en md+.
- Home: posts y aside en una columna hasta `lg`; en md el aside muestra sus dos paneles en 2 columnas; desde `lg` (1024px) posts (grow 6) + aside (basis 250px). En teléfonos (< md) se oculta "Top Posts": repetiría la lista que está justo arriba.
- Posts: una columna de ~60 caracteres por línea a 22px (~30 en un teléfono de 360px).
- Mobile (< md): paddings internos `p-3`/`p-4` en vez de `p-4`/`p-5` (las cajas anidadas comían el ancho), historial del prompt de 2 líneas en vez de 5.
- `:hover` en CSS propio va dentro de `@media (hover: hover)` (las variantes `hover:` de Tailwind ya lo hacen): en pantallas táctiles queda pegado después del toque.
- Bordes: `border-terminal` (1px `amber-dim`); títulos de tarjeta con borde punteado; footer con doble línea. Cajas rectas; solo `pre` tiene esquinas redondeadas (pantalla dentro de la pantalla).
- Objetivos táctiles del menú ≥ 44px (`min-h-11`).

## 5. Elemento firma: el monitor CRT

**Qué:** la página entera se ve a través de un tubo CRT ámbar.
**Cómo** (`src/scripts/crt-effects.ts` + `.crt-*` en `global.css`), de abajo hacia arriba:

1. **Bloom** — 4 capas `backdrop-filter: blur + brightness` con `mix-blend-mode: screen` (z 9998); 3 en pantallas < md (se omite la de 32px, la más cara). La más fina no debe pasar de ~0.5px de blur: con más, la luz inunda el texto en video inverso. Cada capa es un blur a pantalla completa: no agregar más sin medir el scroll.
2. **Canvas WebGL** (z 9999) — scanlines (periodo entero en pixeles físicos, sin moiré), banda de refresco, vignette, esquinas redondeadas del tubo con borde oscurecido, flicker y grano. Se dibuja a 30 fps; los valores por frame los calcula JS.
   - Scanlines: 2px CSS / 30% en md+, 1px CSS / 22% en pantallas chicas. Deben acompañar el tamaño del pixel de la fuente (2px CSS en md+, 1–1.5px en mobile): si la franja oscura es tan gruesa como un pixel de la letra, corta filas enteras de los glifos.
3. **Encendido** (`.crt-power`, z 10002) — línea brillante que se abre al alto de la pantalla. Solo en la primera página de la sesión.

Los overlays fijos miden `100lvh` (viewport grande): en mobile, al esconderse la barra del navegador, con `100%` quedaba una franja sin efectos y el canvas se redimensionaba en cada cuadro.

La página se oculta (`html.crt-booting`) hasta el primer frame con efectos; una animación CSS de respaldo la muestra a los 1.5s si el JS falla. Sin JS no se oculta nada.

**Prompt vivo:** el header simula una terminal. Cada link registra el comando equivalente (`cd ~/about`, `cat ~/blog/x`, `wget …`) y el prompt muestra el directorio actual. La lógica ruta → comando está en `src/utils/terminal.ts`; al cargar la página, el historial se sincroniza con la URL (botón atrás, URL escrita, bfcache).

## 6. Movimiento

- Animado: flicker, banda de refresco, grano, parpadeo del cursor, encendido del tubo, cursor `>` de los links (200ms).
- Todo lo continuo se apaga con `prefers-reduced-motion` o con la línea "Animaciones: [ON]" del panel "Estado del servidor" en Inicio (WCAG 2.2.2; se guarda en `localStorage['crt-motion']`, y se refleja en `html[data-crt-motion]`). Las scanlines, el vignette y el bloom son estáticos y quedan siempre.

## 7. Convenciones de componentes

- `Link.astro`: `variant="button"` (video inverso, CTA) o `variant="menu"` (texto que se invierte al pasar/enfocar/estar activo). `current="page" | "true"` → `aria-current`. El comando del historial se deriva del `href`; `command` lo sobreescribe.
- El cursor `>` aparece dentro del link, en el padding izquierdo (`px-[1.75ch]`, simétrico, siempre reservado): no mueve el texto al hacer hover ni pisa elementos vecinos. Si se cambia el tamaño o la fuente, mantener padding ≥ 1ch del cursor + ~0.5ch de aire.
- Estilos de elementos (classless) en `@layer base`; piezas propias en `@layer components` (`.prompt`, `.cursor`, `.panel-title`, `.crt-*`); utilidades propias con `@utility` (`negative-color`, `border-terminal`).
- Foco visible global: contorno punteado ámbar de 2px. Skip link "Saltar al contenido" → `#contenido` (el `<main>` de cada página).
- Un `h1` por página: título del post, o `sr-only` en Inicio y Perfil. El prompt no es un heading.

## 8. Voz del texto

Español neutro (tuteo en los posts). Etiquetas de navegación entre corchetes (`[ Inicio ]`), CTAs en mayúsculas (`LEER MÁS`). Los comandos de shell son parte del tono: usarlos solo donde son verosímiles.

## 9. Registro de decisiones

| Fecha | Decisión | Motivo |
| --- | --- | --- |
| 2026-09-29 | Documento creado; se formaliza la dirección CRT ámbar existente (nivel 3). | Registrar el sistema para que las próximas sesiones lo extiendan coherentemente. |
| 2026-09-29 | Escala tipográfica en múltiplos de 5.5px (antes 14/18/24/48px). | Departure Mono se veía con trazos irregulares fuera de su grilla. |
| 2026-09-29 | Tokens `amber-faint` y `amber-hot`; metadatos con `amber-dim` en vez de `opacity`. | La metadata con `opacity-60` quedaba en 4.4:1, bajo el mínimo AA. |
| 2026-09-29 | Canvas en pixeles físicos, periodo de scanline entero, flicker en JS, 30 fps, bloom de 8 a 4 capas. | Moiré en escalas 125%/150%, flicker degradado en GPUs `mediump`, costo de GPU al hacer scroll. |
| 2026-09-29 | Esquinas del tubo, borde oscurecido, banda de refresco, grano, cursor, encendido del tubo. | Reforzar la sensación de monitor antiguo sin tocar el layout. |
| 2026-09-29 | Menú móvil "ABRIR COMANDOS" reemplazado por los dos links siempre visibles. | Con dos destinos, esconderlos detrás de un botón solo agrega un toque. |
| 2026-09-29 | Página activa marcada en el menú (`aria-current`), skip link, foco visible, `h1` por página, títulos de pestaña descriptivos, meta description, favicon. | Orientación, accesibilidad y SEO básicos. |
| 2026-09-29 | La página ya no queda oculta si el JS falla (respaldo CSS). | Antes el `opacity: 0` en línea podía dejar la página en blanco. |
| 2026-09-29 | Prompt sincronizado con la URL al cargar. | Entrando directo o con "atrás", el prompt mostraba un directorio equivocado. |
| 2026-09-29 | Interruptor de animaciones movido del footer al panel "Estado del servidor". | En el footer quedaba desprolijo; como línea de estado encaja con el tema. La preferencia persiste en todas las páginas. |
| 2026-09-29 | Se quita el reflejo del vidrio (esquina superior izquierda). | Pedido del autor: no aportaba y ensuciaba esa esquina. |
| 2026-09-29 | Mobile: scanlines más finas, overlays con `lvh`, bloom de 3 capas, historial de 2 líneas, sin "Top Posts", paddings más chicos, `:hover` solo con mouse. | En teléfonos las scanlines cortaban las letras, los efectos se cortaban al hacer scroll y el layout duplicaba contenido y dejaba ~27 caracteres por línea. |
| 2026-09-29 | Cursor `>` de los links movido adentro del elemento, con su espacio reservado en el padding. | Afuera se superponía con líneas y elementos vecinos. |
| 2026-09-29 | Artículo de Perfil y posts vuelve a ocupar todo el ancho. | Una clase pegada (`md:p-5grow-3`) anulaba `grow-3` y el artículo quedaba en su base de 600px. |
