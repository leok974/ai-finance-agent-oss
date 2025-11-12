/// <reference types="vite/client" />

// Vite-defined globals from vite.config.ts
declare const __WEB_BRANCH__: string;
declare const __WEB_COMMIT__: string;
declare const __WEB_BUILD_ID__: string;
declare const __WEB_BUILD_TIME__: string;
declare const __RUNTIME_BUILD_ID__: string;

interface ImportMetaEnv {
	readonly VITE_SUGGESTIONS_ENABLED?: string;
}
