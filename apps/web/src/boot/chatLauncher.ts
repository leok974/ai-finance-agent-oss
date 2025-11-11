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
    btn.innerHTML = "💬"; // replace with SVG if desired
    
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
      fontSize: "24px",
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
