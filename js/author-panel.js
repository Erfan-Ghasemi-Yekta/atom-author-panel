// Shared JS for Author Panel
// - Auth guard (requires tokens from login flow)
// - Active sidebar link
// - Logout
// - Optional: show username via /api/users/users/me/
//
// Notes:
// 1) If your panel is hosted on a different origin than the API,
//    set CONFIG.API_BASE_URL.
// 2) This panel expects you already validated "AuthorProfile" at login step.
//    But we still protect pages by requiring a token.

const CONFIG = {
  API_BASE_URL: "https://atom-game.ir",
  ME_ENDPOINT: "/api/users/users/me/",
  // SimpleJWT default refresh endpoint (Django REST Framework)
  REFRESH_ENDPOINT: "/api/token/refresh/",
  LOGIN_URL: "/author-panel/login.html", // change to your login path
  // How many seconds before token expiry we should try to refresh
  EXP_SKEW_SECONDS: 30,
};

function getAccessToken(){
  return localStorage.getItem("atom_access") || "";
}
function getRefreshToken(){
  return localStorage.getItem("atom_refresh") || "";
}
function clearTokens(){
  localStorage.removeItem("atom_access");
  localStorage.removeItem("atom_refresh");
  localStorage.removeItem("atom_logged_in_at");
  localStorage.removeItem("atom_me");
  localStorage.removeItem("atom_author_profile");
}

function redirectToLogin(reason){
  // Keep the current panel URL so we can come back after login.
  const next = window.location.pathname + window.location.search + window.location.hash;
  const url = new URL(CONFIG.LOGIN_URL, window.location.origin);
  url.searchParams.set("next", next);
  if(reason) url.searchParams.set("reason", reason);
  window.location.href = url.toString();
}

