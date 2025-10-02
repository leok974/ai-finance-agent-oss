// Ambient type declarations for helpTooltip.js

export interface HelpResponse {
  mode: 'what' | 'why';
  source?: string;
  text: string;
  etag?: string;
  cached?: boolean;
  stale?: boolean;
  error?: string;
}

export interface GetHelpArgs {
  cardId: string;
  mode: 'what' | 'why';
  month?: string | null;
  ctx: any;
  baseText?: string | null;
}

export function getHelp(args: GetHelpArgs): Promise<HelpResponse>;
