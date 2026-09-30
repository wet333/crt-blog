const VERTEX_SHADER = `
// ================================================================
// VERTEX SHADER - Quad de pantalla completa
//
// Recibe un quad de 4 vertices en clip-space (-1 a 1) y lo convierte
// en coordenadas UV (0 a 1) para que el fragment shader pueda
// muestrear la pantalla. No transforma geometria 3D.
// ================================================================
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
    // Convierte clip-space (-1..1) a UV (0..1)
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
// ================================================================
// FRAGMENT SHADER - Efectos CRT
//
// Genera una capa de overlay que simula un monitor CRT ambar.
// Solo oscurece: la salida es negro con alpha = cuanta oscuridad
// se aplica sobre el contenido (scanlines, vignette, esquinas del
// tubo, flicker y ruido).
//
// Todo lo que cambia por frame (flicker, banda, semilla del ruido)
// lo calcula JS y llega como uniform: asi no depende de la precision
// de floats de la GPU, que en moviles se degrada con el tiempo.
// ================================================================
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 v_uv;
uniform vec2 u_resolution;   // tamaño del canvas en pixeles fisicos
uniform float u_pixelRatio;  // pixeles fisicos por pixel CSS
uniform float u_scanPeriod;  // alto de cada scanline en pixeles fisicos (entero)
uniform float u_scanStrength; // oscuridad del hueco entre scanlines
uniform float u_flicker;     // oscuridad extra del parpadeo en este frame
uniform float u_roll;        // posicion vertical (0..1) de la banda de refresco
uniform float u_noise;       // intensidad del ruido en este frame (0 = apagado)
uniform float u_seed;        // semilla del ruido, cambia en cada frame

// ----------------------------------------------------------------
// HASH - Generador pseudo-aleatorio
//
// Recibe una coordenada 2D y devuelve un valor 0.0 - 1.0.
// Variante sin sin(): da el mismo resultado en todas las GPUs.
// No es criptografico; solo necesita verse "aleatorio" visualmente.
// ----------------------------------------------------------------
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 uv = v_uv;
    vec2 px = gl_FragCoord.xy; // centro del pixel fisico

    // ============================================================
    // SCANLINES - Lineas horizontales oscuras entre filas de fosforo
    //
    // Cada scanline ocupa u_scanPeriod filas fisicas: la primera mitad
    // es fosforo encendido y la segunda el hueco oscuro. Como el
    // periodo es un numero entero de pixeles fisicos (lo calcula JS
    // segun devicePixelRatio), no aparece moire con zoom ni con
    // escalas de pantalla de 125% o 150%. El periodo y la intensidad
    // (u_scanStrength) cambian en pantallas chicas: ver SCANLINES en JS.
    //
    // Config:
    //   0.5 → fraccion de la scanline que es hueco oscuro
    // ============================================================
    float row = mod(floor(px.y), u_scanPeriod);
    float gap = clamp(row + 1.0 - u_scanPeriod * 0.5, 0.0, 1.0);
    float scanDark = gap * u_scanStrength;

    // ============================================================
    // BANDA DE REFRESCO - Franja que baja lentamente por la pantalla
    //
    // Simula el barrido que se ve al filmar un CRT. Dentro de la
    // franja las scanlines se atenuan, asi que se ve apenas mas clara.
    // JS la saca de pantalla (u_roll lejos de 0..1) cuando las
    // animaciones estan apagadas.
    //
    // Config:
    //   0.12 → alto de la franja (fraccion de la pantalla)
    //   0.6  → cuanto atenua las scanlines en el centro de la franja
    // ============================================================
    float band = 1.0 - smoothstep(0.0, 0.12, abs(uv.y - u_roll));
    scanDark *= 1.0 - band * 0.6;

    // ============================================================
    // VIGNETTE - Oscurecimiento en bordes y esquinas
    //
    // Simula la sombra del bisel/curvatura del tubo CRT.
    // Se calcula la distancia del pixel al centro; cuanto mas lejos,
    // mas se oscurece.
    //
    // Config:
    //   vec2(0.7, 0.5) → forma del ovalo (mas bajo = mas redondo)
    //   smoothstep(0.6, 1.4, ...) → 0.6 = donde empieza, 1.4 = donde llega al maximo
    //   0.75 → oscuridad maxima en los bordes (0.0 - 1.0)
    // ============================================================
    vec2 vigCoord = uv * 2.0 - 1.0;
    float vigDist = length(vigCoord * vec2(0.7, 0.5));
    float vigDark = smoothstep(0.6, 1.4, vigDist) * 0.75;

    // ============================================================
    // TUBO - Esquinas redondeadas y borde del vidrio
    //
    // El vidrio de un CRT es curvo: las esquinas se ven redondeadas
    // y la imagen se oscurece justo antes del bisel. Se usa la
    // distancia a un rectangulo redondeado del tamaño del canvas
    // (negativa adentro, positiva afuera).
    //
    // Config:
    //   0.045 → radio de las esquinas (fraccion del lado mas corto)
    //   14.0  → ancho del oscurecimiento del borde (pixeles CSS)
    //   0.35  → oscuridad maxima del borde
    // ============================================================
    float radius = min(u_resolution.x, u_resolution.y) * 0.045;
    vec2 halfSize = u_resolution * 0.5;
    vec2 q = abs(px - halfSize) - halfSize + radius;
    float edgeDist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float bezel = smoothstep(-u_pixelRatio, u_pixelRatio, edgeDist);
    float rimDark = smoothstep(-14.0 * u_pixelRatio, 0.0, edgeDist) * 0.35;

    // ============================================================
    // RUIDO - Grano analogico
    //
    // Un valor aleatorio por pixel CSS que cambia en cada frame.
    // La intensidad la define JS (u_noise); 0.0 lo apaga.
    // ============================================================
    vec2 cell = floor(px / u_pixelRatio);
    float noise = (hash(cell + u_seed * 1000.0) - 0.5) * u_noise;

    // ============================================================
    // SALIDA FINAL
    //
    // Alpha = oscuridad total. Fuera del tubo (esquinas) es negro pleno.
    // El canvas usa premultiplied alpha, asi que RGB = 0 y el alpha
    // oscurece el contenido de la pagina.
    // ============================================================
    float totalDark = clamp(scanDark + vigDark + rimDark + u_flicker + noise, 0.0, 1.0);
    totalDark = max(totalDark, bezel);

    gl_FragColor = vec4(0.0, 0.0, 0.0, totalDark);
}
`;

