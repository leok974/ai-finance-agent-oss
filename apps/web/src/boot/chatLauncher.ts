/**
 * chatLauncher.ts - Chat bubble launcher button
 * Lives in parent page, toggles chat overlay visibility
 */

export function ensureChatLauncher(onClick: () => void): HTMLButtonElement {
  let btn = document.getElementById("lm-chat-launcher") as HTMLButtonElement | null;

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "lm-chat-launcher";
    btn.type = "button";
    btn.setAttribute("aria-label", "Open chat");
    btn.setAttribute("data-testid", "lm-chat-bubble"); // For E2E tests
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path fill="currentColor" d="M12 3C6.48 3 2 6.94 2 11.8c0 2.48 1.24 4.72 3.24 6.3l-1.08 3.9a.6.6 0 0 0 .84.7l4-1.9c.93.24 1.92.37 2.96.37 5.52 0 10-3.94 10-8.8S17.52 3 12 3Z"/>
      </svg>
    `;

    Object.assign(btn.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      width: "56px",
      height: "56px",
      borderRadius: "28px",
      border: "0",
      background: "linear-gradient(180deg,#1f2937,#111827)",
      color: "white",
      boxShadow: "0 10px 24px rgba(0,0,0,.5)",
      zIndex: "2147482999",
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      transition: "transform 0.15s, box-shadow 0.15s"
    });

    // Hover effect
    btn.addEventListener("mouseenter", () => {
      btn!.style.transform = "scale(1.05)";
      btn!.style.boxShadow = "0 12px 28px rgba(0,0,0,.6)";
    });

    btn.addEventListener("mouseleave", () => {
      btn!.style.transform = "scale(1)";
      btn!.style.boxShadow = "0 10px 24px rgba(0,0,0,.5)";
    });

    document.body.appendChild(btn);
    console.log('[chat-launcher] created');
  }

  btn.onclick = onClick;
  return btn;
}
