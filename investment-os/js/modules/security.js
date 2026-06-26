/**
 * Security Module
 * Responsible for: authentication, PIN, audit log.
 * NOT responsible for: stock data or financial logic.
 *
 * V1: audit log only.
 * Future: PIN lock, LINE whitelist, session management.
 */
const SecurityModule = (() => {
  const AUDIT_KEY = 'auditLog';
  const MAX_ENTRIES = 500;

  function log(action, detail = '') {
    const entry = {
      ts: new Date().toISOString(),
      action,
      detail,
    };
    const all = DB.get(AUDIT_KEY, []);
    all.unshift(entry);
    if (all.length > MAX_ENTRIES) all.length = MAX_ENTRIES;
    DB.set(AUDIT_KEY, all);
  }

  function getAuditLog() {
    return DB.get(AUDIT_KEY, []);
  }

  // Future: PIN lock interface (stub)
  function verifyPIN(/* pin */) {
    // TODO: implement PIN verification
    return true;
  }

  // Future: LINE whitelist (stub)
  function isWhitelisted(/* lineUserId */) {
    // TODO: implement LINE whitelist check
    return false;
  }

  return { log, getAuditLog, verifyPIN, isWhitelisted };
})();