// ================================================================
// CONFIG DE ANIMACION (lado JS)
//
//   FRAME_INTERVAL → cada cuanto se redibuja. El parpadeo de un CRT
//                    se nota a 30 fps; dibujar a 60 solo gasta bateria.
//   FLICKER        → oscuridad maxima del parpadeo (0.0 - ~0.15)
//   NOISE          → intensidad del grano (0.0 - ~0.1)
//   ROLL_SECONDS   → segundos que tarda la banda en cruzar la pantalla
// ================================================================
const FRAME_INTERVAL = 1000 / 30;
const FLICKER = 0.08;
const NOISE = 0.05;
const ROLL_SECONDS = 9;
const ROLL_OFF = -10;

// ================================================================
// SCANLINES (lado JS)
//
// Cada pixel de la fuente mide 2px CSS en pantallas md+ y 1-1.5px en
// mobile (ver escala tipografica en global.css). Las scanlines usan
// la misma frontera (48rem): con el periodo de escritorio en un
// telefono, cada franja oscura tapa filas enteras de las letras y el
// texto se ve cortado.
//
//   period   → alto de cada scanline en pixeles CSS
//   strength → oscuridad del hueco (0.0 = sin scanlines, ~0.4 = muy marcadas)
// ================================================================
const WIDE_SCREEN = window.matchMedia('(min-width: 48rem)');
const SCANLINES = {
    wide: { period: 2, strength: 0.3 },
    compact: { period: 1, strength: 0.22 },
};

