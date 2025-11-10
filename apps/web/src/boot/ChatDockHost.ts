/**
 * ChatDockHost - Custom element with shadow DOM for chat isolation
 * 
 * ARCHITECTURE:
 * - Starts hidden (opacity: 0, pointer-events: none)
 * - Only reveals when iframe posts 'chat:ready' message
 * - Hides on 'chat:error' to prevent black box on failure
 * - Shadow CSS prevents any visual pollution
 */

export class ChatDockHost extends HTMLElement {
  constructor() {
    super();
    
    const shadow = this.attachShadow({ mode: 'open' });
    
    // Inject protective styles
    const style = document.createElement('style');
    style.textContent = `
      :host {
        position: fixed;
        inset: 0;
        display: block;
        background: transparent !important;
        pointer-events: none;      /* inert until ready */
        opacity: 0;                /* hidden until chat is healthy */
        z-index: 2147483000;       /* above app, but transparent by default */
      }
      .backdrop {
        position: absolute;
        inset: 0;
        background: transparent !important;   /* never opaque by default */
      }
      .surface {
        position: absolute;
        inset: auto;
        background: transparent !important;
        pointer-events: auto;                  /* interactive area */
        right: 16px;
        bottom: 16px;
      }
      :host(.ready) {
        opacity: 1;           /* reveal only when chat reports ready */
        pointer-events: auto;
      }
    `;
    shadow.append(style);
    
    // Create structure
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="backdrop"></div>
      <div class="surface"><div id="mount"></div></div>
    `;
    shadow.append(wrap);
  }
}

// Register custom element
if (!customElements.get('lm-chatdock-host')) {
  customElements.define('lm-chatdock-host', ChatDockHost);
}
