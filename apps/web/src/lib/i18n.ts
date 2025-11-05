// Strongly-typed i18n layer with key + variable inference.
// Extend dictionaries in-place; keys become part of I18nKey union automatically.

export interface Dict {
  [k: string]: string | Dict;
}

export const dictionaries = {
  en: {
    cards: {
      overview: { base: 'Overview of total spend, income, and net for {month}.' },
      budgets: { base: 'Budget performance vs configured limits for {month}.' },
      budget_recommendations: { base: 'Automatically generated budget targets derived from historical spend patterns.' },
      insights: { base: 'Spending anomalies vs historical baselines for recent months.' },
      ml_status: { base: 'Status of the ML classification model, classes, feedback counts, and update info.' },
      rule_suggestions: { base: 'AI and mined suggestions for new categorization rules based on patterns.' },
      unknowns: { base: 'Transactions lacking a category that need review and classification.' },
    },
    charts: {
      top_categories: { base: 'Top spending categories ranked by amount for {month}.' },
      month_merchants: { base: 'Top merchants ranked by spending for {month}.' },
      daily_flows: { base: 'Daily inflows and outflows with net trend for {month}.' },
      spending_trends: { base: 'Historical spending trend over the recent months window.' }
    },
    ui: {
      help: {
        what: 'What',
        why: 'Why',
        close: 'Close',
        cached: 'cached',
        ai: 'AI'
      },
      status: {
        deterministic: 'deterministic'
      },
      toast: {
        csv_ingested_title: 'CSV ingested',
        csv_ingested_description: 'Transactions imported. Panels refreshed.',
        dev_ui_soft_on: 'Dev UI (soft) on',
        dev_ui_soft_off: 'Dev UI (soft) off',
        dev_ui_enabled: 'Dev UI enabled',
        dev_ui_disabled: 'Dev UI disabled',
        category_applied: 'Set category → {category}',
        ml_feedback_failed: 'ML feedback failed ({error}). DB updated.',
        // Admin rules / auth flows
        rules_load_failed_title: 'Failed to load rules',
        rule_updated_title: 'Rule updated',
        rule_update_failed_title: 'Failed to update rule',
        rule_deleted_title: 'Rule deleted',
        rule_delete_failed_title: 'Failed to delete rule',
        password_changed_title: 'Password changed successfully',
        password_change_failed_title: 'Password change failed',
        reset_link_sent_title: 'Reset link sent',
        request_failed_title: 'Request failed',
        seed_rule_title: 'Seeded into Rule Tester',
        seed_rule_description: 'Merchant & description copied — adjust and test.',
        seed_rule_action_open: 'Open tester',
        budget_single_applied_title: 'Budget applied',
        budget_single_applied_description: '{category} = {amount}',
        budget_single_apply_failed_title: 'Failed to apply {category}',
        budget_bulk_applied_title: 'Budgets applied',
        budget_bulk_applied_description: '{count} categories — Total {total}',
        budget_bulk_apply_failed_title: 'Failed to apply budgets',
        ml_refresh_failed: 'Refresh failed: {error}',
        ml_selftest_ok: 'Selftest OK in {ms}ms — label={label}, txn={txn}, classes=[{classes}]',
        ml_selftest_no_bump: 'Selftest ran but model timestamp didn’t change (check incremental save).',
        ml_selftest_failed: 'Selftest failed: {error}',
        rule_accepted: 'Accepted: {merchant} → {category}',
        rule_accept_failed: 'Failed to accept',
        rule_dismissed: 'Dismissed: {merchant} → {category}',
        rule_dismiss_failed: 'Failed to dismiss',
        rule_added: 'Rule added: {merchant} → {category}',
        rule_apply_failed: 'Failed to apply',
        rule_ignored: 'Ignored {merchant} → {category}',
        rule_ignore_failed: 'Failed to ignore',
  promoted_rule_success: 'Promoted rule from suggestion',
  promoted_rule_failed: 'Failed to promote rule: {error}',
        signed_out_title: 'Signed out',
        sign_out_failed_title: 'Sign out failed',
        email_copied_title: 'Email copied',
        dev_unlocked_title: 'Dev mode unlocked',
        temp_budget_removed_title: 'Temporary budget removed',
        anomaly_unignored_title: 'Anomaly unignored',
        rule_created_title: 'Rule created',
        rule_created_description: '“{name}” saved successfully.',
        rules_list_load_failed: 'Could not load rules list',
        budget_inline_invalid_amount: 'Enter a valid amount > 0',
        budget_inline_saved_title: 'Saved {category} = {amount}',
        budget_inline_save_failed: 'Failed to save',
        budget_inline_restore_failed: 'Failed to restore',
        budget_inline_delete_failed: 'Failed to delete budget',
        rule_tested_title: 'Rule tested',
        rule_tested_matches_description: 'Matched {count} transaction(s). Will set category: “{category}”.',
        rule_tested_no_matches_description: 'No matches for the selected month. Category would be: “{category}”.',
        rule_test_failed_title: 'Test failed',
        rule_saved_retrained_title: 'Rule saved + retrained',
        rule_saved_retrained_description: 'Reclassified {count} txn(s) to “{category}”.',
        rule_saved_retrained_no_changes_description: 'No existing transactions required changes.',
        rule_saved_title: 'Rule saved',
        rule_saved_description: 'Saved “{name}”.',
        rule_save_failed_title: 'Save failed',
        save_rule_modal_saved_title: 'Saved: {name}',
        save_rule_modal_save_failed_title: 'Failed to save rule',
        suggestion_ignore_removed_title: 'Removed ignore for {merchant} → {category}',
        suggestion_ignore_remove_failed_title: 'Failed to remove',
        import_complete_title: 'Import complete',
        import_complete_description: 'Transactions imported successfully.',
        data_cleared_title: 'All data cleared',
        data_cleared_description: 'Transactions deleted from database.',
        reset_failed_title: 'Reset failed',
        tx_deleted_title: 'Deleted',
        tx_delete_failed_title: 'Delete failed',
        tx_restored_title: 'Restored',
        tx_updated_title: 'Updated',
        tx_bulk_updated_title: 'Bulk updated',
        tx_split_created_title: 'Split created',
        tx_merged_into_title: 'Merged',
        tx_merged_multi_title: 'Merged',
        tx_linked_title: 'Linked'
      },
      charts: {
        overview_title: 'Overview — {month}',
        top_categories_title: 'Top Categories — {month}',
        merchants_title: 'Top Merchants — {month}',
        daily_flows_title: 'Daily Flows — {month}',
        spending_trends_title: 'Spending Trends — last {months} months',
        axis_spend: 'Spend',
        axis_amount: 'Amount',
        legend_spend: 'Spend',
        line_in: 'In',
        line_out: 'Out',
        line_net: 'Net',
        empty_categories: 'No category data.',
        empty_merchants: 'No merchant data.',
        empty_flows: 'No flow data.',
        empty_trends: 'No historical data.'
      },
      metrics: {
        total_spend: 'Total Spend',
        total_income: 'Total Income',
        net: 'Net'
      },
      empty: {
        no_transactions_title: 'No transactions yet',
        charts_note: 'Once you upload, charts will populate automatically.',
        unknowns_note: 'Upload a CSV to view and categorize unknowns.',
        no_budgets_title: 'No budgets to show',
        no_budgets_note: 'Upload a CSV and/or add budget rules to see this panel.',
        upload_csv_banner: 'Upload a CSV to begin. Use the Upload CSV card.',
        upload_csv_above: 'Upload a CSV to begin. Use the Upload CSV card above.'
      },
      cards: {
        unknowns_title: 'Unknowns — {month}',
        budgets_title: 'Budgets — {month}'
      },
      unknowns: {
        header_label: 'Uncategorized transactions',
        tooltip_info: 'These are transactions without a category. Use “Seed rule” to quickly create a rule in the Rule Tester.',
        workflow_hint: 'Review → Seed → Categorize',
        seed_rule: 'Seed rule',
        seed_rule_aria: 'Seed rule (prefill Rule Tester)',
        seed_rule_tooltip: 'Sends merchant/description (and current month) into Rule Tester so you can test & save a rule quickly.',
        explain: 'Explain',
        apply_category: 'Apply {category}',
        promote_rule: 'Promote to rule'
      },
      insights: {
        title: 'Insights',
        item_fallback: 'Insight'
      },
      ml: {
        title: 'ML Status',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
        classes: 'Classes:',
        feedback_count: 'Feedback count:',
        updated: 'Updated:',
        selftest_run: 'Run Selftest',
        selftest_running: 'Running Selftest…',
        selftest_run_title: 'Run an end-to-end incremental learning smoke test'
      },
      rule_suggestions: {
        title: 'Rule Suggestions',
        loading: 'Loading…',
        none: 'No suggestions right now.',
        show_ignores: 'Show ignores',
        hide_ignores: 'Hide ignores',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
        seen_meta: 'Seen {count}× in last {days} days',
        accept: 'Accept',
        accepting: 'Accepting…',
        dismiss: 'Dismiss',
        dismissing: 'Dismissing…',
        apply: 'Apply',
        applying: 'Applying…',
        ignore: 'Ignore',
        ignoring: 'Ignoring…'
      },
      categories: {
        groceries: 'Groceries',
        dining: 'Dining',
        shopping: 'Shopping'
      },
      common: {
        dismiss: 'Dismiss'
      }
    }
  }
  , es: {
    // Partial Spanish scaffold (fall back to en for missing keys)
    ui: {
      toast: {
        csv_ingested_title: 'CSV ingerido',
        csv_ingested_description: 'Transacciones importadas. Paneles actualizados.',
        dev_ui_soft_on: 'Dev UI (soft) activado',
        dev_ui_soft_off: 'Dev UI (soft) desactivado',
        dev_ui_enabled: 'Dev UI habilitado',
        dev_ui_disabled: 'Dev UI deshabilitado',
        category_applied: 'Categoría establecida → {category}',
        ml_feedback_failed: 'Feedback ML falló ({error}). BD actualizada.',
        seed_rule_title: 'Sembrado en Rule Tester',
        seed_rule_description: 'Comerciante y descripción copiados — ajustar y probar.',
        seed_rule_action_open: 'Abrir tester',
        budget_single_applied_title: 'Presupuesto aplicado',
        budget_single_applied_description: '{category} = {amount}',
        budget_single_apply_failed_title: 'Error al aplicar {category}',
        budget_bulk_applied_title: 'Presupuestos aplicados',
        budget_bulk_applied_description: '{count} categorías — Total {total}',
        budget_bulk_apply_failed_title: 'Error al aplicar presupuestos',
        ml_refresh_failed: 'Actualización falló: {error}',
        ml_selftest_ok: 'Selftest OK en {ms}ms — etiqueta={label}, txn={txn}, clases=[{classes}]',
        ml_selftest_no_bump: 'Selftest corrió pero timestamp no cambió (revisar guardado incremental).',
        ml_selftest_failed: 'Selftest falló: {error}',
        rule_accepted: 'Aceptado: {merchant} → {category}',
        rule_accept_failed: 'Error al aceptar',
        rule_dismissed: 'Descartado: {merchant} → {category}',
        rule_dismiss_failed: 'Error al descartar',
        rule_added: 'Regla agregada: {merchant} → {category}',
        rule_apply_failed: 'Error al aplicar',
        rule_ignored: 'Ignorado {merchant} → {category}',
        rule_ignore_failed: 'Error al ignorar',
        signed_out_title: 'Sesión cerrada',
        sign_out_failed_title: 'Error al cerrar sesión',
        email_copied_title: 'Email copiado',
        temp_budget_removed_title: 'Presupuesto temporal eliminado',
        anomaly_unignored_title: 'Anomalía restaurada',
        rule_created_title: 'Regla creada',
        rule_created_description: '“{name}” guardada correctamente.',
        rules_list_load_failed: 'No se pudo cargar la lista de reglas',
        budget_inline_invalid_amount: 'Ingrese un monto válido > 0',
        budget_inline_saved_title: 'Guardado {category} = {amount}',
        budget_inline_save_failed: 'Error al guardar',
        budget_inline_restore_failed: 'Error al restaurar',
        budget_inline_delete_failed: 'Error al eliminar presupuesto',
        rule_tested_title: 'Regla probada',
        rule_tested_matches_description: 'Coincidió {count} transacción(es). Categoría: “{category}”.',
        rule_tested_no_matches_description: 'Sin coincidencias. Categoría sería: “{category}”.',
        rule_test_failed_title: 'Prueba falló',
        rule_saved_retrained_title: 'Regla guardada + reentrenada',
        rule_saved_retrained_description: 'Reclasificadas {count} txn(s) a “{category}”.',
        rule_saved_retrained_no_changes_description: 'No se requirieron cambios.',
        rule_saved_title: 'Regla guardada',
        rule_saved_description: 'Guardada “{name}”.',
        rule_save_failed_title: 'Error al guardar',
        save_rule_modal_saved_title: 'Guardado: {name}',
        save_rule_modal_save_failed_title: 'Error al guardar regla',
        suggestion_ignore_removed_title: 'Ignorado eliminado {merchant} → {category}',
        suggestion_ignore_remove_failed_title: 'Error al eliminar',
        import_complete_title: 'Importación completa',
        import_complete_description: 'Transacciones importadas correctamente.',
        data_cleared_title: 'Datos eliminados',
        data_cleared_description: 'Transacciones eliminadas de la base de datos.',
        reset_failed_title: 'Reinicio falló',
        tx_deleted_title: 'Eliminado',
        tx_delete_failed_title: 'Error al eliminar',
        tx_restored_title: 'Restaurado',
        tx_updated_title: 'Actualizado',
        tx_bulk_updated_title: 'Actualización masiva',
        tx_split_created_title: 'División creada',
        tx_merged_into_title: 'Fusionado',
        tx_merged_multi_title: 'Fusionado',
        tx_linked_title: 'Vinculado'
      }
    }
  }
} as const;