// Los overlays miden el alto del viewport grande (lvh): al esconderse la barra del
// navegador movil no queda una franja sin efectos ni se redimensiona el canvas en
// cada cuadro. Si lvh no existe, el navegador descarta esa declaracion y usa 100%.
const OVERLAY_STYLE = 'position:fixed;top:0;left:0;width:100%;height:100%;height:100lvh;pointer-events:none;';

const MOTION_KEY = 'crt-motion';

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function linkProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

function initBloom(): void {
    // ================================================================
    // BLOOM / GLOW DE FOSFORO
    //
    // Simula como los fosforos de un CRT irradian luz alrededor de
    // cada pixel encendido. Funciona en 3 pasos:
    //
    //   1. backdrop-filter captura el contenido visible detras de
    //      esta capa y le aplica blur (difusion) + brightness (brillo)
    //   2. mix-blend-mode: screen hace que esta capa solo SUME luz
    //      sobre el contenido original, sin oscurecerlo nunca
    //   3. opacity controla la intensidad general del efecto
    //
    // Cada capa es un blur de pantalla completa que se recalcula al
    // hacer scroll, asi que se usan pocas capas con radios bien
    // separados (antes eran 8 y el scroll se trababa en equipos modestos).
    // La capa mas fina no debe pasar de ~0.5px: con mas blur la luz
    // inunda los trazos oscuros del texto en video inverso. En
    // pantallas chicas se omite la capa mas grande, la mas cara para
    // una GPU de telefono.
    //
    // Ajustes rapidos:
    //   - blur(Xpx)      → radio del glow (mas = glow mas difuso)
    //   - brightness(X)   → amplitud de la luz (mas = mas brillante)
    //   - opacity          → intensidad global (0.0 a 1.0)
    // ================================================================
    const bloomLayers = [
        { blur: 0.5, brightness: 1.1,  opacity: 0.45 },
        { blur: 2,   brightness: 1.2,  opacity: 0.35 },
        { blur: 8,   brightness: 1.25, opacity: 0.2 },
        { blur: 32,  brightness: 1.15, opacity: 0.1, wideOnly: true },
    ];

    bloomLayers.forEach(({ blur, brightness, opacity, wideOnly }) => {
        if (wideOnly && !WIDE_SCREEN.matches) return;
        const layer = document.createElement('div');
        layer.setAttribute('aria-hidden', 'true');
        layer.style.cssText = OVERLAY_STYLE + [
            'z-index:9998',
            `backdrop-filter:blur(${blur}px) brightness(${brightness})`,
            `-webkit-backdrop-filter:blur(${blur}px) brightness(${brightness})`,
            'mix-blend-mode:screen',
            `opacity:${opacity}`,
        ].join(';');
        document.body.appendChild(layer);
    });
}

