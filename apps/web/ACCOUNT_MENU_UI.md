# Account Menu UI Specification

## Overview

The account menu is a dropdown that displays the user's email and provides quick access to account-related actions. The design addresses the issue where long email addresses feel cramped and don't wrap nicely, making actions hard to see.

## Current Issue

**Problem:**

- Long email addresses (e.g., `very.long.email.address@example.com`) feel cramped in small dropdown
- Email doesn't wrap nicely, causing overflow or horizontal scrolling
- Action buttons ("Copy email", "Log out") are hard to see when email takes up all the space

**Target Component:** `AccountMenu` (exact filename: `AccountMenu.tsx` or similar)

## Layout Specification

### Dropdown Container

- **Width:** `w-64` (~256px)
- **Border Radius:** `rounded-xl` (larger than default for modern look)
- **Background:** Dark background (e.g., `bg-gray-900` or `bg-slate-900`)
- **Border:** Subtle border (e.g., `border-gray-700`)
- **Shadow:** Elevated shadow (e.g., `shadow-lg`)
- **Alignment:** `align="end"` (right-aligned to trigger button)

### Header Section

**Label:**

- Text: "Account" (all uppercase)
- Size: Small (e.g., `text-xs`)
- Color: Muted (e.g., `text-gray-400`)
- Weight: Medium or semibold

**Email Display:**

- **Own line** (below "Account" label)
- **Text size:** Default or small (e.g., `text-sm`)
- **Color:** Primary text (e.g., `text-white` or `text-gray-100`)
- **Word breaking:** `break-all` to prevent overflow
- **Wrapping:** Allow multi-line (`whitespace-normal` or default)
- **Max width:** Constrained by dropdown width (w-64)

**Example Layout:**

```
┌─────────────────────────────┐
│  ACCOUNT                    │
│  very.long.email.address@   │
│  example.com                │
├─────────────────────────────┤
│  📋 Copy email              │
│  🚪 Log out                 │
└─────────────────────────────┘
```

### Action Rows

**Style:**

- Comfortable padding (e.g., `px-4 py-2.5`)
- Clear hover states (e.g., `hover:bg-gray-800`)
- Icon + text layout (horizontal flex)
- Icon on the left, text on the right

**Actions:**

1. **Copy Email**

   - Icon: `Copy` from `lucide-react`
   - Text: "Copy email"
   - Behavior: Copy user's email to clipboard, show toast confirmation

2. **Log Out**
   - Icon: `LogOut` from `lucide-react`
   - Text: "Log out"
   - Behavior: Trigger logout flow, redirect to login

**Hover States:**

- Background change (e.g., `hover:bg-gray-800`)
- Smooth transition (e.g., `transition-colors`)
- Cursor changes to pointer

## Test IDs

| Element           | Test ID                   | Description                         |
| ----------------- | ------------------------- | ----------------------------------- |
| Trigger Button    | `account-menu`            | Button that opens the dropdown menu |
| Copy Email Action | `account-menu-copy-email` | Row/button to copy email            |
| Logout Action     | `account-menu-logout`     | Row/button to log out               |

**Note:** The dropdown content itself doesn't need a separate test ID (accessible via trigger).

## Example Code Structure

```typescript
import { Copy, LogOut } from "lucide-react";

<DropdownMenu>
  <DropdownMenuTrigger data-testid="account-menu" asChild>
    <Button variant="ghost">
      <UserCircle className="h-5 w-5" />
    </Button>
  </DropdownMenuTrigger>

  <DropdownMenuContent
    align="end"
    className="w-64 rounded-xl bg-gray-900 border-gray-700 shadow-lg"
  >
    {/* Header with email */}
    <div className="px-4 py-3 border-b border-gray-700">
      <div className="text-xs font-medium text-gray-400 uppercase mb-1">
        Account
      </div>
      <div className="text-sm text-white break-all">{user.email}</div>
    </div>

    {/* Actions */}
    <DropdownMenuItem
      data-testid="account-menu-copy-email"
      className="px-4 py-2.5 hover:bg-gray-800 transition-colors cursor-pointer"
      onClick={handleCopyEmail}
    >
      <Copy className="h-4 w-4 mr-2" />
      Copy email
    </DropdownMenuItem>

    <DropdownMenuItem
      data-testid="account-menu-logout"
      className="px-4 py-2.5 hover:bg-gray-800 transition-colors cursor-pointer"
      onClick={handleLogout}
    >
      <LogOut className="h-4 w-4 mr-2" />
      Log out
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>;
```