export type Locales = keyof typeof dictionaries;
let currentLocale: Locales = 'en';
export function setLocale(loc: Locales) { currentLocale = loc; }
export function getLocale(): Locales { return currentLocale; }

// ----- Key + var typing -----
type Leaves<T, P extends string = ''> =
  T extends string ? P : {
    [K in keyof T & string]: Leaves<T[K], `${P}${P extends '' ? '' : '.'}${K}`>
  }[keyof T & string];

export type I18nKey = Leaves<typeof dictionaries['en']>;

type VarsFrom<S extends string> =
  string extends S ? Record<string, string | number> :
  S extends `${string}{${infer V}}${infer R}`
    ? ({ [K in V | keyof VarsFrom<R>]: string | number })
    : Record<string, never>;

function getFromDict(dict: Dict, path: string): string | undefined {
  return path.split('.').reduce<any>((acc, k) => (acc && (acc as any)[k]) as any, dict) as any;
}

const cache = new Map<string, string>();

export function t<K extends I18nKey>(key: K, vars?: VarsFrom<NonNullable<ReturnType<typeof getFromDict>> & string>): string {
  const dict = dictionaries[currentLocale] as unknown as Dict;
  const cacheKey = `${currentLocale}::${key}::${vars ? JSON.stringify(vars) : ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const tmpl = getFromDict(dict, key) ?? getFromDict(dictionaries.en as unknown as Dict, key);
  if (typeof tmpl !== 'string') return key; // fallback to key sentinel
  const out = tmpl.replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars ? String(vars[k]) : `{${k}}`));
  cache.set(cacheKey, out);
  return out;
}

export function clearI18nCache() { cache.clear(); }