// Monta el canvas de scanlines. Devuelve una funcion para prender/apagar las
// animaciones, o null si no hay WebGL.
function initScreen(): ((motion: boolean) => void) | null {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = OVERLAY_STYLE + 'z-index:9999;';
    document.body.appendChild(canvas);

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    const vs = gl && compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = gl && compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl && vs && fs && linkProgram(gl, vs, fs);
    if (!gl || !program) {
        canvas.remove();
        return null;
    }

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const ratioLoc = gl.getUniformLocation(program, 'u_pixelRatio');
    const periodLoc = gl.getUniformLocation(program, 'u_scanPeriod');
    const strengthLoc = gl.getUniformLocation(program, 'u_scanStrength');
    const flickerLoc = gl.getUniformLocation(program, 'u_flicker');
    const rollLoc = gl.getUniformLocation(program, 'u_roll');
    const noiseLoc = gl.getUniformLocation(program, 'u_noise');
    const seedLoc = gl.getUniformLocation(program, 'u_seed');

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let motion = false;
    let rafId = 0;
    let lastFrame = 0;
    const startTime = performance.now();

    const draw = (now: number): void => {
        const pixelRatio = window.devicePixelRatio || 1;
        const scan = WIDE_SCREEN.matches ? SCANLINES.wide : SCANLINES.compact;
        gl.uniform2f(resLoc, canvas.width, canvas.height);
        gl.uniform1f(ratioLoc, pixelRatio);
        // Periodo redondeado a pixeles fisicos enteros (minimo 2: una fila clara y una oscura)
        gl.uniform1f(periodLoc, Math.max(2, Math.round(scan.period * pixelRatio)));
        gl.uniform1f(strengthLoc, scan.strength);

        if (motion) {
            const rollProgress = ((now - startTime) / 1000 / ROLL_SECONDS) % 1;
            gl.uniform1f(flickerLoc, (Math.random() - 0.5) * FLICKER);
            // UV.y crece hacia arriba: arranca arriba de la pantalla y termina debajo
            gl.uniform1f(rollLoc, 1.15 - rollProgress * 1.3);
            gl.uniform1f(noiseLoc, NOISE);
            gl.uniform1f(seedLoc, Math.random());
        } else {
            gl.uniform1f(flickerLoc, 0);
            gl.uniform1f(rollLoc, ROLL_OFF);
            gl.uniform1f(noiseLoc, 0);
            gl.uniform1f(seedLoc, 0);
        }

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const loop = (now: number): void => {
        rafId = requestAnimationFrame(loop);
        // Margen de 2ms para no saltear frames por el jitter de requestAnimationFrame
        if (now - lastFrame < FRAME_INTERVAL - 2) return;
        lastFrame = now;
        draw(now);
    };

    // El canvas se dimensiona en pixeles fisicos exactos para que cada scanline
    // caiga sobre filas reales de la pantalla.
    const resize = (width: number, height: number): void => {
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        gl.viewport(0, 0, canvas.width, canvas.height);
        draw(performance.now());
    };

    const observer = new ResizeObserver(([entry]) => {
        const box = entry.devicePixelContentBoxSize?.[0];
        const pixelRatio = window.devicePixelRatio || 1;
        if (box) resize(box.inlineSize, box.blockSize);
        else resize(Math.round(entry.contentRect.width * pixelRatio), Math.round(entry.contentRect.height * pixelRatio));
    });
    try {
        observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
        observer.observe(canvas);
    }

    return (on: boolean): void => {
        motion = on;
        cancelAnimationFrame(rafId);
        if (on) rafId = requestAnimationFrame(loop);
        else draw(performance.now());
    };
}

function readMotionPreference(): boolean {
    try {
        const stored = localStorage.getItem(MOTION_KEY);
        if (stored) return stored === 'on';
    } catch {
        // Sin storage: se usa la preferencia del sistema.
    }
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Boton del panel "Estado del servidor" (solo en Inicio) para pausar parpadeo, banda,
// ruido y cursor (WCAG 2.2.2). La preferencia se guarda y aplica en todas las paginas.
function initMotionToggle(setMotion: (on: boolean) => void): void {
    const button = document.getElementById('crt-motion-toggle');
    const state = button?.querySelector('[data-state]');
    let motion = readMotionPreference();

    const apply = (): void => {
        document.documentElement.dataset.crtMotion = motion ? 'on' : 'off';
        button?.setAttribute('aria-pressed', String(motion));
        if (state) state.textContent = motion ? '[ON]' : '[OFF]';
        setMotion(motion);
    };

    apply();
    if (!button) return;

    button.hidden = false;
    button.addEventListener('click', () => {
        motion = !motion;
        try {
            localStorage.setItem(MOTION_KEY, motion ? 'on' : 'off');
        } catch {
            // La preferencia dura solo esta pagina.
        }
        apply();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        initBloom();
        const setMotion = initScreen();
        initMotionToggle((on) => setMotion?.(on));
    } finally {
        // Muestra la pagina recien cuando el primer frame con efectos esta listo.
        requestAnimationFrame(() => document.documentElement.classList.remove('crt-booting'));
    }
});
