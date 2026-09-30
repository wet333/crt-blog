export const USER_HOST = "wet333@PC";

// Historial inicial para la primera visita, asi el header nunca aparece vacio.
const PROJECT_NAME = "crt-blog";
export const SEED_HISTORY = [
    `${USER_HOST}:~$ git clone https://github.com/wet333/${PROJECT_NAME}.git`,
    `${USER_HOST}:~$ cd ${PROJECT_NAME}`,
    `${USER_HOST}:~/${PROJECT_NAME}$ npm install`,
    `${USER_HOST}:~/${PROJECT_NAME}$ npm run build && npm run dev`,
    `${USER_HOST}:~/${PROJECT_NAME}$ cd ~`,
];

export function getTerminalPS(cwd: string = "~"): string {
    return `${USER_HOST}:${cwd}$`;
}

// "/about/" -> "/about", "" -> "/"
function normalizePath(pathname: string): string {
    const clean = pathname.replace(/\/+$/, "");
    return clean === "" ? "/" : clean;
}

// Comando que "ejecuta" navegar a una ruta: los posts se leen con cat, el resto es un cd.
export function commandForPath(pathname: string): string {
    const path = normalizePath(pathname);
    if (path.startsWith("/blog/")) return `cat ~${path}`;
    return path === "/" ? "cd ~" : `cd ~${path}`;
}

// Directorio que implica una ruta. Los posts no cambian de directorio (se leen con cat),
// por eso devuelven null y el prompt conserva el directorio anterior.
export function cwdForPath(pathname: string): string | null {
    const command = commandForPath(pathname);
    return command.startsWith("cd ") ? command.slice(3) : null;
}
