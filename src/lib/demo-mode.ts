// Demo mode turns on one-click persona logins, the persona switcher, PIN hints and "Reset Demo".
// Set VITE_DEMO_MODE=true|false to force it; otherwise it is on for `npm run dev` and off in builds.
const flag = import.meta.env.VITE_DEMO_MODE;

export const DEMO_MODE: boolean = flag !== undefined ? flag === 'true' : import.meta.env.DEV;
