import React from "react";
import DbRevBadge from "./DbRevBadge";
import { Button } from "@/components/ui/button";
import { t } from '@/lib/i18n';

interface Props {
  onDismiss?: () => void;
  dbRev?: string;
  inSync?: boolean;
}

const TopEmptyBanner: React.FC<Props> = ({ onDismiss, dbRev, inSync }) => {
  return (
    <div className="mb-3 rounded-xl border border-amber-700 bg-amber-900/30 p-3 text-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold">{t('ui.empty.no_transactions_title')}</div>
          <div className="opacity-90">
            {t('ui.empty.upload_csv_banner')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dbRev && <DbRevBadge dbRevision={dbRev} inSync={inSync} />}
          {onDismiss && (
            <Button variant="pill-outline" className="text-xs h-7 px-2 border-amber-600/50 hover:bg-amber-800/30" onClick={onDismiss} title={t('ui.common.dismiss')}>
              {t('ui.common.dismiss')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopEmptyBanner;
