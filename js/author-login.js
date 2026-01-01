// =====================
// Atom Author Login (Writer-only)
//
// طبق توضیح بکند: «نویسنده بودن» با داشتن AuthorProfile مشخص می‌شود
// (OneToOne با User) و باید با توکن کاربر چک کنیم AuthorProfile دارد یا نه.
//
// Flow:
// 1) POST /api/token/  -> {access, refresh}
// 2) GET  /api/users/users/me/ (Authorization: Bearer <access>) -> {id, ...}
// 3) GET  /api/blog/authors/{user}/ (Authorization: Bearer <access>)
//    اگر 200 شد یعنی نویسنده است، اگر 404 شد یعنی AuthorProfile ندارد.
// =====================

const CONFIG = {
  // If your frontend is served from a different domain/port than API, set it here.
  // Example: "https://example.com" or "http://localhost:8000"
  API_BASE_URL: "https://atom-game.ir",

  TOKEN_ENDPOINT: "/api/token/",
  ME_ENDPOINT: "/api/users/users/me/",
  // نویسنده بودن: داشتن AuthorProfile
  AUTHOR_PROFILE_ENDPOINT_TEMPLATE: "/api/blog/authors/{user}/",

  // برای تست لوکال (Dev) می‌تونی true کنی تا بدون چک نویسنده وارد بشه
  ALLOW_ANY_LOGIN: false,

  // Where to go after login
  REDIRECT_URL: "/author-panel/index.html",
};

const form = document.getElementById("loginForm");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");
const errorBox = document.getElementById("errorBox");
const submitBtn = document.getElementById("submitBtn");
const spinner = submitBtn.querySelector(".btn__spinner");
const togglePass = document.getElementById("togglePass");

togglePass.addEventListener("click", () => {
  const isPass = passwordEl.type === "password";
  passwordEl.type = isPass ? "text" : "password";
  togglePass.textContent = isPass ? "🙈" : "👁️";
});

function setLoading(isLoading){
  submitBtn.disabled = isLoading;
  spinner.style.display = isLoading ? "inline-block" : "none";
}

function showError(message){
  if(!message){
    errorBox.style.display = "none";
    errorBox.textContent = "";
    return;
  }
  errorBox.style.display = "block";
  errorBox.textContent = message;
}

function saveTokens({ access, refresh }){
  localStorage.setItem("atom_access", access || "");
  localStorage.setItem("atom_refresh", refresh || "");
  localStorage.setItem("atom_logged_in_at", new Date().toISOString());
}

function clearTokens(){
  localStorage.removeItem("atom_access");
  localStorage.removeItem("atom_refresh");
  localStorage.removeItem("atom_logged_in_at");
  localStorage.removeItem("atom_me");
  localStorage.removeItem("atom_author_profile");
}

function buildUrl(path){
  return (CONFIG.API_BASE_URL || "") + path;
}

async function loginWithApi(username, password){
  const url = buildUrl(CONFIG.TOKEN_ENDPOINT);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if(!res.ok){
    let msg = "نام‌کاربری یا رمز عبور اشتباه است.";
    try{
      const data = await res.json();
      if(typeof data?.detail === "string") msg = data.detail;
      if(Array.isArray(data?.non_field_errors) && data.non_field_errors[0]) msg = data.non_field_errors[0];
    }catch(_){ }
    throw new Error(msg);
  }

  const data = await res.json();
  if(!data?.access || !data?.refresh){
    throw new Error("پاسخ لاگین از سمت API معتبر نیست.");
  }
  return data;
}

async function fetchMe(accessToken){
  const url = buildUrl(CONFIG.ME_ENDPOINT);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
    }
  });

  if(!res.ok){
    // اگر توکن اشتباه/منقضی بود یا بکند خطا داد
    throw new Error("خطا در گرفتن اطلاعات کاربر. دوباره وارد شوید.");
  }

  return await res.json();
}

async function fetchAuthorProfile(userId, accessToken){
  const path = CONFIG.AUTHOR_PROFILE_ENDPOINT_TEMPLATE.replace(
    "{user}",
    encodeURIComponent(String(userId))
  );
  const url = buildUrl(path);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
    }
  });

  if(res.status === 404){
    return null; // نویسنده نیست (AuthorProfile ندارد)
  }

  if(res.status === 401 || res.status === 403){
    throw new Error("توکن معتبر نیست یا دسترسی ندارید. دوباره وارد شوید.");
  }

  if(!res.ok){
    throw new Error("خطا در بررسی پروفایل نویسندگی.");
  }

  return await res.json();
}

async function loginAndAuthorize(username, password){
  const tokens = await loginWithApi(username, password);
  saveTokens(tokens);

  const me = await fetchMe(tokens.access);
  localStorage.setItem("atom_me", JSON.stringify(me || {}));

  const userId = me?.id;
  if(typeof userId !== "number" && typeof userId !== "string"){
    clearTokens();
    throw new Error("اطلاعات کاربر ناقص است (id پیدا نشد).");
  }

  const authorProfile = await fetchAuthorProfile(userId, tokens.access);
  if(!authorProfile){
    clearTokens();
    throw new Error("این کاربر پروفایل نویسندگی ندارد و اجازه ورود به پنل نویسنده را ندارد.");
  }
  localStorage.setItem("atom_author_profile", JSON.stringify(authorProfile || {}));

  window.location.href = CONFIG.REDIRECT_URL;
}

function fakeLogin(){
  // فقط برای تست لوکال. در حالت عادی استفاده نمی‌شود.
  saveTokens({ access: "DEV_ACCESS_TOKEN", refresh: "DEV_REFRESH_TOKEN" });
  window.location.href = CONFIG.REDIRECT_URL;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");

  const username = (usernameEl.value || "").trim();
  const password = (passwordEl.value || "").trim();

  setLoading(true);

  if(CONFIG.ALLOW_ANY_LOGIN){
    // حالت Dev
    setLoading(false);
    fakeLogin();
    return;
  }

  if(!username || !password){
    setLoading(false);
    showError("نام‌کاربری و رمز عبور را وارد کنید.");
    return;
  }

  try{
    await loginAndAuthorize(username, password);
  }catch(err){
    showError(err?.message || "خطا در ورود. دوباره تلاش کنید.");
  }finally{
    setLoading(false);
  }
});
