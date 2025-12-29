(function () {
  "use strict";

  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");
  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginBtn");

  function showLogin() {
    if (appView) appView.classList.add("hidden");
    if (loginView) loginView.classList.remove("hidden");
  }

  function showApp() {
    if (loginView) loginView.classList.add("hidden");
    if (appView) appView.classList.remove("hidden");
    APP.setActiveNav();
    APP.attachLogout("logoutBtn");
    APP.renderCurrentUser();
  }

  async function boot() {
    // اگر از قبل توکن داریم، تلاش کن اطلاعات کاربر را بگیریم تا مطمئن شویم توکن معتبر است.
    if (APP.getAccessToken()) {
      await APP.ensureMe({ silent: true });
      if (APP.getAccessToken()) {
        showApp();
        return;
      }
    }
    showLogin();
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = (document.getElementById("username")?.value || "").trim();
    const password = (document.getElementById("password")?.value || "").trim();

    if (!username || !password) {
      APP.showToast("نام کاربری و رمز عبور را وارد کنید.", "warning");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "در حال ورود...";

    try {
      await APP.login(username, password);
      await APP.ensureMe({ silent: false });

      APP.showToast("ورود موفق بود ✅", "success");
      showApp();
    } catch (err) {
      APP.showToast(err.message || "ورود ناموفق بود.", "danger");
      showLogin();
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "ورود";
    }
  });

  boot();
})();
