// Runtime dev flag is centralized via fa.dev localStorage key; build-time VITE_DEV_UI can bootstrap it.
function runtimeDevFlag(): boolean {
  try {
    if (localStorage.getItem('fa.dev') === '1') return true;
    // Migrate legacy DEV_UI key transparently
    if (localStorage.getItem('DEV_UI') === '1') {
      localStorage.setItem('fa.dev', '1');
      localStorage.removeItem('DEV_UI');
      return true;
    }
  } catch {}
  return (import.meta as any).env?.VITE_DEV_UI === '1';
}

export const flags = {
  dev: runtimeDevFlag(),

  planner:
    import.meta.env.VITE_FEATURE_PLANNER === '1' ||
    localStorage.getItem('FEATURE_PLANNER') === '1',
  ruleTester:
    import.meta.env.VITE_FEATURE_RULE_TESTER === '1' ||
    localStorage.getItem('FEATURE_RULE_TESTER') === '1' ||
    runtimeDevFlag(),
  mlSelftest:
    import.meta.env.VITE_FEATURE_ML_SELFTEST === '1' ||
    localStorage.getItem('FEATURE_ML_SELFTEST') === '1',
} as const;
