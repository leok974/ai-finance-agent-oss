/// <reference types="vite/client" />

// Vite-defined globals from vite.config.ts
declare const __WEB_BRANCH__: string;
declare const __WEB_COMMIT__: string;

interface ImportMetaEnv {
	readonly VITE_SUGGESTIONS_ENABLED?: string;
}
