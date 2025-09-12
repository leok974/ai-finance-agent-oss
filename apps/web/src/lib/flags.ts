export const flags = {
  dev:
    import.meta.env.VITE_DEV_UI === '1' ||
    localStorage.getItem('DEV_UI') === '1',

  planner:
    import.meta.env.VITE_FEATURE_PLANNER === '1' ||
    localStorage.getItem('FEATURE_PLANNER') === '1',
  ruleTester:
    import.meta.env.VITE_FEATURE_RULE_TESTER === '1' ||
    localStorage.getItem('FEATURE_RULE_TESTER') === '1',
  mlSelftest:
    import.meta.env.VITE_FEATURE_ML_SELFTEST === '1' ||
    localStorage.getItem('FEATURE_ML_SELFTEST') === '1',
} as const;
