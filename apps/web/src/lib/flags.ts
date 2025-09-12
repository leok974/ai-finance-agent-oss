export const flags = {
  dev:
    import.meta.env.DEV ||
    import.meta.env.VITE_DEV_UI === "1" ||
    localStorage.getItem("DEV_UI") === "1",
  plannerDevtool:
    import.meta.env.VITE_FEATURE_PLANNER_DEVTOOL === "1" ||
    localStorage.getItem("DEV_PLANNER") === "1",
  ruleTester:
    import.meta.env.VITE_FEATURE_RULE_TESTER === "1" ||
    localStorage.getItem("DEV_RULES") === "1",
  mlSelftest:
    import.meta.env.VITE_FEATURE_ML_SELFTEST === "1" ||
    localStorage.getItem("DEV_ML") === "1",
};
