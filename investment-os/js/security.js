/**
 * Security Module
 * Responsible for: PIN protection, audit log.
 * NOT responsible for: stock data or financial logic.
 *
 * PIN is optional (user-configurable). Stored as FNV-1a hash.
 * Local-only V1: no network authentication, no session tokens.
 * Future: LINE login, Cloud token, multi-device.
 */
const SecurityModule = (() => {
  const AUDIT_KEY      = 'auditLog';
  const PIN_KEY        = 'pin_hash';
  const MAX_AUDIT      = 500;
  const MAX_PIN_FAILS  = 5;
  const PIN_LOCKOUT_MS = 30_000; // 30 seconds

  // ── Audit log ─────────────────────────────────────────────────────────────

  function log(action, detail = '') {
    const entry = { ts: new Date().toISOString(), action, detail };
    const all   = DB.get(AUDIT_KEY, []);
    all.unshift(entry);
    if (all.length > MAX_AUDIT) all.length = MAX_AUDIT;
    DB.set(AUDIT_KEY, all);
  }

  function getAuditLog() { return DB.get(AUDIT_KEY, []); }

  // ── PIN hash (FNV-1a, local-only) ─────────────────────────────────────────

  function _hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h  = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // ── PIN management ────────────────────────────────────────────────────────

  function isPINEnabled() {
    const s = DB.Settings.get();
    return s.pinEnabled === true && !!DB.get(PIN_KEY, null);
  }

  function verifyPIN(pin) {
    const stored = DB.get(PIN_KEY, null);
    return stored !== null && stored === _hash(pin);
  }

  function setPIN(pin) {
    DB.set(PIN_KEY, _hash(pin));
    const s = DB.Settings.get();
    s.pinEnabled = true;
    DB.Settings.save(s);
    log('setPIN');
  }

  function disablePIN() {
    DB.remove(PIN_KEY);
    const s = DB.Settings.get();
    s.pinEnabled = false;
    DB.Settings.save(s);
    log('disablePIN');
  }

  // ── PIN UI state ──────────────────────────────────────────────────────────

  let _entered     = '';
  let _mode        = 'verify'; // 'verify' | 'set' | 'confirm'
  let _newPIN      = '';
  let _onSuccess   = null;
  let _onCancel    = null;
  let _allowCancel = true;
  let _failCount   = 0;
  let _locked      = false;

  /**
   * Show PIN prompt for verification.
   * opts: { title, allowCancel, onSuccess, onCancel }
   */
  function prompt({ title = '輸入 PIN 碼', allowCancel = true, onSuccess, onCancel } = {}) {
    _entered     = '';
    _mode        = 'verify';
    _newPIN      = '';
    _onSuccess   = onSuccess  || (() => {});
    _onCancel    = onCancel   || (() => {});
    _allowCancel = allowCancel;
    _failCount   = _locked ? _failCount : 0;
    _show(title);
  }

  /**
   * Show PIN prompt for setting a new PIN (set → confirm flow).
   * opts: { onSuccess, onCancel }
   */
  function promptSetNew({ onSuccess, onCancel } = {}) {
    _entered     = '';
    _mode        = 'set';
    _newPIN      = '';
    _onSuccess   = onSuccess || (() => {});
    _onCancel    = onCancel  || (() => {});
    _allowCancel = true;
    _failCount   = 0;
    _locked      = false;
    _show('設定新 PIN 碼（4 位數）');
  }

  function _show(title) {
    const overlay   = document.getElementById('pinOverlay');
    const titleEl   = document.getElementById('pinTitle');
    const cancelBtn = document.getElementById('pinCancelBtn');
    if (titleEl)   titleEl.textContent = title;
    if (cancelBtn) cancelBtn.style.display = _allowCancel ? '' : 'none';
    _updateDots();
    _setError('');
    if (overlay) overlay.style.display = 'flex';
  }

  function _hide() {
    const overlay = document.getElementById('pinOverlay');
    if (overlay) overlay.style.display = 'none';
    _entered = '';
    _updateDots();
  }

  // ── PIN input handlers (called from HTML onclick) ─────────────────────────

  function _pinInput(digit) {
    if (_locked || _entered.length >= 4) return;
    _entered += digit;
    _updateDots();
    if (_entered.length === 4) setTimeout(_submit, 150);
  }

  function _pinDel() {
    if (_locked) return;
    _entered = _entered.slice(0, -1);
    _updateDots();
  }

  function _pinCancel() {
    if (!_allowCancel) return;
    _hide();
    _onCancel();
  }

  // ── PIN submission ────────────────────────────────────────────────────────

  function _submit() {
    if (_mode === 'verify') {
      if (verifyPIN(_entered)) {
        _hide();
        _failCount = 0;
        _locked    = false;
        _onSuccess();
      } else {
        _failCount++;
        _shake();
        if (_failCount >= MAX_PIN_FAILS) {
          _locked = true;
          _setError('嘗試次數過多，請 30 秒後再試');
          setTimeout(() => { _locked = false; _failCount = 0; _setError(''); }, PIN_LOCKOUT_MS);
        } else {
          _setError(`PIN 不正確，還有 ${MAX_PIN_FAILS - _failCount} 次機會`);
        }
        setTimeout(() => { _entered = ''; _updateDots(); }, 600);
      }

    } else if (_mode === 'set') {
      _newPIN  = _entered;
      _entered = '';
      _mode    = 'confirm';
      const el = document.getElementById('pinTitle');
      if (el) el.textContent = '再次輸入確認';
      _updateDots();
      _setError('');

    } else if (_mode === 'confirm') {
      if (_entered === _newPIN) {
        setPIN(_entered);
        _hide();
        _onSuccess();
      } else {
        _shake();
        _setError('兩次輸入不同，請重新設定');
        setTimeout(() => {
          _entered = '';
          _newPIN  = '';
          _mode    = 'set';
          const el = document.getElementById('pinTitle');
          if (el) el.textContent = '設定新 PIN 碼（4 位數）';
          _updateDots();
          _setError('');
        }, 800);
      }
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function _updateDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('pd' + i);
      if (!dot) return;
      dot.classList.toggle('filled', i < _entered.length);
      dot.classList.remove('error');
    }
  }

  function _setError(msg) {
    const el = document.getElementById('pinError');
    if (el) el.textContent = msg;
  }

  function _shake() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('pd' + i);
      if (dot) dot.classList.add('error');
    }
    const dots = document.getElementById('pinDots');
    if (!dots) return;
    dots.classList.remove('pin-shake');
    void dots.offsetWidth; // reflow to restart animation
    dots.classList.add('pin-shake');
    setTimeout(() => dots.classList.remove('pin-shake'), 500);
  }

  return {
    log, getAuditLog,
    isPINEnabled, verifyPIN, setPIN, disablePIN,
    prompt, promptSetNew,
    // Called from HTML onclick — must be on the public API
    _pinInput, _pinDel, _pinCancel,
  };
})();