## Playwright Test Specification

**File:** `account-menu.spec.ts`

**Tags:** `@prod`, `@ui`

### Test Cases

#### 1. Menu Opens and Displays Email

```typescript
test("@prod @ui account menu shows email", async ({ page }) => {
  await page.goto("/");

  // Open menu
  await page.locator('[data-testid="account-menu"]').click();

  // Assert email is visible
  const emailText = await page
    .locator('[data-testid="account-menu"]')
    .locator("..") // Navigate to dropdown content
    .textContent();

  expect(emailText).toContain("@"); // Basic email check
});
```

#### 2. Email Wraps Correctly for Long Addresses

```typescript
test("@prod @ui long email wraps without overflow", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-testid="account-menu"]').click();

  // Get email element
  const emailElement = page.locator("text=@").first();

  // Check that email doesn't overflow container
  const emailBox = await emailElement.boundingBox();
  const containerBox = await page.locator('[role="menu"]').boundingBox();

  expect(emailBox!.width).toBeLessThanOrEqual(containerBox!.width);
});
```

#### 3. Copy Email Action Works

```typescript
test("@prod @ui copy email action", async ({ page, context }) => {
  await page.goto("/");

  await page.locator('[data-testid="account-menu"]').click();
  await page.locator('[data-testid="account-menu-copy-email"]').click();

  // Assert clipboard contains email
  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText()
  );
  expect(clipboardText).toContain("@");

  // Assert toast appears
  await expect(page.locator("text=/copied/i")).toBeVisible();
});
```

#### 4. Logout Action Triggers Logout

```typescript
test("@prod @ui logout action works", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-testid="account-menu"]').click();
  await page.locator('[data-testid="account-menu-logout"]').click();

  // Assert redirect to login page
  await expect(page).toHaveURL(/\/login/);
});
```

#### 5. Both Actions Are Clickable

```typescript
test("@prod @ui actions are visible and clickable", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-testid="account-menu"]').click();

  // Assert copy action is visible and clickable
  const copyAction = page.locator('[data-testid="account-menu-copy-email"]');
  await expect(copyAction).toBeVisible();
  await expect(copyAction).toBeEnabled();

  // Assert logout action is visible and clickable
  const logoutAction = page.locator('[data-testid="account-menu-logout"]');
  await expect(logoutAction).toBeVisible();
  await expect(logoutAction).toBeEnabled();
});
```

## Accessibility Considerations

1. **Keyboard Navigation:**

   - Menu should open with `Enter` or `Space` on trigger
   - Arrow keys should navigate between actions
   - `Escape` should close menu

2. **Screen Readers:**

   - Trigger should have `aria-label="Account menu"`
   - Actions should have descriptive text (not just icons)
   - Email should be announced when menu opens

3. **Focus Management:**
   - Focus should move to first action when menu opens
   - Focus should return to trigger when menu closes
   - Tab should cycle through actions

## Design Rationale

**Why `break-all` instead of `break-words`?**

- Long emails often have no natural break points (e.g., `verylongemailaddress@example.com`)
- `break-words` would keep the entire email on one line if possible, causing overflow
- `break-all` ensures the email always fits within the container, even if it breaks mid-word

**Why separate "Account" label?**

- Provides visual hierarchy
- Makes it clear this is account-related (not just a random email display)
- Follows common UI patterns (e.g., GitHub, Linear)

**Why `w-64`?**

- Wide enough for most emails to wrap to 2-3 lines max
- Narrow enough to feel compact and not intrusive
- Standard Tailwind width that works well for dropdowns

## Future Improvements

- [ ] Add "Account settings" action
- [ ] Show user avatar/initials
- [ ] Display account type (e.g., "Free", "Pro")
- [ ] Add keyboard shortcuts (e.g., "⌘K → L" for logout)
- [ ] Show last login time
- [ ] Add "Switch account" for multi-account support
