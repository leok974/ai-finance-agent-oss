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
  
  connectedCallback() {
    // Listen for ready/error messages from iframe
    window.addEventListener('message', this.handleMessage);
  }
  
  disconnectedCallback() {
    window.removeEventListener('message', this.handleMessage);
  }
  
  private handleMessage = (e: MessageEvent) => {
    // Only accept messages from same origin
    if (e.origin !== window.location.origin) return;
    
    if (e.data?.type === 'chat:ready') {
      this.classList.add('ready');
      console.log('[chat-host] revealed (ready)');
    }
    
    if (e.data?.type === 'chat:error') {
      this.classList.remove('ready');
      console.warn('[chat-host] hidden (error)');
    }
  };
}

// Register custom element
if (!customElements.get('lm-chatdock-host')) {
  customElements.define('lm-chatdock-host', ChatDockHost);
}
