import { SEED_HISTORY, commandForPath, getTerminalPS } from "../utils/terminal";

// localStorage puede lanzar (modo privado, cookies bloqueadas): el header no debe romperse por eso.
function readStorage(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Sin persistencia: el historial vive solo en esta pagina.
    }
}

class PSHistory {
    private static instance: PSHistory;
    private history: string[] = [];
    private currentLocation: string = "~";
    private static readonly HISTORY_KEY = "ps-history";
    private static readonly LOCATION_KEY = "ps-location";
    private static readonly MAX_ENTRIES = 50;

    private constructor() {
        try {
            const stored = JSON.parse(readStorage(PSHistory.HISTORY_KEY) ?? "null");
            if (Array.isArray(stored) && stored.length > 0) this.history = stored;
        } catch {
            // Historial corrupto: se vuelve a sembrar abajo.
        }
        if (this.history.length === 0) {
            this.history = [...SEED_HISTORY];
            this.save();
        }

        const storedLocation = readStorage(PSHistory.LOCATION_KEY);
        if (storedLocation) this.currentLocation = storedLocation;
    }

    static getInstance(): PSHistory {
        if (!PSHistory.instance) PSHistory.instance = new PSHistory();
        return PSHistory.instance;
    }

    private save(): void {
        this.history = this.history.slice(-PSHistory.MAX_ENTRIES);
        writeStorage(PSHistory.HISTORY_KEY, JSON.stringify(this.history));
    }

    add(command: string, notify: boolean = true): void {
        this.history.push(`${getTerminalPS(this.currentLocation)} ${command}`);
        this.save();

        if (command.startsWith("cd ")) {
            this.currentLocation = command.slice(3).trim();
            writeStorage(PSHistory.LOCATION_KEY, this.currentLocation);
        }

        if (notify) {
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent("ps-history-updated"));
            }, 600);
        }
    }

    // Si se llego a la pagina sin un click registrado (boton atras, URL escrita, recarga
    // tras un link externo), agrega el comando equivalente para que el prompt coincida con la URL.
    syncWithPath(pathname: string): void {
        const command = commandForPath(pathname);
        const last = this.history[this.history.length - 1] ?? "";
        if (!last.endsWith(`$ ${command}`)) this.add(command, false);
    }

    getLatest(count: number): string[] {
        return this.history.slice(-count);
    }

    getLocation(): string {
        return this.currentLocation;
    }
}

export function addPS(command: string): void {
    PSHistory.getInstance().add(command);
}

export function syncPSWithPath(pathname: string): void {
    PSHistory.getInstance().syncWithPath(pathname);
}

export function getPSHistory(count: number = 5): string[] {
    return PSHistory.getInstance().getLatest(count);
}

export function getCurrentLocation(): string {
    return PSHistory.getInstance().getLocation();
}
