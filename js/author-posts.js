
(function(){
  'use strict';
  if (typeof requireAuth === "function" && !requireAuth()) return;

  const $ = (id)=>document.getElementById(id);

  const els = {
    // top user
    userNameTop: $("userNameTop"),
    userRoleTop: $("userRoleTop"),
    userAvatarTop: $("userAvatarTop"),

    // actions
    newPostBtn: $("newPostBtn"),
    refreshPostsBtn: $("refreshPostsBtn"),

    // filters
    filtersForm: $("filtersForm"),
    fSearch: $("fSearch"),
    fStatus: $("fStatus"),
    fCategory: $("fCategory"),
    fTag: $("fTag"),
    fVisibility: $("fVisibility"),
    fIsHot: $("fIsHot"),
    fFrom: $("fFrom"),
    fTo: $("fTo"),
    fOrdering: $("fOrdering"),
    fPageSize: $("fPageSize"),
    applyFiltersBtn: $("applyFiltersBtn"),
    resetFiltersBtn: $("resetFiltersBtn"),
    activeFilters: $("activeFilters"),

    // stats
    statTotal: $("statTotal"),
    statShown: $("statShown"),
    statPublished: $("statPublished"),
    statDraft: $("statDraft"),
    statReview: $("statReview"),
    statScheduled: $("statScheduled"),
    statArchived: $("statArchived"),

    // table
    postsTbody: $("postsTbody"),
    resultsHint: $("resultsHint"),
    paginationBar: $("paginationBar"),

    // modal
    postModal: $("postModal"),
    postModalTitle: $("postModalTitle"),
    postModalSub: $("postModalSub"),
    closePostModalBtn: $("closePostModalBtn"),
    postForm: $("postForm"),
    formError: $("formError"),

    // form fields
    pTitle: $("pTitle"),
    pSlug: $("pSlug"),
    pAuthor: $("pAuthor"),
    pEditorHint: $("pEditorHint"),
    pPublishedDate: $("pPublishedDate"),
    pPublishedTime: $("pPublishedTime"),
    pScheduledDate: $("pScheduledDate"),
    pScheduledTime: $("pScheduledTime"),
    pExcerpt: $("pExcerpt"),
    pContent: $("pContent"),
    pCategory: $("pCategory"),
    pSeries: $("pSeries"),
    pVisibility: $("pVisibility"),
    pStatus: $("pStatus"),
    pIsHot: $("pIsHot"),
    pSeoTitle: $("pSeoTitle"),
    pSeoDesc: $("pSeoDesc"),
    pCanonical: $("pCanonical"),
    pCoverMediaId: $("pCoverMediaId"),
    pOgImageId: $("pOgImageId"),

    // tags
    tagSearch: $("tagSearch"),
    tagsGrid: $("tagsGrid"),
    tagsSelectedHint: $("tagsSelectedHint"),

    // media picker
    mediaPickerModal: $("mediaPickerModal"),
    mediaPickerTitle: $("mediaPickerTitle"),
    mediaGrid: $("mediaGrid"),
    mediaSearch: $("mediaSearch"),
    mediaLoadMoreBtn: $("mediaLoadMoreBtn"),
    closeMediaPickerBtn: $("closeMediaPickerBtn"),

    // confirm
    confirmModal: $("confirmModal"),
    confirmTitle: $("confirmTitle"),
    confirmMsg: $("confirmMsg"),
    confirmYesBtn: $("confirmYesBtn"),
    confirmNoBtn: $("confirmNoBtn"),
    confirmAltBtn: $("confirmAltBtn"),

    // toast
    toast: $("toast")
  };

  const nf = new Intl.NumberFormat("fa-IR");

  // Convert Persian/Arabic-Indic digits to ASCII digits for reliable parsing
  function digitsToEn(input){
    if(input === null || input === undefined) return "";
    return String(input)
      .replace(/[۰-۹]/g, d => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)])
      .replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
  }

  const state = {
    me: null,
    categories: [],
    tags: [],
    series: [],
    posts: [],
    filtered: [],
    page: 1,
    pageSize: 10,
    filters: {
      search: "",
      status: "all",
      category: "all",
      tag: "all",
      visibility: "all",
      is_hot: "all",
      published_after: "",
      published_before: "",
      ordering: "-published_at"
    },
    editor: {
      mode: "create", // create | edit
      slug: null,
      selectedTagIds: new Set(),
      mediaTarget: null,
      mediaPage: 1,
      mediaHasNext: true,
      mediaCache: [],
      isDirty: false,
      baseline: "",
      suspendDirty: false,
      closeAfterSave: false,
      isPublished: false
    }
  };

  function apiUrl(path){
    return (CONFIG?.API_BASE_URL || "") + path;
  }

  async function apiFetch(path, opts={}){
    const headers = Object.assign(
      { "Accept": "application/json" },
      opts.headers || {}
    );

    // JSON body convenience
    if (opts.json !== undefined){
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }

    const token = (typeof getAccessToken === "function") ? getAccessToken() : (localStorage.getItem("access_token") || localStorage.getItem("token") || "");
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(apiUrl(path), Object.assign({}, opts, { headers }));

    if(!res.ok){
      let message = `خطا در ارتباط با سرور (${res.status})`;
      try{
        const ct = res.headers.get("content-type") || "";
        if(ct.includes("application/json")){
          const j = await res.json();
          message += ` — ${JSON.stringify(j)}`;
        } else {
          const t = await res.text();
          if (t) message += ` — ${t.slice(0,200)}`;
        }
      }catch(_){}
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    const ct = res.headers.get("content-type") || "";
    if(ct.includes("application/json")){
      return await res.json();
    }
    return await res.text();
  }

  function normalizeList(data){
    if(!data) return { items: [], next: null };
    if(Array.isArray(data)) return { items: data, next: null };
    if(Array.isArray(data.results)) return { items: data.results, next: data.next || null };
    if(Array.isArray(data.data)) return { items: data.data, next: data.next || null };
    return { items: [], next: null };
  }

  async function fetchAllPaginated(path, {pageSize=200, maxPages=10} = {}){
    const items = [];
    let url = path;

    // ensure page_size
    const addPageSize = (u)=>{
      try{
        const tmp = new URL(u, window.location.origin);
        if(!tmp.searchParams.get("page_size")){
          tmp.searchParams.set("page_size", String(pageSize));
        }
        // ensure page starts at 1
        if(!tmp.searchParams.get("page")) tmp.searchParams.set("page", "1");
        return tmp.pathname + tmp.search;
      }catch(_){
        // fallback best effort
        const hasQ = u.includes("?");
        if(!u.includes("page_size=")){
          u += (hasQ ? "&" : "?") + `page_size=${pageSize}`;
        }
        if(!u.includes("page=")){
          u += (u.includes("?") ? "&" : "?") + "page=1";
        }
        return u;
      }
    };

    url = addPageSize(url);

    for(let i=0; i<maxPages && url; i++){
      const data = await apiFetch(url);
      const {items: pageItems, next} = normalizeList(data);
      items.push(...pageItems);
      if(next){
        // next might be absolute
        try{
          const nextUrl = new URL(next);
          url = nextUrl.pathname + nextUrl.search;
        }catch(_){
          url = next;
        }
      } else {
        url = null;
      }
    }
    return items;
  }

  function clearNode(node){ if(!node) return; while(node.firstChild) node.removeChild(node.firstChild); }

  function escapeHtml(str){
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }


  // --- Date normalization (handles browsers that output Jalali years in <input type="date">)
  // Some environments may produce values like 1404-09-19. Backend expects Gregorian ISO.
  function _div(a,b){ return ~~(a/b); }
  function _mod(a,b){ return a - ~~(a/b)*b; }
  const _jalaaliBreaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function _jalCal(jy){
    const bl = _jalaaliBreaks.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = _jalaaliBreaks[0];
    let jm = 0, jump = 0, n = 0;

    if(jy < jp || jy >= _jalaaliBreaks[bl-1]) return null;

    for(let i=1; i<bl; i++){
      jm = _jalaaliBreaks[i];
      jump = jm - jp;
      if(jy < jm) break;
      leapJ = leapJ + _div(jump,33)*8 + _div(_mod(jump,33),4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + _div(n,33)*8 + _div(_mod(n,33)+3,4);
    if(_mod(jump,33) === 4 && jump - n === 4) leapJ += 1;

    const leapG = _div(gy,4) - _div((_div(gy,100)+1)*3,4) - 150;
    const march = 20 + leapJ - leapG;

    if(jump - n < 6) n = n - jump + _div(jump+4,33)*33;
    let leap = _mod(_mod(n+1,33)-1,4);
    if(leap === -1) leap = 4;

    return { leap, gy, march };
  }

  function _g2d(gy,gm,gd){
    let d = _div((gy + _div(gm-8,6) + 100100)*1461,4)
          + _div(153*_mod(gm+9,12)+2,5)
          + gd - 34840408;
    d = d - _div(_div(gy + 100100 + _div(gm-8,6),100)*3,4) + 752;
    return d;
  }

  function _d2g(jdn){
    let j = 4*jdn + 139361631;
    j = j + _div(_div(4*jdn + 183187720,146097)*3,4)*4 - 3908;
    const i = _div(_mod(j,1461),4)*5 + 308;
    const gd = _div(_mod(i,153),5) + 1;
    const gm = _mod(_div(i,153),12) + 1;
    const gy = _div(j,1461) - 100100 + _div(8-gm,6);
    return { gy, gm, gd };
  }

  function _j2d(jy,jm,jd){
    const r = _jalCal(jy);
    if(!r) return null;
    return _g2d(r.gy, 3, r.march) + (jm-1)*31 - _div(jm,7)*(jm-7) + jd - 1;
  }

  function jalaliToGregorian(jy,jm,jd){
    const jdn = _j2d(jy,jm,jd);
    if(jdn === null) return null;
    const g = _d2g(jdn);
    return [g.gy, g.gm, g.gd];
  }

  function isLikelyJalaliYear(y){
    return y >= 1300 && y <= 1600;
  }

  function normalizeDateValue(dateStr){
    // Accept user input as:
    // - Jalali: 1404/06/28 or 1404-06-28 (digits may be Persian/Arabic)
    // - Gregorian: 2025-09-19 or 2025/09/19
    // Returns Gregorian date string "YYYY-MM-DD" (latin digits) for ISO building.
    if(!dateStr) return "";
    const s = digitsToEn(String(dateStr)).trim();
    const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if(!m) return s;
    const y = parseInt(m[1],10), mo = parseInt(m[2],10), d = parseInt(m[3],10);

    if(isLikelyJalaliYear(y)){
      const g = jalaliToGregorian(y, mo, d);
      if(!g) return `${String(y).padStart(4,"0")}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const [gy, gm, gd] = g;
      return `${String(gy).padStart(4,"0")}-${String(gm).padStart(2,"0")}-${String(gd).padStart(2,"0")}`;
    }
    return `${String(y).padStart(4,"0")}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }

  function normalizeIsoMaybeJalali(iso){
    // iso: usually "YYYY-MM-DDTHH:mm:ss..." (server)
    if(!iso) return "";
    const s = digitsToEn(iso).trim();
    // Accept YYYY-MM-DD... or YYYY/MM/DD...
    const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(.*)$/);
    if(!m) return s;
    const y = parseInt(m[1],10), mo = parseInt(m[2],10), d = parseInt(m[3],10);
    if(!isLikelyJalaliYear(y)) {
      // normalize separators to '-' in date part for Date() parsing
      return `${String(y).padStart(4,"0")}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}${m[4]}`;
    }
    const g = jalaliToGregorian(y, mo, d);
    if(!g) return `${String(y).padStart(4,"0")}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}${m[4]}`;
    const [gy, gm, gd] = g;
    return `${String(gy).padStart(4,"0")}-${String(gm).padStart(2,"0")}-${String(gd).padStart(2,"0")}${m[4]}`;
  }

  
  function gregorianToJalaliDateStr(dateObj){
    // Returns Jalali date as YYYY/MM/DD (latin digits) using Intl Persian calendar.
    try{
      const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year:"numeric", month:"2-digit", day:"2-digit" });
      const parts = fmt.formatToParts(dateObj);
      const y = digitsToEn(parts.find(p=>p.type==="year")?.value || "");
      const m = digitsToEn(parts.find(p=>p.type==="month")?.value || "");
      const d = digitsToEn(parts.find(p=>p.type==="day")?.value || "");
      if(!y || !m || !d) return "";
      return `${y.padStart(4,"0")}/${m.padStart(2,"0")}/${d.padStart(2,"0")}`;
    }catch(_){
      return "";
    }
  }

function safeDateLabel(iso){
    if(!iso) return "—";
    try{
      const norm = normalizeIsoMaybeJalali(iso);
      const d = new Date(norm);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("fa-IR", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
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
    return map[s] || (s || "—");
  }

  function statusClass(s){
    const map = {
      draft: "badge--draft",
      review: "badge--review",
      scheduled: "badge--scheduled",
      published: "badge--published",
      archived: "badge--archived",
    };
    return map[s] || "badge--muted";
  }

  function visibilityLabel(v){
    const map = { public:"عمومی", private:"خصوصی", unlisted:"غیرلیست‌شده" };
    return map[v] || (v || "—");
  }

  function slugify(value){
    const s = String(value || "").trim().toLowerCase();
    // keep [a-z0-9_-]
    const ascii = s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"");
    const cleaned = ascii
      .replace(/[^a-z0-9\s_-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "");
    return cleaned.slice(0, 50);
  }

  function toIsoStartOfDay(dateStr){
    if(!dateStr) return "";
    const norm = normalizeDateValue(dateStr);
    const d = new Date(norm + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  }
  function toIsoEndOfDay(dateStr){
    if(!dateStr) return "";
    const norm = normalizeDateValue(dateStr);
    const d = new Date(norm + "T23:59:59");
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  }


  function isoToDateTimeParts(iso){
    if(!iso) return {date:"", time:""};
    try{
      const norm = normalizeIsoMaybeJalali(iso);
      const d = new Date(norm);
      if(isNaN(d.getTime())) return {date:"", time:""};
      const hh = String(d.getHours()).padStart(2,"0");
      const mi = String(d.getMinutes()).padStart(2,"0");
      const jDate = gregorianToJalaliDateStr(d);
      return {date: jDate || "", time:`${hh}:${mi}`};
    }catch(_){ return {date:"", time:""}; }
  }

  function combineDateTimeToIso(dateStr, timeStr){
    if(!dateStr) return "";
    const normDate = normalizeDateValue(dateStr);
    const t0 = digitsToEn(timeStr || "").trim();
    const t = t0 ? String(t0).slice(0,5) : "00:00";
    const tm = t.match(/^(\d{1,2}):(\d{2})$/);
    const hh = tm ? parseInt(tm[1],10) : 0;
    const mi = tm ? parseInt(tm[2],10) : 0;
    // Build in local time to avoid browser parsing quirks
    const dm = normDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!dm) return "";
    const yy = parseInt(dm[1],10), mm = parseInt(dm[2],10), dd = parseInt(dm[3],10);
    const d = new Date(yy, mm-1, dd, hh, mi, 0);
    if(isNaN(d.getTime())) return "";
    return d.toISOString();
  }

  function syncScheduleFieldState(){
    const st = String(els.pStatus?.value || "");
    const isCreate = state.editor.mode === "create";
    const locked = (state.editor.mode === "edit" && !!state.editor.isPublished);
    // Requirement:
    // - create: Scheduled fields should be editable
    // - edit + published: Scheduled fields should NOT be editable
    // - edit + others: editable only when status is scheduled
    const enable = !locked && (isCreate || st === "scheduled");

    if(els.pScheduledDate) els.pScheduledDate.disabled = !enable;
    if(els.pScheduledTime) els.pScheduledTime.disabled = !enable;
  }

  function syncPublishedFieldState(){
    const locked = (state.editor.mode === "edit" && !!state.editor.isPublished);
    if(els.pPublishedDate) els.pPublishedDate.disabled = locked;
    if(els.pPublishedTime) els.pPublishedTime.disabled = locked;
  }

  function buildListQuery(){
    const f = state.filters;
    const sp = new URLSearchParams();

    if (f.search) sp.set("search", f.search);
    if (f.category && f.category !== "all") sp.set("category", f.category);
    if (f.visibility && f.visibility !== "all") sp.set("visibility", f.visibility);
    if (f.is_hot && f.is_hot !== "all") sp.set("is_hot", f.is_hot);
    if (f.published_after) sp.set("published_after", toIsoStartOfDay(f.published_after));
    if (f.published_before) sp.set("published_before", toIsoEndOfDay(f.published_before));
    if (f.ordering) sp.set("ordering", f.ordering);

    // tag slug can be repeated; openapi indicates array, explode=true => repeated query string
    if (f.tag && f.tag !== "all") sp.append("tags", f.tag);

    const qs = sp.toString();
    return qs ? `/api/blog/posts/?${qs}` : `/api/blog/posts/`;
  }

  function renderActiveFilters(){
    if(!els.activeFilters) return;
    const chips = [];

    const f = state.filters;
    const add = (label, value)=>{
      if(!value) return;
      chips.push(`<span class="chip"><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`);
    };

    if(f.search) add("جستجو", f.search);
    if(f.status !== "all") add("وضعیت", statusLabel(f.status));
    if(f.category !== "all"){
      const c = state.categories.find(x => x.slug === f.category);
      add("دسته", c?.name || f.category);
    }
    if(f.tag !== "all"){
      const t = state.tags.find(x => x.slug === f.tag);
      add("تگ", t?.name || f.tag);
    }
    if(f.visibility !== "all") add("نمایش", visibilityLabel(f.visibility));
    if(f.is_hot !== "all") add("هات", f.is_hot === "true" ? "بله" : "خیر");
    if(f.published_after) add("از", f.published_after);
    if(f.published_before) add("تا", f.published_before);

    els.activeFilters.innerHTML = chips.length ? chips.join("") : `<span class="chip chip--muted">بدون فیلتر</span>`;
  }

  function applyClientFilters(){
    const f = state.filters;
    let list = Array.isArray(state.posts) ? [...state.posts] : [];

    // status is not in list endpoint filters; do on client
    if(f.status && f.status !== "all"){
      list = list.filter(p => (p.status || "") === f.status);
    }

    // If tag filter is applied, server already filtered by tag slug, but keep safety.
    if(f.tag && f.tag !== "all"){
      list = list.filter(p => (p.tags || []).some(t => t.slug === f.tag));
    }

    // basic sort fallback
    if(f.ordering){
      const field = f.ordering.replace("-", "");
      const dir = f.ordering.startsWith("-") ? -1 : 1;
      list.sort((a,b)=>{
        const av = a[field];
        const bv = b[field];
        if(field.includes("published_at")){
          const ad = av ? new Date(av).getTime() : 0;
          const bd = bv ? new Date(bv).getTime() : 0;
          return (ad - bd) * dir;
        }
        if(typeof av === "number" && typeof bv === "number"){
          return (av - bv) * dir;
        }
        return String(av||"").localeCompare(String(bv||""), "fa") * dir;
      });
    }

    state.filtered = list;
    state.page = 1;
    render();
  }

  function renderStats(){
    const total = state.posts.length;
    const shown = state.filtered.length;

    const counts = { published:0, draft:0, review:0, scheduled:0, archived:0 };
    for(const p of state.posts){
      if(counts[p.status] !== undefined) counts[p.status] += 1;
    }

    if(els.statTotal) els.statTotal.textContent = nf.format(total);
    if(els.statShown) els.statShown.textContent = nf.format(shown);
    if(els.statPublished) els.statPublished.textContent = nf.format(counts.published);
    if(els.statDraft) els.statDraft.textContent = nf.format(counts.draft);
    if(els.statReview) els.statReview.textContent = nf.format(counts.review);
    if(els.statScheduled) els.statScheduled.textContent = nf.format(counts.scheduled);
    if(els.statArchived) els.statArchived.textContent = nf.format(counts.archived);
  }

  function renderTable(){
    if(!els.postsTbody) return;

    const list = state.filtered;
    const total = list.length;

    const pageSize = state.pageSize;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if(state.page > pages) state.page = pages;

    const start = (state.page - 1) * pageSize;
    const end = Math.min(total, start + pageSize);
    const pageItems = list.slice(start, end);

    if(els.resultsHint){
      els.resultsHint.textContent = `نمایش ${nf.format(end - start)} از ${nf.format(total)} (صفحه ${nf.format(state.page)} از ${nf.format(pages)})`;
    }

    clearNode(els.postsTbody);

    if(!pageItems.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" class="emptyCell">پستی برای نمایش وجود ندارد.</td>`;
      els.postsTbody.appendChild(tr);
      return;
    }

    for(const p of pageItems){
      const tr = document.createElement("tr");
      const tags = (p.tags || []).slice(0, 3).map(t=>`<span class="tagPill">${escapeHtml(t.name)}</span>`).join("");
      const moreTags = (p.tags || []).length > 3 ? `<span class="tagPill tagPill--muted">+${nf.format((p.tags||[]).length - 3)}</span>` : "";

      tr.innerHTML = `
        <td>
          <div class="titleCell">
            <b title="${escapeHtml(p.title || "")}">${escapeHtml(p.title || "بدون عنوان")}</b>
            <div class="sub">
              <span class="mono">${escapeHtml(p.slug || "")}</span>
              ${p.is_hot ? `<span class="hotDot" title="Hot">🔥</span>` : ``}
              <span class="muted">${escapeHtml(p.category || "—")}</span>
            </div>
            <div class="tagRow">${tags}${moreTags}</div>
          </div>
        </td>
        <td><span class="badge ${statusClass(p.status)}">${escapeHtml(statusLabel(p.status))}</span></td>
        <td><span class="badge badge--muted">${escapeHtml(visibilityLabel(p.visibility))}</span></td>
        <td>
          ${escapeHtml(safeDateLabel(p.published_at))}
          ${p.status === "published" && p.author ? `<div class="muted">نویسنده: ${escapeHtml(p.author.display_name || p.author.full_name || p.author.username || p.author.email || "—")}</div>` : ``}
        </td>
        <td class="num">${nf.format(p.views_count || 0)}</td>
        <td class="num">${nf.format(p.likes_count || 0)}</td>
        <td class="actions">
          <button class="btn btn--small" data-action="edit" data-slug="${escapeHtml(p.slug)}">ویرایش</button>
          ${p.status !== "published" ? `<button class="btn btn--small btn--warning" data-action="publish" data-slug="${escapeHtml(p.slug)}">انتشار</button>` : ``}
          <button class="btn btn--small btn--danger" data-action="delete" data-slug="${escapeHtml(p.slug)}">حذف</button>
        </td>
      `;
      els.postsTbody.appendChild(tr);
    }
  }

  function renderPagination(){
    if(!els.paginationBar) return;

    const total = state.filtered.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));

    // build
    const frag = document.createDocumentFragment();

    const mkBtn = (label, page, disabled=false, kind="")=>{
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pageBtn" + (kind ? ` ${kind}` : "");
      b.textContent = label;
      b.disabled = disabled;
      b.addEventListener("click", ()=>{ state.page = page; render(); });
      return b;
    };

    clearNode(els.paginationBar);

    frag.appendChild(mkBtn("قبلی", Math.max(1, state.page - 1), state.page === 1));
    // numeric window
    const windowSize = 5;
    let start = Math.max(1, state.page - Math.floor(windowSize/2));
    let end = Math.min(pages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);

    for(let p=start; p<=end; p++){
      const b = mkBtn(nf.format(p), p, false, (p===state.page ? "pageBtn--active" : ""));
      frag.appendChild(b);
    }
    frag.appendChild(mkBtn("بعدی", Math.min(pages, state.page + 1), state.page === pages));

    els.paginationBar.appendChild(frag);
  }

  function render(){
    renderActiveFilters();
    renderStats();
    renderTable();
    renderPagination();
  }

  function setLoading(loading, message="در حال دریافت لیست پست‌ها..."){
    if(!els.postsTbody) return;
    if(!loading) return;
    clearNode(els.postsTbody);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" class="loadingCell">${escapeHtml(message)}</td>`;
    els.postsTbody.appendChild(tr);
  }

  function toast(msg, kind="info"){
    if(!els.toast) return;
    els.toast.textContent = msg;
    els.toast.className = `toast toast--show toast--${kind}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>{ els.toast.className = "toast"; }, 3200);
  }


  function syncBodyModalOpen(){
    // Keep body scroll locked if ANY modal is open
    const anyOpen = !!document.querySelector(".modal.isOpen");
    document.body.classList.toggle("modalOpen", anyOpen);
  }

  function openModal(modal){
    if(!modal) return;
    modal.classList.add("isOpen");
    modal.setAttribute("aria-hidden","false");
    syncBodyModalOpen();
  }
  function closeModal(modal){
    if(!modal) return;
    modal.classList.remove("isOpen");
    modal.setAttribute("aria-hidden","true");
    syncBodyModalOpen();
  }

  function confirmDialog({title="تأیید", message="مطمئنی؟", yesText="بله", noText="انصراف"} = {}){
    return new Promise((resolve)=>{
      if(!els.confirmModal) return resolve(false);
      els.confirmTitle.textContent = title;
      els.confirmMsg.textContent = message;
      els.confirmYesBtn.textContent = yesText;
      els.confirmNoBtn.textContent = noText;
      if(els.confirmAltBtn){
        els.confirmAltBtn.classList.add("hidden");
        els.confirmAltBtn.onclick = null;
      }

      const cleanup = ()=>{
        els.confirmYesBtn.onclick = null;
        els.confirmNoBtn.onclick = null;
        closeModal(els.confirmModal);
      };

      els.confirmYesBtn.onclick = ()=>{ cleanup(); resolve(true); };
      els.confirmNoBtn.onclick = ()=>{ cleanup(); resolve(false); };

      openModal(els.confirmModal);
    });
  }

  function choiceDialog({title="تأیید", message="مطمئنی؟", primaryText="ذخیره و بستن", dangerText="بستن بدون ذخیره", cancelText="انصراف"} = {}){
    // Returns: "primary" | "danger" | "cancel"
    return new Promise((resolve)=>{
      if(!els.confirmModal) return resolve("cancel");
      els.confirmTitle.textContent = title;
      els.confirmMsg.textContent = message;

      // show 3 buttons (re-using confirm modal)
      if(els.confirmAltBtn){
        els.confirmAltBtn.textContent = primaryText;
        els.confirmAltBtn.classList.remove("hidden");
      }
      els.confirmYesBtn.textContent = dangerText;
      els.confirmNoBtn.textContent = cancelText;

      // Make “danger” button visually dangerous
      els.confirmYesBtn.classList.add("btn--danger");
      els.confirmYesBtn.classList.remove("btn--primary");

      const cleanup = ()=>{
        if(els.confirmAltBtn){ els.confirmAltBtn.onclick = null; els.confirmAltBtn.classList.add("hidden"); }
        els.confirmYesBtn.onclick = null;
        els.confirmNoBtn.onclick = null;
        closeModal(els.confirmModal);
      };

      if(els.confirmAltBtn){
        els.confirmAltBtn.onclick = ()=>{ cleanup(); resolve("primary"); };
      }
      els.confirmYesBtn.onclick = ()=>{ cleanup(); resolve("danger"); };
      els.confirmNoBtn.onclick = ()=>{ cleanup(); resolve("cancel"); };

      openModal(els.confirmModal);
    });
  }

  async function attemptCloseEditor(){
    // If media picker is open, close that first.
    if(els.mediaPickerModal?.classList.contains("isOpen")){
      closeModal(els.mediaPickerModal);
      return;
    }
    // If confirm modal is open, ignore (user must choose)
    if(els.confirmModal?.classList.contains("isOpen")) return;

    recomputeDirty();
    if(!state.editor.isDirty){
      closeModal(els.postModal);
      return;
    }

    const choice = await choiceDialog({
      title: "بستن صفحه",
      message: "تغییرات ذخیره نشده‌اند. می‌خواهید قبل از بستن ذخیره شوند؟",
      primaryText: "ذخیره و بستن",
      dangerText: "بستن بدون ذخیره",
      cancelText: "ادامه ویرایش"
    });

    if(choice === "primary"){
      // save (submit form) and close after success
      state.editor.closeAfterSave = true;
      // requestSubmit triggers validation + submit handler
      if(els.postForm?.requestSubmit) els.postForm.requestSubmit();
      else els.postForm?.dispatchEvent(new Event("submit", {cancelable:true, bubbles:true}));
      return;
    }

    if(choice === "danger"){
      // discard changes
      state.editor.isDirty = false;
      state.editor.baseline = "";
      closeModal(els.postModal);
      return;
    }

    // cancel => do nothing
  }



  async function hydrateTopUser(){
    // Try to read from /me endpoint if configured, same as dashboard
    if(!els.userNameTop && !els.userAvatarTop) return;
    if(!CONFIG?.ME_ENDPOINT) return;
    try{
      const me = await apiFetch(CONFIG.ME_ENDPOINT);
      state.me = me;
      const name = me?.full_name || me?.username || me?.email || "نویسنده";
      if(els.userNameTop) els.userNameTop.textContent = name;
      if(els.userRoleTop) els.userRoleTop.textContent = "مدیریت پست‌ها";
      if(els.userAvatarTop){
        const initials = String(name).trim().slice(0,2).toUpperCase();
        els.userAvatarTop.textContent = initials || "AT";
      }
    }catch(_){}
  }

  function fillSelect(select, items, {allLabel="همه", valueKey="id", labelKey="name", allValue="all"} = {}){
    if(!select) return;
    select.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = allValue;
    optAll.textContent = allLabel;
    select.appendChild(optAll);

    for(const it of items){
      const opt = document.createElement("option");
      opt.value = it[valueKey];
      opt.textContent = it[labelKey];
      select.appendChild(opt);
    }
  }

  function fillSelectNoAll(select, items, {placeholder="انتخاب کنید...", valueKey="id", labelKey="name"} = {}){
    if(!select) return;
    select.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    select.appendChild(opt0);

    for(const it of items){
      const opt = document.createElement("option");
      opt.value = it[valueKey];
      opt.textContent = it[labelKey];
      select.appendChild(opt);
    }
  }

  function renderTagsGrid(){
    if(!els.tagsGrid) return;
    const q = String(els.tagSearch?.value || "").trim().toLowerCase();
    const frag = document.createDocumentFragment();
    clearNode(els.tagsGrid);

    const items = state.tags.filter(t=>{
      if(!q) return true;
      return String(t.name||"").toLowerCase().includes(q) || String(t.slug||"").toLowerCase().includes(q);
    });

    for(const t of items){
      const id = t.id;
      const label = document.createElement("label");
      label.className = "tagCheck";
      const checked = state.editor.selectedTagIds.has(id);
      label.innerHTML = `
        <input type="checkbox" ${checked ? "checked" : ""} data-tagid="${id}" />
        <span>${escapeHtml(t.name)}</span>
      `;
      frag.appendChild(label);
    }

    els.tagsGrid.appendChild(frag);
    updateSelectedTagsHint();
  }

  function updateSelectedTagsHint(){
    if(!els.tagsSelectedHint) return;
    const count = state.editor.selectedTagIds.size;
    els.tagsSelectedHint.textContent = count ? `${nf.format(count)} تگ انتخاب شده` : "تگی انتخاب نشده.";
  }

  function getSelectedTagIds(){
    return Array.from(state.editor.selectedTagIds.values());
  }

  function resetPostForm(){
    if(els.postForm) els.postForm.reset();
    if(els.pAuthor) els.pAuthor.value = "";
    if(els.pPublishedDate) els.pPublishedDate.value = "";
    if(els.pPublishedTime) els.pPublishedTime.value = "";
    if(els.pScheduledDate) els.pScheduledDate.value = "";
    if(els.pScheduledTime) els.pScheduledTime.value = "";
    state.editor.selectedTagIds = new Set();
    state.editor.isPublished = false;
    if(els.pSlug){
      els.pSlug.disabled = false;
      els.pSlug.placeholder = "اختیاری — اگر خالی باشد سرور می‌سازد";
    }
    if(els.formError){
      els.formError.textContent = "";
      els.formError.classList.add("hidden");
    }
    renderTagsGrid();
  }

  function snapshotEditor(){
    // snapshot of current form values to detect unsaved changes
    const snap = {
      mode: state.editor.mode,
      slug: state.editor.slug,
      title: String(els.pTitle?.value || ""),
      slugField: String(els.pSlug?.value || ""),
      excerpt: String(els.pExcerpt?.value || ""),
      content: String(els.pContent?.value || ""),
      category: String(els.pCategory?.value || ""),
      series: String(els.pSeries?.value || ""),
      visibility: String(els.pVisibility?.value || ""),
      status: String(els.pStatus?.value || ""),
      isHot: !!els.pIsHot?.checked,
      seoTitle: String(els.pSeoTitle?.value || ""),
      seoDesc: String(els.pSeoDesc?.value || ""),
      canonical: String(els.pCanonical?.value || ""),
      scheduledDate: String(els.pScheduledDate?.value || ""),
      scheduledTime: String(els.pScheduledTime?.value || ""),
      coverMediaId: String(els.pCoverMediaId?.value || ""),
      ogImageId: String(els.pOgImageId?.value || ""),
      tagIds: Array.from(state.editor.selectedTagIds.values()).sort((a,b)=>a-b)
    };
    try{ return JSON.stringify(snap); }catch(_){ return String(Date.now()); }
  }

  function setEditorBaseline(){
    state.editor.baseline = snapshotEditor();
    state.editor.isDirty = false;
    updateEditorDirtyUI();
  }

  function recomputeDirty(){
    if(state.editor.suspendDirty) return;
    const now = snapshotEditor();
    const dirty = !!state.editor.baseline && now !== state.editor.baseline;
    if(dirty !== state.editor.isDirty){
      state.editor.isDirty = dirty;
      updateEditorDirtyUI();
    }
  }

  function updateEditorDirtyUI(){
    if(!els.postModalTitle) return;
    const base = state.editor.mode === "create" ? "ساخت پست جدید" : "ویرایش پست";
    els.postModalTitle.textContent = state.editor.isDirty ? (base + " *") : base;
  }


  async function openCreateModal(){
    state.editor.mode = "create";
    state.editor.closeAfterSave = false;
    state.editor.slug = null;
    resetPostForm();
    // Author is NOT editable — show current admin (creator)
    const meId = state.me?.id ?? state.me?.user_id ?? state.me?.pk ?? "";
    const meName = state.me?.full_name || state.me?.display_name || state.me?.username || state.me?.email || "—";
    if(els.pAuthor) els.pAuthor.value = meId ? `#${meId} — ${meName}` : meName;
    if(els.pEditorHint) els.pEditorHint.textContent = meId ? `در حال ساخت با اکانت: #${meId}` : `در حال ساخت با اکانت فعلی`;

    // On create: Author is locked, but Published/Scheduled should be editable (Jalali input)
    const now = new Date();
    const jalaliToday = gregorianToJalaliDateStr(now);
    const hh = String(now.getHours()).padStart(2,"0");
    const mi = String(now.getMinutes()).padStart(2,"0");
    if(els.pPublishedDate) els.pPublishedDate.value = jalaliToday || "";
    if(els.pPublishedTime) els.pPublishedTime.value = `${hh}:${mi}`;
    if(els.pScheduledDate) els.pScheduledDate.value = jalaliToday || "";
    if(els.pScheduledTime) els.pScheduledTime.value = `${hh}:${mi}`;

    // unlock date fields
    syncPublishedFieldState();
      syncScheduleFieldState();
    if(els.postModalTitle) els.postModalTitle.textContent = "ساخت پست جدید";
    if(els.postModalSub) els.postModalSub.textContent = "اطلاعات را وارد کن و ذخیره بزن.";
    openModal(els.postModal);
    state.editor.suspendDirty = false;
    setEditorBaseline();

    // auto slug when typing title (only if slug empty)
    if(els.pTitle && els.pSlug){
      els.pTitle.oninput = ()=>{
        if(!els.pSlug.value) els.pSlug.value = slugify(els.pTitle.value);
      };
    }
  }

  async function openEditModal(slug){
    state.editor.mode = "edit";
    state.editor.closeAfterSave = false;
    state.editor.slug = slug;
    resetPostForm();

    if(els.postModalTitle) els.postModalTitle.textContent = "ویرایش پست";
    if(els.postModalSub) els.postModalSub.textContent = slug ? `Slug: ${slug}` : "";
    openModal(els.postModal);
    state.editor.suspendDirty = true;

    // slug stays fixed for safety
    if(els.pSlug){
      els.pSlug.value = slug || "";
      els.pSlug.disabled = true;
      els.pSlug.placeholder = "";
    }

    // load detail
    try{
      if(els.formError){ els.formError.classList.add("hidden"); els.formError.textContent=""; }
      const detail = await apiFetch(`/api/blog/posts/${encodeURIComponent(slug)}/`);
      state.editor.isPublished = (detail?.status === "published" || !!detail?.published_at);
      const editorId = state.me?.id ?? state.me?.user_id ?? state.me?.pk ?? "";
      if(els.pEditorHint) els.pEditorHint.textContent = editorId ? `در حال ویرایش با اکانت: #${editorId}` : `در حال ویرایش با اکانت فعلی`;
      // populate
      if(els.pTitle) els.pTitle.value = detail.title || "";
      if(els.pExcerpt) els.pExcerpt.value = detail.excerpt || "";
      if(els.pContent) els.pContent.value = detail.content || "";
      if(els.pVisibility) els.pVisibility.value = detail.visibility || "public";
      if(els.pStatus) els.pStatus.value = detail.status || "draft";
      if(els.pIsHot) els.pIsHot.checked = !!detail.is_hot;
      if(els.pSeoTitle) els.pSeoTitle.value = detail.seo_title || "";
      if(els.pSeoDesc) els.pSeoDesc.value = detail.seo_description || "";
      if(els.pCanonical) els.pCanonical.value = detail.canonical_url || "";

      // Author + dates (read-only display)
      if(els.pAuthor){
        const a = detail.author;
        els.pAuthor.value = a?.display_name || a?.full_name || a?.username || a?.email || "—";
      }
      const pub = isoToDateTimeParts(detail.published_at);
      if(els.pPublishedDate) els.pPublishedDate.value = pub.date;
      if(els.pPublishedTime) els.pPublishedTime.value = pub.time;

      const sch = isoToDateTimeParts(detail.scheduled_at);
      if(els.pScheduledDate) els.pScheduledDate.value = sch.date;
      if(els.pScheduledTime) els.pScheduledTime.value = sch.time;
      syncPublishedFieldState();
      syncScheduleFieldState();

      // category: API returns a string. Try match by slug or name.
      const c = state.categories.find(x => x.slug === detail.category) || state.categories.find(x => x.name === detail.category);
      if(els.pCategory) els.pCategory.value = c ? String(c.id) : "";

      // series: object or null
      if(els.pSeries) els.pSeries.value = detail.series?.id ? String(detail.series.id) : "";

      // tags: array of Tag objects
      state.editor.selectedTagIds = new Set((detail.tags || []).map(t=>t.id));
      renderTagsGrid();

      // media ids from objects
      if(els.pCoverMediaId) els.pCoverMediaId.value = detail.cover_media?.id ? String(detail.cover_media.id) : "";
      if(els.pOgImageId) els.pOgImageId.value = detail.og_image?.id ? String(detail.og_image.id) : "";

      state.editor.suspendDirty = false;
      setEditorBaseline();

    }catch(err){
      state.editor.suspendDirty = false;
      setEditorBaseline();
      if(els.formError){
        els.formError.textContent = err.message || "خطا در دریافت اطلاعات پست";
        els.formError.classList.remove("hidden");
      }
    }
  }

  function readFiltersFromUI(){
    state.filters.search = String(els.fSearch?.value || "").trim();
    state.filters.status = els.fStatus?.value || "all";
    state.filters.category = els.fCategory?.value || "all";
    state.filters.tag = els.fTag?.value || "all";
    state.filters.visibility = els.fVisibility?.value || "all";
    state.filters.is_hot = els.fIsHot?.value || "all";
    state.filters.published_after = els.fFrom?.value || "";
    state.filters.published_before = els.fTo?.value || "";
    state.filters.ordering = els.fOrdering?.value || "-published_at";
    state.pageSize = parseInt(els.fPageSize?.value || "10", 10) || 10;
  }

  function setFiltersUIFromState(){
    if(els.fSearch) els.fSearch.value = state.filters.search;
    if(els.fStatus) els.fStatus.value = state.filters.status;
    if(els.fCategory) els.fCategory.value = state.filters.category;
    if(els.fTag) els.fTag.value = state.filters.tag;
    if(els.fVisibility) els.fVisibility.value = state.filters.visibility;
    if(els.fIsHot) els.fIsHot.value = state.filters.is_hot;
    if(els.fFrom) els.fFrom.value = state.filters.published_after;
    if(els.fTo) els.fTo.value = state.filters.published_before;
    if(els.fOrdering) els.fOrdering.value = state.filters.ordering;
    if(els.fPageSize) els.fPageSize.value = String(state.pageSize);
  }

  async function loadOptions(){
    try{
      const [cats, tags, series] = await Promise.all([
        apiFetch("/api/blog/categories/"),
        apiFetch("/api/blog/tags/"),
        apiFetch("/api/blog/series/")
      ]);

      state.categories = Array.isArray(cats) ? cats : (cats?.results || []);
      state.tags = Array.isArray(tags) ? tags : (tags?.results || []);
      state.series = Array.isArray(series) ? series : (series?.results || []);

      // filters selects
      fillSelect(els.fCategory, state.categories, {allLabel:"همه دسته‌ها", valueKey:"slug", labelKey:"name", allValue:"all"});
      fillSelect(els.fTag, state.tags, {allLabel:"همه تگ‌ها", valueKey:"slug", labelKey:"name", allValue:"all"});

      // modal selects (no all)
      fillSelectNoAll(els.pCategory, state.categories, {placeholder:"انتخاب دسته...", valueKey:"id", labelKey:"name"});
      fillSelectNoAll(els.pSeries, state.series, {placeholder:"(اختیاری) انتخاب سری...", valueKey:"id", labelKey:"title"});

      renderTagsGrid();

    }catch(err){
      toast("خطا در دریافت لیست دسته/تگ/سری", "danger");
      console.error(err);
    }
  }

  async function loadPosts(){
    setLoading(true);

    const url = buildListQuery();
    try{
      // Try with ordering; some APIs might not support certain ordering values. We fall back on error.
      state.posts = await fetchAllPaginated(url, {pageSize: 200, maxPages: 10});
      applyClientFilters();
      toast("لیست پست‌ها به‌روزرسانی شد", "success");
    }catch(err){
      console.warn("Load posts failed, fallback:", err);
      try{
        // fallback without ordering
        const f = state.filters;
        const prevOrdering = f.ordering;
        f.ordering = "";
        state.posts = await fetchAllPaginated(buildListQuery(), {pageSize: 200, maxPages: 10});
        f.ordering = prevOrdering;
        applyClientFilters();
        toast("لیست پست‌ها به‌روزرسانی شد (fallback)", "success");
      }catch(err2){
        console.error(err2);
        clearNode(els.postsTbody);
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="7" class="errorCell">${escapeHtml(err2.message || "خطا در دریافت پست‌ها")}</td>`;
        els.postsTbody.appendChild(tr);
        toast("خطا در دریافت پست‌ها", "danger");
      }
    }
  }

  function gatherPostPayload(){
    const title = String(els.pTitle?.value || "").trim();
    const excerpt = String(els.pExcerpt?.value || "").trim();
    const content = String(els.pContent?.value || "").trim();
    const categoryId = parseInt(els.pCategory?.value || "", 10);

    const visibility = els.pVisibility?.value || "public";
    const status = els.pStatus?.value || "draft";
    const is_hot = !!els.pIsHot?.checked;

    const seo_title = String(els.pSeoTitle?.value || "").trim();
    const seo_description = String(els.pSeoDesc?.value || "").trim();
    const canonical_url = String(els.pCanonical?.value || "").trim();

    const cover_media_id = els.pCoverMediaId?.value ? parseInt(els.pCoverMediaId.value, 10) : undefined;
    const og_image_id = els.pOgImageId?.value ? parseInt(els.pOgImageId.value, 10) : undefined;

    const seriesVal = els.pSeries?.value ? parseInt(els.pSeries.value, 10) : null;

    const payload = {
      title, excerpt, content,
      status, visibility, is_hot,
      category_id: categoryId,
      tag_ids: getSelectedTagIds(),
      series: seriesVal || null
    };

    // Optional scheduling (only if API supports it)
    if(status === "scheduled"){
      const sIso = combineDateTimeToIso(String(els.pScheduledDate?.value || ""), String(els.pScheduledTime?.value || ""));
      if(sIso && !(state.editor.mode === "edit" && state.editor.isPublished)) payload.scheduled_at = sIso;
    }

    // Published at: editable فقط در حالت ساخت (و در ادیتِ پست غیرمنتشر شده)
    const pIso = combineDateTimeToIso(String(els.pPublishedDate?.value || ""), String(els.pPublishedTime?.value || ""));
    if(pIso && (state.editor.mode === "create" || !state.editor.isPublished)){
      payload.published_at = pIso;
    }

    if(seo_title) payload.seo_title = seo_title;
    if(seo_description) payload.seo_description = seo_description;
    if(canonical_url) payload.canonical_url = canonical_url;

    if(Number.isFinite(cover_media_id)) payload.cover_media_id = cover_media_id;
    if(Number.isFinite(og_image_id)) payload.og_image_id = og_image_id;

    // slug only on create (optional)
    if(state.editor.mode === "create"){
      const slug = String(els.pSlug?.value || "").trim();
      if(slug) payload.slug = slug;
    }

    // minimal validation
    const errors = [];
    if(!title) errors.push("عنوان را وارد کنید.");
    if(!excerpt) errors.push("خلاصه را وارد کنید.");
    if(!content) errors.push("محتوا را وارد کنید.");
    if(!Number.isFinite(categoryId)) errors.push("دسته را انتخاب کنید.");

    return {payload, errors};
  }

  async function submitPostForm(ev){
    ev.preventDefault();
    if(!els.postForm) return;

    const {payload, errors} = gatherPostPayload();
    if(errors.length){
      if(els.formError){
        els.formError.textContent = errors.join(" ");
        els.formError.classList.remove("hidden");
      }
      return;
    }

    if(els.formError){
      els.formError.textContent = "";
      els.formError.classList.add("hidden");
    }

    const btn = els.postForm.querySelector('button[type="submit"]');
    if(btn){ btn.disabled = true; btn.dataset._txt = btn.textContent; btn.textContent = "در حال ذخیره..."; }

    try{
      if(state.editor.mode === "create"){
        await apiFetch("/api/blog/posts/", { method:"POST", json: payload });
        toast("پست جدید ساخته شد", "success");
      } else {
        const slug = state.editor.slug;
        await apiFetch(`/api/blog/posts/${encodeURIComponent(slug)}/`, { method:"PATCH", json: payload });
        toast("پست ویرایش شد", "success");
      }

      state.editor.isDirty = false;
      state.editor.baseline = snapshotEditor();
      state.editor.closeAfterSave = false;
      closeModal(els.postModal);
      await loadPosts();

    }catch(err){
      state.editor.suspendDirty = false;
      setEditorBaseline();
      if(els.formError){
        els.formError.textContent = err.message || "خطا در ذخیره پست";
        els.formError.classList.remove("hidden");
      }
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = btn.dataset._txt || "ذخیره"; }
    }
  }

  async function publishPost(slug){
    const ok = await confirmDialog({
      title: "انتشار پست",
      message: "پست منتشر شود؟",
      yesText: "انتشار",
      noText: "انصراف"
    });
    if(!ok) return;

    try{
      await apiFetch(`/api/blog/posts/${encodeURIComponent(slug)}/publish/`, { method:"POST" });
      toast("پست منتشر شد", "success");
      await loadPosts();
    }catch(err){
      toast("خطا در انتشار پست", "danger");
      console.error(err);
    }
  }

  async function deletePost(slug){
    const ok = await confirmDialog({
      title: "حذف پست",
      message: "این عملیات غیرقابل برگشت است. حذف شود؟",
      yesText: "حذف",
      noText: "انصراف"
    });
    if(!ok) return;

    try{
      await apiFetch(`/api/blog/posts/${encodeURIComponent(slug)}/`, { method:"DELETE" });
      toast("پست حذف شد", "success");
      await loadPosts();
    }catch(err){
      toast("خطا در حذف پست", "danger");
      console.error(err);
    }
  }

  async function openMediaPicker(target){
    state.editor.mediaTarget = target; // 'cover' | 'og'
    state.editor.mediaPage = 1;
    state.editor.mediaHasNext = true;
    state.editor.mediaCache = [];
    if(els.mediaPickerTitle){
      els.mediaPickerTitle.textContent = target === "og" ? "انتخاب تصویر OG" : "انتخاب کاور";
    }
    if(els.mediaSearch) els.mediaSearch.value = "";
    if(els.mediaGrid) els.mediaGrid.innerHTML = "";
    openModal(els.mediaPickerModal);
    await loadMediaPage(true);
  }

  function mediaMatchesQuery(m, q){
    if(!q) return true;
    const hay = `${m.title||""} ${m.alt_text||""} ${m.storage_key||""} ${m.file||""} ${m.url||""} ${m.type||""} ${m.mime||""}`.toLowerCase();
    return hay.includes(q);
  }

  async function loadMediaPage(reset=false){
    if(!state.editor.mediaHasNext) return;

    const page = state.editor.mediaPage;
    const url = `/api/blog/media/?page=${page}&page_size=40`;

    if(els.mediaLoadMoreBtn){
      els.mediaLoadMoreBtn.disabled = true;
      els.mediaLoadMoreBtn.textContent = "در حال دریافت...";
    }

    try{
      const data = await apiFetch(url);
      const {items, next} = normalizeList(data);

      state.editor.mediaCache.push(...items);
      state.editor.mediaHasNext = !!next;
      state.editor.mediaPage += 1;

      renderMediaGrid();

      if(els.mediaLoadMoreBtn){
        els.mediaLoadMoreBtn.disabled = !state.editor.mediaHasNext;
        els.mediaLoadMoreBtn.textContent = state.editor.mediaHasNext ? "بیشتر" : "تمام شد";
      }

    }catch(err){
      toast("خطا در دریافت رسانه‌ها", "danger");
      console.error(err);
      if(els.mediaLoadMoreBtn){
        els.mediaLoadMoreBtn.disabled = false;
        els.mediaLoadMoreBtn.textContent = "تلاش مجدد";
      }
    }
  }

  function renderMediaGrid(){
    if(!els.mediaGrid) return;

    const q = String(els.mediaSearch?.value || "").trim().toLowerCase();
    const list = state.editor.mediaCache
      .filter(m => {
        const t = String(m.type || "").toLowerCase();
        const mime = String(m.mime || m.mime_type || "").toLowerCase();
        if (mime) return mime.startsWith("image/");
        if (t) return t === "image";
        const u = String(m.url || m.file || m.storage_key || "");
        return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(u);
      })
      .filter(m => mediaMatchesQuery(m, q))
      .slice(0, 200);

    els.mediaGrid.innerHTML = "";
    if(!list.length){
      els.mediaGrid.innerHTML = `<div class="emptyMedia">تصویری پیدا نشد.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for(const m of list){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mediaItem";
      const url = m.url || m.file || "";
      btn.innerHTML = `
        <img src="${escapeHtml(url)}" alt="${escapeHtml(m.alt_text || m.title || "")}" loading="lazy" />
        <div class="mediaMeta">
          <b>#${escapeHtml(m.id)}</b>
          <span title="${escapeHtml(m.title || "")}">${escapeHtml(m.title || "بدون عنوان")}</span>
        </div>
      `;
      btn.addEventListener("click", ()=>{
        if(state.editor.mediaTarget === "og"){
          if(els.pOgImageId) els.pOgImageId.value = String(m.id);
        } else {
          if(els.pCoverMediaId) els.pCoverMediaId.value = String(m.id);
        }
        closeModal(els.mediaPickerModal);
        recomputeDirty();
      });
      frag.appendChild(btn);
    }
    els.mediaGrid.appendChild(frag);
  }

  
  function portalModalsToBody(){
    // Move modals to <body> so position:fixed truly covers the viewport.
    // This prevents clipping when the page uses nested scroll containers.
    const modals = [els.postModal, els.mediaPickerModal, els.confirmModal].filter(Boolean);
    for(const m of modals){
      if(m && m.parentElement !== document.body){
        document.body.appendChild(m);
      }
    }
  }

function bindEvents(){
    if(els.newPostBtn) els.newPostBtn.addEventListener("click", openCreateModal);
    if(els.refreshPostsBtn) els.refreshPostsBtn.addEventListener("click", async ()=>{
      readFiltersFromUI();
      await loadPosts();
    });

    if(els.applyFiltersBtn) els.applyFiltersBtn.addEventListener("click", async ()=>{
      readFiltersFromUI();
      await loadPosts();
    });

    if(els.resetFiltersBtn) els.resetFiltersBtn.addEventListener("click", async ()=>{
      state.filters = {
        search: "",
        status: "all",
        category: "all",
        tag: "all",
        visibility: "all",
        is_hot: "all",
        published_after: "",
        published_before: "",
        ordering: "-published_at"
      };
      state.pageSize = 10;
      setFiltersUIFromState();
      await loadPosts();
    });

    if(els.postsTbody){
      els.postsTbody.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-action]");
        if(!btn) return;
        const action = btn.getAttribute("data-action");
        const slug = btn.getAttribute("data-slug");
        if(!slug) return;

        if(action === "edit") openEditModal(slug);
        if(action === "publish") publishPost(slug);
        if(action === "delete") deletePost(slug);
      });
    }

    // modal close
    const cancelPostBtn = $("cancelPostBtn");
    if(cancelPostBtn) cancelPostBtn.addEventListener("click", attemptCloseEditor);
    if(els.closePostModalBtn) els.closePostModalBtn.addEventListener("click", attemptCloseEditor);
    if(els.postModal){
      els.postModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) attemptCloseEditor();
      });
    }

    if(els.postForm) els.postForm.addEventListener("submit", submitPostForm);
    if(els.postForm){
      els.postForm.addEventListener("input", recomputeDirty);
      els.postForm.addEventListener("change", recomputeDirty);
    }

    if(els.pStatus) els.pStatus.addEventListener("change", ()=>{
      syncPublishedFieldState();
      syncScheduleFieldState();
      recomputeDirty();
    });

    // tags selection
    if(els.tagsGrid){
      els.tagsGrid.addEventListener("change", (e)=>{
        const input = e.target.closest("input[type='checkbox'][data-tagid]");
        if(!input) return;
        const id = parseInt(input.dataset.tagid, 10);
        if(!Number.isFinite(id)) return;
        if(input.checked) state.editor.selectedTagIds.add(id);
        else state.editor.selectedTagIds.delete(id);
        updateSelectedTagsHint();
        recomputeDirty();
      });
    }
    if(els.tagSearch) els.tagSearch.addEventListener("input", renderTagsGrid);

    // media picker open buttons
    const coverPickBtn = $("pickCoverBtn");
    const ogPickBtn = $("pickOgBtn");
    if(coverPickBtn) coverPickBtn.addEventListener("click", ()=>openMediaPicker("cover"));
    if(ogPickBtn) ogPickBtn.addEventListener("click", ()=>openMediaPicker("og"));

    if(els.closeMediaPickerBtn) els.closeMediaPickerBtn.addEventListener("click", ()=>closeModal(els.mediaPickerModal));
    if(els.mediaPickerModal){
      els.mediaPickerModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) closeModal(els.mediaPickerModal);
      });
    }

    if(els.mediaSearch) els.mediaSearch.addEventListener("input", renderMediaGrid);
    if(els.mediaLoadMoreBtn) els.mediaLoadMoreBtn.addEventListener("click", ()=>loadMediaPage());

    // confirm modal close on backdrop click
    if(els.confirmModal){
      els.confirmModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) closeModal(els.confirmModal);
      });
    }

    // esc key
    document.addEventListener("keydown", (e)=>{
      if(e.key === "Escape"){
        if(els.mediaPickerModal?.classList.contains("isOpen")) closeModal(els.mediaPickerModal);
        if(els.confirmModal?.classList.contains("isOpen")) closeModal(els.confirmModal);
        if(els.postModal?.classList.contains("isOpen")) attemptCloseEditor();
      }
    });
  }

  async function init(){
    setFiltersUIFromState();
    portalModalsToBody();
    bindEvents();
    await hydrateTopUser();
    await loadOptions();
    await loadPosts();
  }

  init();
})();