function buildApiUrl(path){
  // If the frontend is hosted on a different origin than the API, prepend API_BASE_URL.
  if(/^https?:\/\//i.test(path)) return path;
  return (CONFIG.API_BASE_URL || "") + path;
}

function parseJwt(token){
  try{
    const parts = String(token || "").split(".");
    if(parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  }catch(_){
    return null;
  }
}

function getJwtExpMs(token){
  const payload = parseJwt(token);
  const exp = payload?.exp;
  if(typeof exp !== "number") return null;
  return exp * 1000;
}

function isTokenExpired(token){
  const expMs = getJwtExpMs(token);
  if(!expMs) return false; // If we can't read exp, don't hard-fail.
  const skewMs = (CONFIG.EXP_SKEW_SECONDS || 0) * 1000;
  return Date.now() >= (expMs - skewMs);
}

async function refreshAccessToken(){
  const refresh = getRefreshToken();
  if(!refresh) return null;

  try{
    const rawFetch = window.__atom_raw_fetch || window.fetch.bind(window);
    const res = await rawFetch(buildApiUrl(CONFIG.REFRESH_ENDPOINT), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if(!res.ok) return null;
    const data = await res.json();
    const newAccess = data?.access;
    if(!newAccess) return null;
    localStorage.setItem("atom_access", newAccess);
    localStorage.setItem("atom_logged_in_at", new Date().toISOString());
    return newAccess;
  }catch(_){
    return null;
  }
}

function isApiRequest(input){
  try{
    const url = (input instanceof Request) ? input.url : String(input);
    // Ignore refresh endpoint itself to prevent loops.
    if(url.includes(CONFIG.REFRESH_ENDPOINT)) return false;

    // If a full URL, compare with API_BASE_URL.
    if(/^https?:\/\//i.test(url)){
      if(!CONFIG.API_BASE_URL) return false;
      return url.startsWith(CONFIG.API_BASE_URL);
    }
    // Relative URLs: treat anything under /api/ as API.
    return url.startsWith("/api/");
  }catch(_){
    return false;
  }
}

function ensureAuthHeader(init){
  const out = { ...(init || {}) };
  const headers = new Headers(out.headers || {});
  if(!headers.has("Authorization")){
    const access = getAccessToken();
    if(access) headers.set("Authorization", `Bearer ${access}`);
  }
  out.headers = headers;
  return out;
}

function installFetchInterceptor(){
  // Wrap fetch so that:
  // - Authorization header is automatically added for API calls
  // - 401/403 triggers a refresh attempt; if it fails -> redirect to login
  if(window.__atom_fetch_installed) return;
  window.__atom_fetch_installed = true;

  window.__atom_raw_fetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const apiCall = isApiRequest(input);
    const requestInit = apiCall ? ensureAuthHeader(init) : (init || {});

    // If we already know access is expired, try to refresh before the call.
    if(apiCall && isTokenExpired(getAccessToken())){
      const refreshed = await refreshAccessToken();
      if(!refreshed){
        clearTokens();
        redirectToLogin("expired");
        // Return a rejected promise to stop further handlers.
        throw new Error("Session expired");
      }
      // Re-apply Authorization with fresh token
      requestInit.headers = ensureAuthHeader(requestInit).headers;
    }

    const res = await window.__atom_raw_fetch(input, requestInit);

    if(apiCall && (res.status === 401 || res.status === 403)){
      // One retry after refresh.
      const refreshed = await refreshAccessToken();
      if(refreshed){
        const retryInit = ensureAuthHeader(requestInit);
        const retryRes = await window.__atom_raw_fetch(input, retryInit);
        if(retryRes.status !== 401 && retryRes.status !== 403) return retryRes;
      }

      clearTokens();
      redirectToLogin("expired");
      throw new Error("Unauthorized");
    }

    return res;
  };
}

function requireAuth(){
  const access = getAccessToken();
  if(!access){
    // no token => back to login
    redirectToLogin("missing");
    return false;
  }
  return true;
}

function setActiveNav(){
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach(a=>{
    const target = a.getAttribute("data-nav");
    const isActive = target === path;
    a.classList.toggle("active", isActive);
  });
}

function initialsFromName(name){
  const n = (name || "").trim();
  if(!n) return "AT";
  const parts = n.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? (parts[parts.length-1]?.[0] || "") : "";
  const s = (first + last).toUpperCase();
  return s || "AT";
}

async function hydrateUserChip(){
  const elName = document.getElementById("userName");
  const elRole = document.getElementById("userRole");
  const elAvatar = document.getElementById("userAvatar");

  if(!elName || !elRole || !elAvatar) return;

  // fallback (when API base url not set or request fails)
  elName.textContent = "نویسنده";
  elRole.textContent = "Author Panel";
  elAvatar.textContent = "AT";

  try{
    const url = buildApiUrl(CONFIG.ME_ENDPOINT);
    const res = await fetch(url);
    if(!res.ok) return;
    const data = await res.json();

    // Data fields in OpenAPI: username, first_name, last_name, id, ...
    const display = [data.first_name, data.last_name].filter(Boolean).join(" ").trim()
      || data.username
      || "نویسنده";

    elName.textContent = display;
    elAvatar.textContent = initialsFromName(display);

    // show roles if available (optional)
    if(Array.isArray(data.role) && data.role.length){
      elRole.textContent = data.role.join(" ، ");
    }else{
      elRole.textContent = "Author Panel";
    }
  }catch(_){}
}

let __expiryTimer = null;
function scheduleTokenRefreshOrLogout(){
  if(__expiryTimer) clearTimeout(__expiryTimer);

  const expMs = getJwtExpMs(getAccessToken());
  if(!expMs) return;

  // Try to refresh a bit before expiration; if it fails => redirect.
  const skewMs = (CONFIG.EXP_SKEW_SECONDS || 0) * 1000;
  const runAt = Math.max(Date.now() + 1000, expMs - skewMs);
  __expiryTimer = setTimeout(async ()=>{
    const refreshed = await refreshAccessToken();
    if(!refreshed){
      clearTokens();
      redirectToLogin("expired");
      return;
    }
    scheduleTokenRefreshOrLogout();
  }, runAt - Date.now());
}

async function verifySessionNow(){
  // Lightweight server-side validation (and refresh if needed via fetch interceptor)
  try{
    const res = await fetch(buildApiUrl(CONFIG.ME_ENDPOINT));
    if(!res.ok) return; // fetch interceptor will handle 401/403
  }catch(_){
    // network issues: don't force logout
  }
}

function wireLogout(){
  const btn = document.getElementById("logoutBtn");
  if(!btn) return;
  btn.addEventListener("click", ()=>{
    clearTokens();
    window.location.href = CONFIG.LOGIN_URL;
  });
}

// Boot
(function(){
  installFetchInterceptor();
  if(!requireAuth()) return;
  setActiveNav();
  wireLogout();
  hydrateUserChip();
  scheduleTokenRefreshOrLogout();
  verifySessionNow();
})();
