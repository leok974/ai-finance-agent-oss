/**
 * Lightweight telemetry wrapper for tracking user actions.
 * Dispatches custom events that can be captured by analytics services.
 */

export interface TelemetryEvent {
  event: string;
  timestamp?: number;
  [key: string]: any;
}

export const telemetry = {
  /**
   * Track a telemetry event
   * @param event - Event name (e.g., 'agent_tool_month_summary')
   * @param props - Additional properties to include with the event
   */
  track: (event: string, props: Record<string, any> = {}) => {
    try {
      const payload: TelemetryEvent = {
        event,
        timestamp: Date.now(),
        ...props,
      };

      // Dispatch as custom event for integration with analytics systems
      window.dispatchEvent(
        new CustomEvent("telemetry", { detail: payload })
      );

      // Optional: Log to console in development
      if (import.meta.env.DEV) {
        console.log("[telemetry]", event, props);
      }
    } catch (err) {
      // Silently fail to prevent telemetry from breaking app functionality
      if (import.meta.env.DEV) {
        console.warn("[telemetry] Failed to track event:", event, err);
      }
    }
  },
};

// Telemetry event names for agent tools
export const AGENT_TOOL_EVENTS = {
  MONTH_SUMMARY: "agent_tool_month_summary",
  FIND_SUBSCRIPTIONS: "agent_tool_find_subscriptions",
  TOP_MERCHANTS: "agent_tool_top_merchants",
  CASHFLOW: "agent_tool_cashflow",
  TRENDS: "agent_tool_trends",
  INSIGHTS: "agent_tool_insights",
  ALERTS: "agent_tool_alerts",
  KPIS: "agent_tool_kpis",
  FORECAST: "agent_tool_forecast",
  ANOMALIES: "agent_tool_anomalies",
  RECURRING: "agent_tool_recurring",
  BUDGET_CHECK: "agent_tool_budget_check",
  SUGGEST_BUDGET: "agent_tool_suggest_budget",
  WHAT_IF: "agent_tool_what_if",
  SEARCH_NL: "agent_tool_search_nl",
  EXPORT_CSV: "agent_tool_export_csv",
  EXPORT_JSON: "agent_tool_export_json",
  EXPORT_MARKDOWN: "agent_tool_export_markdown",
  CLEAR: "agent_tool_clear",
} as const;

// Telemetry event names for transaction categorization
export const CATEGORY_PICKER_EVENTS = {
  OPENED: "category_picker_opened",
  CLOSED: "category_picker_closed",
  SEARCH: "category_picker_search",
  SELECT_SUGGESTION: "category_picker_select_suggestion",
  SELECT_CATEGORY: "category_picker_select_category",
  SAVE: "category_picker_save",
  SAVE_WITH_RULE: "category_picker_save_with_rule",
  CANCEL: "category_picker_cancel",
} as const;
