import { logout } from "@/lib/authClient";
import { useAuth } from "@/state/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { LogOut, User2, Copy, Check } from "lucide-react";
import { useState } from "react";

/**
 * AuthMenu for production:
 * - Unauthenticated: Google OAuth button with logo
 * - Authenticated: User avatar/icon button with dropdown menu
 */
export default function AuthMenu() {
  const { user } = useAuth();
  const [emailCopied, setEmailCopied] = useState(false);
  const googleHref = "/api/auth/google/login";

  const handleCopyEmail = async () => {
    if (user?.email) {
      try {
        await navigator.clipboard.writeText(user.email);
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy email:', err);
      }
    }
  };

  // If not logged in, show the Google sign-in button
  if (!user) {
    return (
      <div className="flex items-center justify-center">
        <a
          href={googleHref}
          data-testid="btn-google"
          aria-label="Sign in with Google"
          rel="noopener"
          className="
            inline-flex items-center gap-3
            rounded-full border border-white/20
            px-6 py-3
            text-base font-medium text-white
            hover:bg-white/10 transition-colors
            focus:outline-none focus:ring-2 focus:ring-white/30
          "
        >
          {/* Google G logo SVG */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.6 6.2 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.4 16.3 18.8 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.6 6.2 29.6 4 24 4 15.5 4 8.4 8.6 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.2C29.1 35.5 26.7 36 24 36c-5.2 0-9.6-3.1-11.4-7.6l-6.5 5C8.6 39.4 15.8 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-1.3 3.9-5 8-11.3 8-5.2 0-9.6-3.1-11.4-7.6l-6.5 5C8.6 39.4 15.8 44 24 44c11.1 0 20-8.9 20-20 0-1.3-.1-2.7-.4-3.5z"
            />
          </svg>
          <span>Sign in with Google</span>
        </a>
      </div>
    );
  }

  // If logged in, show user dropdown menu with icon-only button
  // Prefer name over email for avatar letter
  const avatarLetter = ((user as any).name ?? user.email ?? "U").slice(0, 1).toUpperCase();
  const userPicture = (user as any).picture;
  const userName = (user as any).name;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              data-testid="account-menu"
              variant="pill-ghost"
              size="sm"
              className="h-9 w-9 rounded-full p-0 focus:outline-none focus:ring-2 focus:ring-primary/60 hover:ring-2 hover:ring-primary/30"
              aria-label="Account menu"
            >
              {userPicture ? (
                <Avatar className="h-9 w-9">
                  <AvatarImage src={userPicture} alt={userName ?? "Profile"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {avatarLetter}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {avatarLetter}
                  </AvatarFallback>
                </Avatar>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Account</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-xl border border-slate-700/80 bg-slate-900/95 p-2 shadow-xl shadow-black/40"
      >
        <div className="px-1 pb-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Account
          </div>
          <div className="mt-1 max-w-full break-all text-[13px] font-medium text-slate-50">
            {user.email}
          </div>
        </div>

        <DropdownMenuSeparator className="my-1 bg-slate-700/80" />

        <DropdownMenuItem
          onClick={handleCopyEmail}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-100 hover:bg-slate-800/90 focus:bg-slate-800/90"
          data-testid="account-menu-copy-email"
        >
          {emailCopied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 opacity-80" />
          )}
          <span>{emailCopied ? "Copied!" : "Copy email"}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => logout()}
          className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-rose-200 hover:bg-rose-900/70 focus:bg-rose-900/70"
          data-testid="account-menu-logout"
        >
          <LogOut className="h-3.5 w-3.5 opacity-90" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
