// Central chart & month related types
export type YearMonth = `${number}-${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'|'09'|'10'|'11'|'12'}`;

export interface ChartPoint { date: string; value: number }
export interface CategoryTotal { name: string; amount: number }
export interface MerchantTotal { name: string; amount: number }

export interface ChartsSummary {
  totalIn: number;
  totalOut: number;
  net: number;
  topCategories: CategoryTotal[];
  topMerchants: MerchantTotal[];
  flows: ChartPoint[];
}

export interface SpendingTrendsReq { months: YearMonth[] }
export interface ChartsMonthReq { month: YearMonth }
export interface LatestMonthResp { month: YearMonth }
