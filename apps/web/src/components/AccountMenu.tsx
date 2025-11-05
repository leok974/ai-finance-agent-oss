import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mail, LogOut, UserRound, ChevronDown, Key, Unlock } from "lucide-react";
import { emitToastSuccess, emitToastError } from "@/lib/toast-helpers";
import { t } from '@/lib/i18n';
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { DevUnlockModal } from "@/components/DevUnlockModal";
import { useAuth } from "@/state/auth";
import { useDev } from "@/state/dev";

type Props = {
  email?: string | null;
  onLogout?: () => Promise<void> | void;
  avatarUrl?: string | null;
};

function initials(email?: string | null) {
  if (!email) return "U";
  const name = (email.split("@")[0] || "").replace(/[^a-z0-9]+/gi, " ").trim();
  const parts = name.split(/\s+/);
  const a = parts[0] || name;
  const b = parts[1] || "";
  return (a[0] || "U").toUpperCase() + (b[0]?.toUpperCase() || "");
}

export default function AccountMenu({ email, onLogout, avatarUrl }: Props) {
  const [showChangePassword, setShowChangePassword] = React.useState(false);
  const [showDevUnlock, setShowDevUnlock] = React.useState(false);
  const { user } = useAuth();
  const { isUnlocked: isDevUnlocked } = useDev();

  const handleLogout = async () => {
    try {
      await onLogout?.();
      emitToastSuccess(t('ui.toast.signed_out_title'));
    } catch (err: unknown) {
      emitToastError(t('ui.toast.sign_out_failed_title'), { description: String(err instanceof Error ? err.message : err) });
    }
  };

  const handleDevUnlockSuccess = () => {
    emitToastSuccess(t('ui.toast.dev_unlocked_title'));
  };

  // Check if user is eligible for dev unlock (DEV_SUPERUSER_EMAIL in dev env)
  const canUnlockDev = user?.env === 'dev' && user?.email && !isDevUnlocked;

  return (
    <div data-testid="account-menu">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="pill"
            size="sm"
            aria-label="Account"
            className={[
              "gap-2 pl-2 pr-2",
              // glow the pill while the menu is open (Radix adds data-state)
              "data-[state=open]:from-emerald-700 data-[state=open]:to-emerald-800 data-[state=open]:text-emerald-50",
            ].join(" ")}
            data-testid="account-menu-trigger"
            title={email || "Account"}
          >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="User avatar"
              className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10"
            />
          ) : email ? (
            <span className="h-5 w-5 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[10px]">
              {initials(email)}
            </span>
          ) : (
            <span className="h-5 w-5 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
              <UserRound className="h-3.5 w-3.5 opacity-80" />
            </span>
          )}

            <span className="hidden sm:inline">Account</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-75" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          {email && (
          <DropdownMenuItem
            onClick={() =>
              navigator.clipboard
                .writeText(email)
                .then(() => emitToastSuccess(t('ui.toast.email_copied_title')))
            }
            className="flex items-center gap-2 cursor-pointer"
          >
            <Mail className="h-4 w-4 opacity-70" />
            <span title={email} className="truncate">
              {email}
            </span>
          </DropdownMenuItem>
        )}
          <DropdownMenuSeparator />
          {email && (
            <DropdownMenuItem
              onClick={() => setShowChangePassword(true)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Key className="h-4 w-4 opacity-70" />
              <span>Change Password</span>
            </DropdownMenuItem>
          )}
          {canUnlockDev && (
            <DropdownMenuItem
              data-testid="unlock-dev"
              onClick={() => setShowDevUnlock(true)}
              className="flex items-center gap-2 cursor-pointer text-blue-300 focus:text-blue-300"
            >
              <Unlock className="h-4 w-4 opacity-70" />
              <span>Unlock Dev Tools</span>
            </DropdownMenuItem>
          )}
          {isDevUnlocked && (
            <DropdownMenuItem
              disabled
              className="flex items-center gap-2 opacity-60"
            >
              <Unlock className="h-4 w-4 opacity-70" />
              <span>Dev Tools Unlocked ✓</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={handleLogout}
            className="flex items-center gap-2 cursor-pointer text-red-300 focus:text-red-300"
          >
            <LogOut className="h-4 w-4 opacity-70" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={showChangePassword} onOpenChange={setShowChangePassword} />
      <DevUnlockModal
        isOpen={showDevUnlock}
        onClose={() => setShowDevUnlock(false)}
        onSuccess={handleDevUnlockSuccess}
      />
    </div>
  );
}
