// =====================================================
// dialog.js — Custom Alert & Confirm UI Module
// Replaces native browser alert() and confirm() with
// a styled, accessible modal dialog.
// =====================================================

const STYLES = `
  #eqms-dialog-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(15,23,42,0.45);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    z-index: 99999;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  #eqms-dialog-backdrop.eqms-open { display: flex; }
  #eqms-dialog-box {
    background: #ffffff;
    border-radius: 20px;
    padding: 32px 28px 24px;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 32px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
    text-align: center;
    transform: scale(0.88);
    opacity: 0;
    transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease;
  }
  #eqms-dialog-backdrop.eqms-open #eqms-dialog-box {
    transform: scale(1);
    opacity: 1;
  }
  .eqms-dialog-icon-wrap {
    width: 64px; height: 64px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 20px;
  }
  .eqms-dialog-icon-wrap span {
    font-family: 'Material Symbols Outlined';
    font-size: 30px;
    line-height: 1;
  }
  .eqms-dialog-title {
    font-size: 17px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 8px;
    font-family: 'Inter', sans-serif;
  }
  .eqms-dialog-msg {
    font-size: 14px;
    color: #64748b;
    margin: 0 0 28px;
    line-height: 1.65;
    font-family: 'Inter', sans-serif;
  }
  .eqms-dialog-actions {
    display: flex;
    gap: 10px;
  }
  .eqms-btn {
    flex: 1;
    padding: 11px 16px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-family: 'Inter', sans-serif;
    transition: filter 0.15s, transform 0.1s;
    outline: none;
  }
  .eqms-btn:hover  { filter: brightness(0.93); }
  .eqms-btn:active { transform: scale(0.97); }
  .eqms-btn:focus-visible { box-shadow: 0 0 0 3px rgba(37,99,235,0.35); }
  .eqms-btn-secondary {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
  }
  .eqms-divider {
    width: 40px; height: 3px;
    border-radius: 9999px;
    margin: 0 auto 18px;
  }
`;

const CONFIGS = {
  success: {
    iconBg:  '#dcfce7', iconColor: '#16a34a', iconName: 'check_circle',
    divider: '#bbf7d0', btnBg: '#16a34a', title: 'Berhasil',
  },
  error: {
    iconBg:  '#fee2e2', iconColor: '#dc2626', iconName: 'error',
    divider: '#fecaca', btnBg: '#dc2626', title: 'Terjadi Kesalahan',
  },
  warning: {
    iconBg:  '#fef9c3', iconColor: '#ca8a04', iconName: 'warning',
    divider: '#fde68a', btnBg: '#2563eb', title: 'Perhatian',
  },
  info: {
    iconBg:  '#dbeafe', iconColor: '#2563eb', iconName: 'info',
    divider: '#bfdbfe', btnBg: '#2563eb', title: 'Informasi',
  },
  confirm: {
    iconBg:  '#ede9fe', iconColor: '#7c3aed', iconName: 'help',
    divider: '#ddd6fe', btnBg: '#2563eb', title: 'Konfirmasi',
  },
};

function ensureDOM() {
  if (document.getElementById('eqms-dialog-backdrop')) return;

  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  const backdrop = document.createElement('div');
  backdrop.id = 'eqms-dialog-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.innerHTML = `
    <div id="eqms-dialog-box">
      <div id="eqms-dialog-icon" class="eqms-dialog-icon-wrap">
        <span id="eqms-dialog-icon-sym"></span>
      </div>
      <div id="eqms-dialog-divider" class="eqms-divider"></div>
      <h3 id="eqms-dialog-title" class="eqms-dialog-title"></h3>
      <p  id="eqms-dialog-msg"   class="eqms-dialog-msg"></p>
      <div id="eqms-dialog-actions" class="eqms-dialog-actions"></div>
    </div>`;
  document.body.appendChild(backdrop);
}

function applyConfig(type, title) {
  const cfg = CONFIGS[type] || CONFIGS.info;
  document.getElementById('eqms-dialog-icon').style.cssText =
    `background:${cfg.iconBg}; color:${cfg.iconColor}`;
  document.getElementById('eqms-dialog-icon-sym').textContent = cfg.iconName;
  document.getElementById('eqms-dialog-divider').style.background = cfg.divider;
  document.getElementById('eqms-dialog-title').textContent = title || cfg.title;
  return cfg;
}

function openBackdrop() {
  document.getElementById('eqms-dialog-backdrop').classList.add('eqms-open');
}

function closeBackdrop() {
  document.getElementById('eqms-dialog-backdrop').classList.remove('eqms-open');
}

function makeBtn(text, bg, cls) {
  const btn = document.createElement('button');
  btn.className = `eqms-btn ${cls}`;
  if (bg) btn.style.background = bg;
  if (bg) btn.style.color = '#ffffff';
  btn.textContent = text;
  return btn;
}

/**
 * Styled alert dialog — replaces native alert().
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 * @param {string} [title]
 * @returns {Promise<void>}
 */
export function showAlert(message, type = 'info', title = null) {
  return new Promise(resolve => {
    ensureDOM();
    const cfg = applyConfig(type, title);
    document.getElementById('eqms-dialog-msg').textContent = message;

    const actions = document.getElementById('eqms-dialog-actions');
    actions.innerHTML = '';

    const okBtn = makeBtn('OK', cfg.btnBg, '');
    okBtn.addEventListener('click', () => { closeBackdrop(); resolve(); });
    actions.appendChild(okBtn);

    openBackdrop();
    setTimeout(() => okBtn.focus(), 80);
  });
}

/**
 * Styled confirm dialog — replaces native confirm().
 * @param {string} message
 * @param {string} [title='Konfirmasi']
 * @param {string} [confirmText='Ya, Lanjutkan']
 * @param {string} [cancelText='Batal']
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, title = 'Konfirmasi', confirmText = 'Ya, Lanjutkan', cancelText = 'Batal') {
  return new Promise(resolve => {
    ensureDOM();
    const cfg = applyConfig('confirm', title);
    document.getElementById('eqms-dialog-msg').textContent = message;

    const actions = document.getElementById('eqms-dialog-actions');
    actions.innerHTML = '';

    const cancelBtn  = makeBtn(cancelText, null, 'eqms-btn-secondary');
    const confirmBtn = makeBtn(confirmText, cfg.btnBg, '');

    cancelBtn.addEventListener('click',  () => { closeBackdrop(); resolve(false); });
    confirmBtn.addEventListener('click', () => { closeBackdrop(); resolve(true);  });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    openBackdrop();
    setTimeout(() => confirmBtn.focus(), 80);
  });
}
