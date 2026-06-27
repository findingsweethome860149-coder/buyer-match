/**
 * Notification Module
 * Responsible for: user notifications.
 * NOT responsible for: modifying any data.
 *
 * V1: in-app toast only.
 * Future: push notifications, LINE, email.
 */
const NotificationModule = (() => {
  let _toastTimer = null;

  function toast(msg, ms = 2400) {
    const el = document.getElementById('toast');
    if (!el) return;
    if (_toastTimer) clearTimeout(_toastTimer);
    el.textContent = msg;
    el.classList.add('show');
    _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // Future: push notification interface (stub)
  function push(/* title, body, data */) {
    // TODO: implement when backend is available
  }

  // Future: LINE message interface (stub)
  function line(/* message */) {
    // TODO: implement when LINE bot backend is available
  }

  return { toast, push, line };
})();
