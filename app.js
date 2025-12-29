/* =========================================================
   Atom Writer Panel - Shared JS (Vanilla)
   - Auth (JWT access/refresh)
   - authFetch with auto refresh
   - Toasts
   - Modals
   - Nav active
   ========================================================= */

(function () {
  "use strict";

  // ====== CONFIG ======
  // اگر فرانت و بک در یک دامنه هستند، خالی بگذارید.
  // اگر جدا هستند، اینجا تنظیم کنید. مثال: "https://api.example.com"
  const API_BASE = "https://atom-game.ir";

  const STORAGE = {
    access: "atom_access_token",
    refresh: "atom_refresh_token",
    me: "atom_me_cache",
  };

  function apiUrl(path) {
    if (!path) return API_BASE;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const base = API_BASE.replace(/\/$/, "");
    return base + path;
  }

  // ====== Toasts ======
  function getToastsRoot() {
    return document.getElementById("toasts");
  }

  function showToast(message, type = "info", timeoutMs = 3500) {
    const root = getToastsRoot();
    if (!root) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const icon = document.createElement("div");
    icon.className = "toast__icon";

    const text = document.createElement("div");
    text.className = "toast__text";
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    root.appendChild(toast);

    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      toast.style.transition = "opacity .18s ease, transform .18s ease";
      window.setTimeout(() => toast.remove(), 220);
    }, timeoutMs);
  }

  // ====== Tokens ======
  function getAccessToken() {
    return localStorage.getItem(STORAGE.access);
  }

  function getRefreshToken() {
    return localStorage.getItem(STORAGE.refresh);
  }

  function setTokens({ access, refresh }) {
    if (access) localStorage.setItem(STORAGE.access, access);
    if (refresh) localStorage.setItem(STORAGE.refresh, refresh);
  }

  function clearTokens() {
    localStorage.removeItem(STORAGE.access);
    localStorage.removeItem(STORAGE.refresh);
    localStorage.removeItem(STORAGE.me);
  }

  // ====== Helpers ======
  async function safeJson(res) {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      try {
        return await res.json();
      } catch (_) {
        return null;
      }
    }
    try {
      const txt = await res.text();
      return txt || null;
    } catch (_) {
      return null;
    }
  }

  function extractErrorMessage(data) {
    if (!data) return "خطای نامشخص از سمت سرور.";
    if (typeof data === "string") return data;

    if (data.detail) return String(data.detail);

    // DRF style: {field: ["msg1", "msg2"]}
    if (typeof data === "object") {
      const parts = [];
      for (const [k, v] of Object.entries(data)) {
        if (Array.isArray(v)) parts.push(`${k}: ${v.join(" , ")}`);
        else if (typeof v === "string") parts.push(`${k}: ${v}`);
        else if (v && typeof v === "object" && Array.isArray(v.non_field_errors)) {
          parts.push(v.non_field_errors.join(" , "));
        }
      }
      if (parts.length) return parts.join(" | ");
      try {
        return JSON.stringify(data);
      } catch (_) {
        return "خطای نامشخص.";
      }
    }

    return "خطای نامشخص.";
  }

  async function refreshAccessToken() {
    const refresh = getRefreshToken();
    if (!refresh) return false;

    const res = await fetch(apiUrl("/api/token/refresh/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (!res.ok) {
      return false;
    }

    const data = await safeJson(res);
    if (data && data.access) {
      setTokens({ access: data.access });
      return true;
    }
    return false;
  }

  async function authFetch(path, options = {}, _retried = false) {
    const url = apiUrl(path);

    const headers = new Headers(options.headers || {});
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const access = getAccessToken();
    if (access) headers.set("Authorization", `Bearer ${access}`);

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 && !_retried && getRefreshToken()) {
      const ok = await refreshAccessToken();
      if (ok) {
        const access2 = getAccessToken();
        const headers2 = new Headers(options.headers || {});
        if (!headers2.has("Content-Type") && !(options.body instanceof FormData)) {
          headers2.set("Content-Type", "application/json");
        }
        if (access2) headers2.set("Authorization", `Bearer ${access2}`);
        return await fetch(url, { ...options, headers: headers2 });
      }
    }

    return res;
  }

  async function apiJson(path, options = {}) {
    const res = await authFetch(path, options);
    const data = await safeJson(res);
    if (!res.ok) {
      const msg = extractErrorMessage(data);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function requireAuth() {
    if (!getAccessToken()) {
      window.location.href = "index.html";
      return false;
    }
    return true;
  }

  function logout() {
    clearTokens();
    showToast("خروج انجام شد.", "info");
    window.location.href = "index.html";
  }

  // ====== UI Bootstrapping ======
  function setActiveNav() {
    const links = document.querySelectorAll(".nav a[data-nav]");
    if (!links.length) return;

    const filename = decodeURIComponent((window.location.pathname.split("/").pop() || "").trim());

    let activeKey = "dashboard";
    if (filename.toLowerCase() === "posts.html") activeKey = "posts";
    else if (filename.toLowerCase() === "categories.html") activeKey = "categories";
    else if (filename.toLowerCase() === "tags.html") activeKey = "tags";
    else if (filename.toLowerCase() === "author profiles.html") activeKey = "authors";
    else if (filename.toLowerCase() === "index.html" || filename === "") activeKey = "dashboard";

    links.forEach((a) => {
      if (a.dataset.nav === activeKey) a.classList.add("active");
      else a.classList.remove("active");
    });
  }

  function attachLogout(buttonId = "logoutBtn") {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener("click", () => logout());
  }

  function readMeCache() {
    try {
      const raw = localStorage.getItem(STORAGE.me);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeMeCache(me) {
    try {
      localStorage.setItem(STORAGE.me, JSON.stringify(me));
    } catch (_) {}
  }

  function renderCurrentUser() {
    const chip = document.getElementById("currentUser");
    if (!chip) return;

    const me = readMeCache();
    if (me && me.username) {
      const full = [me.first_name, me.last_name].filter(Boolean).join(" ").trim();
      chip.textContent = full ? `${me.username} (${full})` : me.username;
      return;
    }

    chip.textContent = "—";
  }

  async function ensureMe({ silent = true } = {}) {
    try {
      const me = await apiJson("/api/users/users/me/", { method: "GET" });
      writeMeCache(me);
      renderCurrentUser();
      return me;
    } catch (err) {
      if (!silent) showToast(err.message || "خطا در دریافت اطلاعات کاربر", "danger");
      // اگر توکن مشکل داشته باشد، به صفحه لاگین برگرد
      if (err && (err.status === 401 || err.status === 403)) {
        clearTokens();
        window.location.href = "index.html";
      }
      return null;
    }
  }

  // ====== Modals ======
  function openModal(el) {
    if (!el) return;
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(el) {
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function wireModalAutoClose() {
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.matches("[data-close]")) {
        const key = target.getAttribute("data-close");
        if (key === "1") {
          const modal = target.closest(".modal");
          if (modal) closeModal(modal);
        } else {
          const modal = document.getElementById(`${key}Modal`);
          if (modal) closeModal(modal);
        }
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const opened = document.querySelector(".modal:not(.hidden)");
        if (opened) closeModal(opened);
      }
    });
  }

  // ====== Query helper ======
  function toQuery(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      if (Array.isArray(v)) {
        v.forEach((item) => {
          if (item === undefined || item === null || item === "") return;
          q.append(k, String(item));
        });
      } else {
        q.set(k, String(v));
      }
    });
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  // ====== Login ======
  async function login(username, password) {
    // 1) Default JWT endpoint
    try {
      const res1 = await fetch(apiUrl("/api/token/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data1 = await safeJson(res1);
      if (res1.ok && data1 && data1.access) {
        setTokens({ access: data1.access, refresh: data1.refresh });
        return { ok: true, endpoint: "/api/token/" };
      }
    } catch (_) {
      // ignore and try fallback
    }

    // 2) Fallback: admin-login (در برخی بک‌اندها جایگزین توکن است)
    const res2 = await fetch(apiUrl("/api/users/auth/admin-login/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data2 = await safeJson(res2);
    if (!res2.ok) {
      const msg = extractErrorMessage(data2);
      throw new Error(msg || "Login failed");
    }

    // تلاش برای تشخیص ساختار پاسخ
    if (data2 && typeof data2 === "object") {
      if (data2.access) {
        setTokens({ access: data2.access, refresh: data2.refresh });
        return { ok: true, endpoint: "/api/users/auth/admin-login/" };
      }
      if (data2.token) {
        // بعضی بک‌اندها token واحد می‌دهند
        setTokens({ access: data2.token, refresh: "" });
        return { ok: true, endpoint: "/api/users/auth/admin-login/" };
      }
    }

    // اگر پاسخ در Swagger اشتباه تعریف شده باشد و چیزی برنگردد:
    throw new Error("پاسخ لاگین توکن نداشت. لطفاً ساختار پاسخ /api/users/auth/admin-login/ را بررسی کنید.");
  }

  // ===== Expose =====
  window.APP = {
    API_BASE,
    apiUrl,
    toQuery,

    showToast,

    getAccessToken,
    getRefreshToken,
    setTokens,
    clearTokens,

    authFetch,
    apiJson,

    requireAuth,
    logout,

    setActiveNav,
    attachLogout,
    renderCurrentUser,
    ensureMe,

    openModal,
    closeModal,
    wireModalAutoClose,

    login,
  };

  // init
  wireModalAutoClose();
  renderCurrentUser();
  setActiveNav();
})();
