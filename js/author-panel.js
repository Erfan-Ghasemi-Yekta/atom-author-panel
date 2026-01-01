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
  LOGIN_URL: "/author-panel/login.html", // change to your login path
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
}

function requireAuth(){
  const access = getAccessToken();
  if(!access){
    // no token => back to login
    window.location.href = CONFIG.LOGIN_URL;
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
    const url = (CONFIG.API_BASE_URL || "") + CONFIG.ME_ENDPOINT;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${getAccessToken()}` }
    });
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
  if(!requireAuth()) return;
  setActiveNav();
  wireLogout();
  hydrateUserChip();
})();
