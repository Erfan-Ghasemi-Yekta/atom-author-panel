// Dashboard logic for /author-panel/index.html
// Populates stats + latest posts + top categories + interactions chart
// Requires /js/author-panel.js loaded first (CONFIG, getAccessToken, requireAuth, ...)

(function(){
  if (typeof requireAuth === "function" && !requireAuth()) return;

  const $ = (id)=>document.getElementById(id);

  const els = {
    statPublished: $("statPublished"),
    statDrafts: $("statDrafts"),
    statPendingComments: $("statPendingComments"),
    statMedia: $("statMedia"),

    latestPostsList: $("latestPostsList"),
    latestPostsLoading: $("latestPostsLoading"),
    latestPostsError: $("latestPostsError"),

    topCategoriesList: $("topCategoriesList"),
    topCategoriesLoading: $("topCategoriesLoading"),
    topCategoriesError: $("topCategoriesError"),

    interactionsChart: $("interactionsChart"),
    interactionsLoading: $("interactionsLoading"),
    interactionsBars: $("interactionsBars"),
    interactionsError: $("interactionsError"),

    refreshBtn: $("refreshDashboardBtn"),

    // top header user chip (on main header)
    userNameTop: $("userNameTop"),
    userRoleTop: $("userRoleTop"),
    userAvatarTop: $("userAvatarTop"),
  };

  const nf = new Intl.NumberFormat("fa-IR");

  function fmtNumber(n){
    if (typeof n !== "number" || !isFinite(n)) return "--";
    return nf.format(n);
  }

  function apiUrl(path){
    return (CONFIG?.API_BASE_URL || "") + path;
  }

  async function apiFetch(path, opts={}){
    const headers = Object.assign(
      { "Accept": "application/json" },
      opts.headers || {}
    );

    const token = (typeof getAccessToken === "function") ? getAccessToken() : "";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(apiUrl(path), Object.assign({}, opts, { headers }));
    // Try to parse error body (best effort)
    if(!res.ok){
      let message = `خطا در دریافت اطلاعات (HTTP ${res.status})`;
      try{
        const t = await res.text();
        if(t) message += ` — ${t.slice(0,200)}`;
      }catch(_){}
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    // Some endpoints may return empty
    const ct = res.headers.get("content-type") || "";
    if(ct.includes("application/json")){
      return await res.json();
    }
    return await res.text();
  }

  function normalizeList(data){
    // DRF pagination: {count,next,previous,results}
    if (data && typeof data === "object" && Array.isArray(data.results)) return data;
    // plain array
    if (Array.isArray(data)) return { count: data.length, results: data, next: null, previous: null };
    return { count: 0, results: [], next: null, previous: null };
  }

  async function fetchAllPaginated(path, {pageSize=100, maxPages=20} = {}){
    let url = path;
    const all = [];
    let pages = 0;

    // Ensure page_size exists
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}page_size=${encodeURIComponent(pageSize)}`;

    while(url && pages < maxPages){
      const data = normalizeList(await apiFetch(url));
      all.push(...(data.results || []));
      url = data.next || null;

      // If API returns full absolute URL for next, convert to relative if it starts with API_BASE_URL
      if (url && typeof url === "string" && CONFIG?.API_BASE_URL && url.startsWith(CONFIG.API_BASE_URL)){
        url = url.slice(CONFIG.API_BASE_URL.length) || null;
      }

      pages += 1;
      // Stop early when count is reached
      if (typeof data.count === "number" && all.length >= data.count) break;
    }

    return all;
  }

  function safeDateLabel(iso){
    if(!iso) return "—";
    try{
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("fa-IR", { year:"numeric", month:"2-digit", day:"2-digit" });
    }catch(_){
      return "—";
    }
  }

  function statusLabel(s){
    const map = {
      draft: "پیش‌نویس",
      review: "در انتظار بررسی",
      scheduled: "زمان‌بندی شده",
      published: "منتشر شده",
      archived: "آرشیو",
    };
    return map[s] || (s ? String(s) : "—");
  }

  function setText(el, text){
    if(!el) return;
    el.textContent = text;
  }

  function show(el){ if(el) el.style.display = ""; }
  function hide(el){ if(el) el.style.display = "none"; }

  function clearNode(node){
    if(!node) return;
    node.innerHTML = "";
  }

  function renderLatestPosts(posts){
    if(!els.latestPostsList) return;
    clearNode(els.latestPostsList);

    const items = (posts || []).slice(0, 5);
    if(!items.length){
      els.latestPostsList.innerHTML = `<div class="listItem listItem--empty">پستی پیدا نشد.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for(const p of items){
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <b title="${escapeHtml(p.title || "")}">${escapeHtml(p.title || "بدون عنوان")}</b>
        <div class="meta">
          <span>وضعیت: ${escapeHtml(statusLabel(p.status))}</span>
          <span>انتشار: ${escapeHtml(safeDateLabel(p.published_at))}</span>
        </div>
      `;
      frag.appendChild(div);
    }
    els.latestPostsList.appendChild(frag);
  }

  function renderTopCategories(agg){
    if(!els.topCategoriesList) return;
    clearNode(els.topCategoriesList);

    const items = (agg || []).slice(0, 6);
    if(!items.length){
      els.topCategoriesList.innerHTML = `<div class="listItem listItem--empty">دسته‌بندی‌ای برای نمایش نداریم.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for(const it of items){
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <b title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</b>
        <div class="meta">
          <span>پست‌ها: ${escapeHtml(fmtNumber(it.posts))}</span>
          <span>بازدید: ${escapeHtml(fmtNumber(it.views))}</span>
        </div>
      `;
      frag.appendChild(div);
    }
    els.topCategoriesList.appendChild(frag);
  }

  function escapeHtml(str){
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function lastNDaysKeys(n){
    const keys = [];
    const now = new Date();
    // normalize to start-of-day
    now.setHours(0,0,0,0);
    for(let i=n-1;i>=0;i--){
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      keys.push(d);
    }
    return keys;
  }

  function dayKey(d){
    // "YYYY-MM-DD" in local time
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  }

  function groupCountsByDay(items, dateField, days){
    const map = new Map();
    for(const d of days){
      map.set(dayKey(d), 0);
    }
    const minTime = days[0].getTime();
    const maxTime = days[days.length-1].getTime() + 24*60*60*1000 - 1;

    for(const it of (items || [])){
      const iso = it?.[dateField];
      if(!iso) continue;
      const dt = new Date(iso);
      if(isNaN(dt.getTime())) continue;
      const t = dt.getTime();
      if(t < minTime || t > maxTime) continue;
      const k = dayKey(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
      if(map.has(k)) map.set(k, map.get(k) + 1);
    }
    return map;
  }

  function renderInteractionsChart({days, reactionsByDay, commentsByDay}){
    if(!els.interactionsBars) return;

    clearNode(els.interactionsBars);

    const maxVal = Math.max(
      1,
      ...days.map(d => reactionsByDay.get(dayKey(d)) || 0),
      ...days.map(d => commentsByDay.get(dayKey(d)) || 0)
    );

    const frag = document.createDocumentFragment();
    for(const d of days){
      const k = dayKey(d);
      const r = reactionsByDay.get(k) || 0;
      const c = commentsByDay.get(k) || 0;

      const dayDiv = document.createElement("div");
      dayDiv.className = "barDay";
      dayDiv.innerHTML = `
        <div class="bars">
          <div class="bar bar--a" title="ری‌اکشن‌ها: ${escapeHtml(fmtNumber(r))}" style="height:${Math.round((r/maxVal)*100)}%"></div>
          <div class="bar bar--b" title="کامنت‌ها: ${escapeHtml(fmtNumber(c))}" style="height:${Math.round((c/maxVal)*100)}%"></div>
        </div>
        <div class="barLabel">${d.toLocaleDateString("fa-IR", { weekday:"short" })}</div>
      `;
      frag.appendChild(dayDiv);
    }

    els.interactionsBars.appendChild(frag);
  }

  async function hydrateTopUser(){
    if(!els.userNameTop || !els.userAvatarTop || !els.userRoleTop) return;

    // fallback
    setText(els.userNameTop, "نویسنده");
    setText(els.userRoleTop, "داشبورد نویسنده");
    setText(els.userAvatarTop, "AT");

    try{
      const data = await apiFetch(CONFIG.ME_ENDPOINT);
      const display = [data.first_name, data.last_name].filter(Boolean).join(" ").trim()
        || data.username
        || "نویسنده";

      setText(els.userNameTop, display);
      if (data.profile_picture){
        els.userAvatarTop.textContent = "";
        els.userAvatarTop.style.backgroundImage = `url(${data.profile_picture})`;
        els.userAvatarTop.style.backgroundSize = "cover";
        els.userAvatarTop.style.backgroundPosition = "center";
      } else {
        els.userAvatarTop.style.backgroundImage = "";
        setText(els.userAvatarTop, initialsFromName(display));
      }
      setText(els.userRoleTop, data.role ? String(data.role) : "داشبورد نویسنده");
    }catch(_){}
  }

  // Use initialsFromName from shared file if available, else simple fallback
  function initialsFromName(name){
    if (typeof window.initialsFromName === "function") return window.initialsFromName(name);
    const n = (name || "").trim();
    if(!n) return "AT";
    const parts = n.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || "";
    const last = parts.length > 1 ? (parts[parts.length-1]?.[0] || "") : "";
    return (first + last).toUpperCase() || "AT";
  }

  async function loadDashboard(){
    // reset UI
    hide(els.latestPostsError); hide(els.topCategoriesError);
    show(els.latestPostsLoading); show(els.topCategoriesLoading);
    show(els.interactionsLoading); hide(els.interactionsError); hide(els.interactionsBars);

    // default stats
    setText(els.statPublished, "--");
    setText(els.statDrafts, "--");
    setText(els.statPendingComments, "--");
    setText(els.statMedia, "--");

    try{
      // Posts: fetch (paginated) list for aggregates + latest
      let posts = [];
      try{
        posts = await fetchAllPaginated(`/api/blog/posts/?ordering=-published_at`, {pageSize: 200, maxPages: 10});
      }catch(_){
        // fallback (if ordering is not supported)
        posts = await fetchAllPaginated(`/api/blog/posts/`, {pageSize: 200, maxPages: 10});
      }

      const postIds = new Set((posts || []).map(p=>p.id));

      // Compute post status counts
      const published = posts.filter(p=>p.status === "published").length;
      const draftLike = posts.filter(p=>["draft","review","scheduled"].includes(p.status)).length;

      setText(els.statPublished, fmtNumber(published));
      setText(els.statDrafts, fmtNumber(draftLike));

      // Latest posts list (sort client-side to be safe)
      const latest = [...posts].sort((a,b)=>{
        const ta = a?.published_at ? new Date(a.published_at).getTime() : 0;
        const tb = b?.published_at ? new Date(b.published_at).getTime() : 0;
        return (tb - ta);
      });
      renderLatestPosts(latest);

      // Top categories derived from posts (posts + views_count)
      const catMap = new Map();
      for(const p of posts){
        const name = (p.category || "بدون دسته‌بندی");
        const entry = catMap.get(name) || { name, posts: 0, views: 0 };
        entry.posts += 1;
        entry.views += (typeof p.views_count === "number" ? p.views_count : 0);
        catMap.set(name, entry);
      }
      const topCats = [...catMap.values()].sort((a,b)=> (b.views - a.views) || (b.posts - a.posts));
      renderTopCategories(topCats);

      // Media count (use pagination 'count' field if possible)
      try{
        const media = normalizeList(await apiFetch(`/api/blog/media/?page_size=1`));
        setText(els.statMedia, fmtNumber(media.count ?? (media.results?.length || 0)));
      }catch(_){
        // keep "--"
      }

      // Comments (array)
      let comments = [];
      try{
        const c = await apiFetch(`/api/blog/comments/`);
        comments = Array.isArray(c) ? c : [];
        // Only comments for posts we can see in this dashboard
        comments = comments.filter(x=>postIds.has(x.post));
        const pending = comments.filter(x=>x.status === "pending").length;
        setText(els.statPendingComments, fmtNumber(pending));
      }catch(err){
        // keep "--" but show hint in chart if both fail later
      }

      // Reactions (array)
      let reactions = [];
      try{
        const r = await apiFetch(`/api/blog/reactions/`);
        reactions = Array.isArray(r) ? r : [];
        // If reactions include different content types, keep only those for our posts
        reactions = reactions.filter(x => postIds.has(x.object_id));
      }catch(_){}

      // Interactions chart for last 7 days
      const days = lastNDaysKeys(7);
      const reactionsByDay = groupCountsByDay(reactions, "created_at", days);
      const commentsByDay  = groupCountsByDay(comments, "created_at", days);

      renderInteractionsChart({days, reactionsByDay, commentsByDay});
      hide(els.interactionsLoading);
      show(els.interactionsBars);

    }catch(err){
      // Latest posts error (most important)
      hide(els.latestPostsLoading);
      if(els.latestPostsError){
        els.latestPostsError.textContent = err?.message || "خطا در بارگذاری داده‌ها";
        show(els.latestPostsError);
      }
      // Top categories error
      hide(els.topCategoriesLoading);
      if(els.topCategoriesError){
        els.topCategoriesError.textContent = "نمایش دسته‌بندی‌ها ممکن نیست.";
        show(els.topCategoriesError);
      }
      // Chart error
      hide(els.interactionsLoading);
      if(els.interactionsError){
        els.interactionsError.textContent = "نمودار تعاملات قابل دریافت نیست.";
        show(els.interactionsError);
      }
    }finally{
      hide(els.latestPostsLoading);
      hide(els.topCategoriesLoading);
    }
  }

  // Refresh button
  if(els.refreshBtn){
    els.refreshBtn.addEventListener("click", ()=>{
      loadDashboard();
    });
  }

  // Initial run
  hydrateTopUser();
  loadDashboard();
})();
