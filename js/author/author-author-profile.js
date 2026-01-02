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
    newAuthorBtn: $("newAuthorBtn"),
    refreshAuthorsBtn: $("refreshAuthorsBtn"),

    // filters
    fSearch: $("fSearch"),
    fPageSize: $("fPageSize"),
    applyFiltersBtn: $("applyFiltersBtn"),
    resetFiltersBtn: $("resetFiltersBtn"),
    activeFilters: $("activeFilters"),

    // stats
    statTotal: $("statTotal"),
    statShown: $("statShown"),

    // table
    authorsTbody: $("authorsTbody"),
    resultsHint: $("resultsHint"),
    paginationBar: $("paginationBar"),

    // editor modal
    authorModal: $("authorModal"),
    authorModalTitle: $("authorModalTitle"),
    authorModalSub: $("authorModalSub"),
    closeAuthorModalBtn: $("closeAuthorModalBtn"),
    cancelAuthorBtn: $("cancelAuthorBtn"),
    authorForm: $("authorForm"),
    formError: $("formError"),

    // form fields
    aUserSearch: $("aUserSearch"),
    aUserId: $("aUserId"),
    aUserHint: $("aUserHint"),
    userSearchResults: $("userSearchResults"),
    aDisplayName: $("aDisplayName"),
    aBio: $("aBio"),
    aAvatarId: $("aAvatarId"),
    pickAvatarBtn: $("pickAvatarBtn"),
    clearAvatarBtn: $("clearAvatarBtn"),
    avatarPreview: $("avatarPreview"),

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

    // toast
    toast: $("toast")
  };

  const nf = new Intl.NumberFormat("fa-IR");

  let confirmCancel = null;

  const state = {
    me: null,
    authors: [],
    filtered: [],
    page: 1,
    pageSize: 20,
    filters: {
      search: ""
    },
    userMap: new Map(),   // userId -> UserReadOnly
    mediaMap: new Map(),  // mediaId -> MediaDetail
    editor: {
      mode: "create", // create | edit
      userId: null,
      selectedUser: null, // UserReadOnly
      mediaPage: 1,
      mediaHasNext: true,
      mediaCache: [],
    }
  };

  function apiUrl(path){
    return (CONFIG?.API_BASE_URL || "") + path;
  }

  async function apiFetch(path, opts={}){
    const headers = Object.assign({ "Accept": "application/json" }, opts.headers || {});

    if (opts.json !== undefined){
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }

    const token = (typeof getAccessToken === "function")
      ? getAccessToken()
      : (localStorage.getItem("access_token") || localStorage.getItem("token") || "");

    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(apiUrl(path), Object.assign({}, opts, { headers }));

    if(!res.ok){
      let message = `خطا در ارتباط با سرور (${res.status})`;
      try{
        const ct = res.headers.get("content-type") || "";
        if(ct.includes("application/json")){
          const j = await res.json();
          message += ` — ${JSON.stringify(j)}`;
        }else{
          const t = await res.text();
          if(t) message += ` — ${t.slice(0,200)}`;
        }
      }catch(_){}
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    const ct = res.headers.get("content-type") || "";
    if(ct.includes("application/json")) return await res.json();
    return await res.text();
  }

  function normalizeList(data){
    if(!data) return { items: [], next: null };
    if(Array.isArray(data)) return { items: data, next: null };
    if(Array.isArray(data.results)) return { items: data.results, next: data.next || null };
    if(Array.isArray(data.data)) return { items: data.data, next: data.next || null };
    return { items: [], next: null };
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

  function truncate(str, n=140){
    const s = String(str || "").trim();
    if(!s) return "";
    if(s.length <= n) return s;
    return s.slice(0, n-1) + "…";
  }

  function toast(msg, kind="info"){
    if(!els.toast) return;
    els.toast.textContent = msg;
    els.toast.className = `toast toast--show toast--${kind}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>{ els.toast.className = "toast"; }, 3200);
  }

  function syncBodyModalOpen(){
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

      const cleanup = ()=>{
        confirmCancel = null;

        els.confirmYesBtn.onclick = null;
        els.confirmNoBtn.onclick = null;
        closeModal(els.confirmModal);
      };

      confirmCancel = ()=>{ cleanup(); resolve(false); };

      els.confirmYesBtn.onclick = ()=>{ cleanup(); resolve(true); };
      els.confirmNoBtn.onclick = ()=>{ cleanup(); resolve(false); };

      openModal(els.confirmModal);
    });
  }

  function portalModalsToBody(){
    const modals = [els.authorModal, els.mediaPickerModal, els.confirmModal].filter(Boolean);
    for(const m of modals){
      if(m && m.parentElement !== document.body) document.body.appendChild(m);
    }
  }

  async function hydrateTopUser(){
    if(!CONFIG?.ME_ENDPOINT) return;
    try{
      const me = await apiFetch(CONFIG.ME_ENDPOINT);
      state.me = me;
      const name = me?.full_name || me?.username || me?.email || "نویسنده";
      if(els.userNameTop) els.userNameTop.textContent = name;
      if(els.userRoleTop) els.userRoleTop.textContent = "مدیریت پروفایل نویسندگان";
      if(els.userAvatarTop){
        const initials = String(name).trim().slice(0,2).toUpperCase();
        els.userAvatarTop.textContent = initials || "AT";
      }
    }catch(_){}
  }

  /* --------- Filters + Pagination --------- */
  function renderActiveFilters(){
    if(!els.activeFilters) return;
    const chips = [];
    const s = state.filters.search;
    if(s) chips.push(`<span class="chip"><b>جستجو:</b> ${escapeHtml(s)}</span>`);
    els.activeFilters.innerHTML = chips.length ? chips.join("") : `<span class="chip chip--muted">بدون فیلتر</span>`;
  }

  function applyClientFilters(){
    const q = String(state.filters.search || "").trim().toLowerCase();
    let list = Array.isArray(state.authors) ? [...state.authors] : [];

    if(q){
      list = list.filter(a=>{
        const user = state.userMap.get(a.user);
        const media = a.avatar ? state.mediaMap.get(a.avatar) : null;
        const hay = [
          a.user,
          a.display_name,
          a.bio,
          user?.username,
          user?.first_name,
          user?.last_name,
          media?.title,
          media?.alt_text
        ].map(x=>String(x||"").toLowerCase()).join(" ");
        return hay.includes(q) || (`#${a.user}`.includes(q));
      });
    }

    state.filtered = list;
    state.page = 1;
    render();
  }

  function renderStats(){
    if(els.statTotal) els.statTotal.textContent = nf.format(state.authors.length);
    if(els.statShown) els.statShown.textContent = nf.format(state.filtered.length);
  }

  function renderTable(){
    if(!els.authorsTbody) return;

    const list = state.filtered;
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    if(state.page > pages) state.page = pages;

    const start = (state.page - 1) * state.pageSize;
    const end = Math.min(total, start + state.pageSize);
    const pageItems = list.slice(start, end);

    if(els.resultsHint){
      els.resultsHint.textContent = `نمایش ${nf.format(end - start)} از ${nf.format(total)} (صفحه ${nf.format(state.page)} از ${nf.format(pages)})`;
    }

    clearNode(els.authorsTbody);

    if(!pageItems.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="emptyCell">پروفایلی برای نمایش وجود ندارد.</td>`;
      els.authorsTbody.appendChild(tr);
      return;
    }

    for(const a of pageItems){
      const user = state.userMap.get(a.user);
      const userLabel = user
        ? `${user.username || ""}`.trim()
        : "";

      const fullName = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "";

      const bioText = truncate(a.bio || "", 160);
      const avatarMedia = a.avatar ? state.mediaMap.get(a.avatar) : null;
      const avatarUrl = avatarMedia?.url || avatarMedia?.file || "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="userCell">
            <b>${escapeHtml(userLabel || "—")}</b>
            <div class="sub">
              <span class="mono">#${escapeHtml(a.user)}</span>
              ${fullName ? `<span class="muted">${escapeHtml(fullName)}</span>` : `<span class="muted">—</span>`}
            </div>
          </div>
        </td>
        <td>${escapeHtml(a.display_name || "—")}</td>
        <td class="bioCell" title="${escapeHtml(a.bio || "")}">${escapeHtml(bioText || "—")}</td>
        <td>
          <div class="avatarCell">
            ${avatarUrl ? `<a href="${escapeHtml(avatarUrl)}" target="_blank" rel="noopener"><img class="avatarThumb" src="${escapeHtml(avatarUrl)}" alt="avatar" /></a>` : `<span class="muted">—</span>`}
            ${a.avatar ? `<span class="mono">#${escapeHtml(a.avatar)}</span>` : ``}
          </div>
        </td>
        <td class="actions">
          <button class="btn btn--small" data-action="edit" data-user="${escapeHtml(a.user)}">ویرایش</button>
          <button class="btn btn--small btn--danger" data-action="delete" data-user="${escapeHtml(a.user)}">حذف</button>
        </td>
      `;
      els.authorsTbody.appendChild(tr);
    }
  }

  function renderPagination(){
    if(!els.paginationBar) return;
    const total = state.filtered.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));

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

    els.paginationBar.appendChild(mkBtn("قبلی", Math.max(1, state.page - 1), state.page === 1));

    const windowSize = 5;
    let start = Math.max(1, state.page - Math.floor(windowSize/2));
    let end = Math.min(pages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);

    for(let p=start; p<=end; p++){
      els.paginationBar.appendChild(mkBtn(nf.format(p), p, false, (p===state.page ? "pageBtn--active" : "")));
    }

    els.paginationBar.appendChild(mkBtn("بعدی", Math.min(pages, state.page + 1), state.page === pages));
  }

  function render(){
    renderActiveFilters();
    renderStats();
    renderTable();
    renderPagination();
  }

  function setLoading(loading, message="در حال دریافت لیست نویسندگان..."){
    if(!els.authorsTbody) return;
    if(!loading) return;
    clearNode(els.authorsTbody);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="loadingCell">${escapeHtml(message)}</td>`;
    els.authorsTbody.appendChild(tr);
  }

  /* --------- Users + Media hydration --------- */
  async function fetchWithConcurrency(items, worker, concurrency=5){
    const results = [];
    let idx = 0;

    async function runOne(){
      while(idx < items.length){
        const cur = items[idx++];
        try{
          const r = await worker(cur);
          results.push(r);
        }catch(_){}
      }
    }

    const runners = [];
    for(let i=0; i<Math.min(concurrency, items.length); i++) runners.push(runOne());
    await Promise.all(runners);
    return results;
  }

  async function ensureUsers(userIds){
    const missing = userIds.filter(id => !state.userMap.has(id));
    if(!missing.length) return;

    await fetchWithConcurrency(missing, async (id)=>{
      const u = await apiFetch(`/api/users/users/${encodeURIComponent(id)}/`);
      if(u && u.id) state.userMap.set(u.id, u);
      return u;
    }, 6);
  }

  async function ensureMedia(mediaIds){
    const ids = mediaIds.filter(Boolean).map(Number).filter(n=>Number.isFinite(n));
    const missing = ids.filter(id => !state.mediaMap.has(id));
    if(!missing.length) return;

    await fetchWithConcurrency(missing, async (id)=>{
      const m = await apiFetch(`/api/blog/media/${encodeURIComponent(id)}/`);
      if(m && m.id) state.mediaMap.set(m.id, m);
      return m;
    }, 6);
  }

  async function loadAuthors(){
    setLoading(true);
    try{
      const list = await apiFetch("/api/blog/authors/");
      state.authors = Array.isArray(list) ? list : (list?.results || []);
      // hydrate related data
      const userIds = state.authors.map(a=>a.user).filter(Boolean);
      const avatarIds = state.authors.map(a=>a.avatar).filter(Boolean);
      await Promise.all([
        ensureUsers(userIds),
        ensureMedia(avatarIds)
      ]);

      applyClientFilters();
      toast("لیست نویسندگان به‌روزرسانی شد", "success");
    }catch(err){
      console.error(err);
      clearNode(els.authorsTbody);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="errorCell">${escapeHtml(err.message || "خطا در دریافت نویسندگان")}</td>`;
      els.authorsTbody.appendChild(tr);
      toast("خطا در دریافت نویسندگان", "danger");
    }
  }

  /* --------- Editor --------- */
  function resetAuthorForm(){
    if(els.authorForm) els.authorForm.reset();
    if(els.formError){
      els.formError.textContent = "";
      els.formError.classList.add("hidden");
    }
    state.editor.userId = null;
    state.editor.selectedUser = null;
    if(els.userSearchResults){
      els.userSearchResults.innerHTML = "";
      els.userSearchResults.classList.add("hidden");
    }
    updateAvatarPreview();
  }

  function setFormError(msg){
    if(!els.formError) return;
    if(!msg){
      els.formError.textContent = "";
      els.formError.classList.add("hidden");
      return;
    }
    els.formError.textContent = msg;
    els.formError.classList.remove("hidden");
  }

  function updateAvatarPreview(){
    if(!els.avatarPreview) return;

    const id = els.aAvatarId?.value ? parseInt(els.aAvatarId.value, 10) : NaN;
    if(!Number.isFinite(id)){
      els.avatarPreview.innerHTML = `<div class="meta"><b>بدون آواتار</b><span>می‌توانید یک تصویر انتخاب کنید.</span></div>`;
      return;
    }

    const m = state.mediaMap.get(id);
    const url = m?.url || m?.file || "";
    if(url){
      els.avatarPreview.innerHTML = `
        <img src="${escapeHtml(url)}" alt="avatar preview" />
        <div class="meta">
          <b>#${escapeHtml(id)}</b>
          <span>${escapeHtml(m?.title || "بدون عنوان")}</span>
        </div>
      `;
    }else{
      els.avatarPreview.innerHTML = `<div class="meta"><b>#${escapeHtml(id)}</b><span>برای پیش‌نمایش، تصویر را از طریق «انتخاب» انتخاب کنید.</span></div>`;
    }
  }

  async function openCreateModal(){
    state.editor.mode = "create";
    resetAuthorForm();

    if(els.authorModalTitle) els.authorModalTitle.textContent = "ساخت نویسنده جدید";
    if(els.authorModalSub) els.authorModalSub.textContent = "یک کاربر انتخاب کن و اطلاعات پروفایل را وارد کن.";

    if(els.aUserId) els.aUserId.disabled = false;
    if(els.aUserSearch) els.aUserSearch.disabled = false;

    openModal(els.authorModal);
  }

  async function openEditModal(userId){
    state.editor.mode = "edit";
    resetAuthorForm();

    const uid = parseInt(userId, 10);
    state.editor.userId = Number.isFinite(uid) ? uid : null;

    if(els.authorModalTitle) els.authorModalTitle.textContent = "ویرایش پروفایل نویسنده";
    if(els.authorModalSub) els.authorModalSub.textContent = state.editor.userId ? `User ID: #${state.editor.userId}` : "—";

    // user is fixed in edit mode
    if(els.aUserId){
      els.aUserId.value = state.editor.userId ? String(state.editor.userId) : "";
      els.aUserId.disabled = true;
    }
    if(els.aUserSearch){
      els.aUserSearch.value = "";
      els.aUserSearch.disabled = true;
    }

    openModal(els.authorModal);

    try{
      setFormError("");
      const detail = await apiFetch(`/api/blog/authors/${encodeURIComponent(state.editor.userId)}/`);
      // hydrate user + avatar if needed
      if(detail?.user) await ensureUsers([detail.user]);
      if(detail?.avatar) await ensureMedia([detail.avatar]);

      const u = state.userMap.get(detail.user);
      state.editor.selectedUser = u || null;

      if(els.aDisplayName) els.aDisplayName.value = detail.display_name || "";
      if(els.aBio) els.aBio.value = detail.bio || "";
      if(els.aAvatarId) els.aAvatarId.value = detail.avatar ? String(detail.avatar) : "";
      updateAvatarPreview();
    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در دریافت اطلاعات نویسنده");
    }
  }

  function gatherAuthorPayload(){
    const display_name = String(els.aDisplayName?.value || "").trim();
    const bio = String(els.aBio?.value || "").trim();

    const avatarRaw = String(els.aAvatarId?.value || "").trim();
    const avatar = avatarRaw ? parseInt(avatarRaw, 10) : null;

    const errors = [];
    if(!display_name) errors.push("Display name الزامی است.");

    const payload = { display_name, bio };

    if(avatarRaw){
      if(!Number.isFinite(avatar)) errors.push("Avatar باید یک عدد معتبر (Media ID) باشد.");
      else payload.avatar = avatar;
    }else{
      payload.avatar = null;
    }

    if(state.editor.mode === "create"){
      const userRaw = String(els.aUserId?.value || "").trim();
      const user = userRaw ? parseInt(userRaw, 10) : NaN;
      if(!Number.isFinite(user)) errors.push("User ID الزامی است.");
      else payload.user = user;
    }

    return { payload, errors };
  }

  async function submitAuthorForm(ev){
    ev.preventDefault();

    const {payload, errors} = gatherAuthorPayload();
    if(errors.length){
      setFormError(errors.join(" "));
      return;
    }
    setFormError("");

    const btn = els.authorForm?.querySelector('button[type="submit"]');
    if(btn){
      btn.disabled = true;
      btn.dataset._txt = btn.textContent;
      btn.textContent = "در حال ذخیره...";
    }

    try{
      if(state.editor.mode === "create"){
        await apiFetch("/api/blog/authors/", { method:"POST", json: payload });
        toast("پروفایل نویسنده ساخته شد", "success");
      }else{
        const uid = state.editor.userId;
        await apiFetch(`/api/blog/authors/${encodeURIComponent(uid)}/`, { method:"PATCH", json: payload });
        toast("پروفایل نویسنده ویرایش شد", "success");
      }

      closeModal(els.authorModal);
      await loadAuthors();

    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در ذخیره نویسنده");
      toast("خطا در ذخیره", "danger");
    }finally{
      if(btn){
        btn.disabled = false;
        btn.textContent = btn.dataset._txt || "ذخیره";
      }
    }
  }

  async function deleteAuthor(userId){
    const uid = parseInt(userId, 10);
    if(!Number.isFinite(uid)) return;

    const ok = await confirmDialog({
      title: "حذف پروفایل",
      message: `پروفایل نویسنده برای کاربر #${uid} حذف شود؟ این عملیات غیرقابل برگشت است.`,
      yesText: "حذف",
      noText: "انصراف"
    });
    if(!ok) return;

    try{
      await apiFetch(`/api/blog/authors/${encodeURIComponent(uid)}/`, { method:"DELETE" });
      toast("پروفایل حذف شد", "success");
      await loadAuthors();
    }catch(err){
      console.error(err);
      toast("خطا در حذف پروفایل", "danger");
    }
  }

  /* --------- User search (for create) --------- */
  async function searchUsers(query){
    const q = String(query || "").trim();
    if(!q) return [];

    // Numeric => exact by id
    if(/^\d+$/.test(q)){
      try{
        const u = await apiFetch(`/api/users/users/${encodeURIComponent(q)}/`);
        return u ? [u] : [];
      }catch(_){
        return [];
      }
    }

    const param = q.includes("@") ? "email" : "username";
    const url = `/api/users/users/?${encodeURIComponent(param)}=${encodeURIComponent(q)}`;

    try{
      const list = await apiFetch(url);
      const arr = Array.isArray(list) ? list : (list?.results || []);
      return arr.slice(0, 20);
    }catch(_){
      return [];
    }
  }

  function renderUserSearchResults(users){
    if(!els.userSearchResults) return;

    if(!users.length){
      els.userSearchResults.innerHTML = `<div class="muted" style="padding:10px 6px;">نتیجه‌ای پیدا نشد.</div>`;
      els.userSearchResults.classList.remove("hidden");
      return;
    }

    els.userSearchResults.innerHTML = "";
    const frag = document.createDocumentFragment();

    for(const u of users){
      if(u?.id) state.userMap.set(u.id, u);

      const btn = document.createElement("div");
      btn.className = "userOption";
      const fullName = `${u.first_name || ""} ${u.last_name || ""}`.trim();
      btn.innerHTML = `
        <div>
          <b>${escapeHtml(u.username || "—")}</b>
          <small>${escapeHtml(fullName || "—")}</small>
        </div>
        <div class="right">
          <span class="pillId">#${escapeHtml(u.id)}</span>
        </div>
      `;
      btn.addEventListener("click", ()=>{
        state.editor.selectedUser = u;
        if(els.aUserId) els.aUserId.value = String(u.id);
        if(els.aUserSearch) els.aUserSearch.value = u.username || "";
        if(els.userSearchResults) els.userSearchResults.classList.add("hidden");
      });
      frag.appendChild(btn);
    }

    els.userSearchResults.appendChild(frag);
    els.userSearchResults.classList.remove("hidden");
  }

  /* --------- Media picker --------- */
  function mediaMatchesQuery(m, q){
    if(!q) return true;
    const hay = `${m.title||""} ${m.alt_text||""} ${m.storage_key||""} ${m.file||""} ${m.url||""} ${m.type||""} ${m.mime||""}`.toLowerCase();
    return hay.includes(q);
  }

  async function openMediaPicker(){
    state.editor.mediaPage = 1;
    state.editor.mediaHasNext = true;
    state.editor.mediaCache = [];
    if(els.mediaPickerTitle) els.mediaPickerTitle.textContent = "انتخاب آواتار";
    if(els.mediaSearch) els.mediaSearch.value = "";
    if(els.mediaGrid) els.mediaGrid.innerHTML = "";
    openModal(els.mediaPickerModal);
    await loadMediaPage();
  }

  async function loadMediaPage(){
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

      // cache
      for(const it of items){
        if(it?.id) state.mediaMap.set(it.id, it);
      }
      state.editor.mediaCache.push(...items);
      state.editor.mediaHasNext = !!next;
      state.editor.mediaPage += 1;

      renderMediaGrid();

      if(els.mediaLoadMoreBtn){
        els.mediaLoadMoreBtn.disabled = !state.editor.mediaHasNext;
        els.mediaLoadMoreBtn.textContent = state.editor.mediaHasNext ? "بیشتر" : "تمام شد";
      }

    }catch(err){
      console.error(err);
      toast("خطا در دریافت رسانه‌ها", "danger");
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
        const mime = String(m.mime || m.mime_type || "").toLowerCase();
        if(mime) return mime.startsWith("image/");
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
        if(els.aAvatarId) els.aAvatarId.value = String(m.id);
        updateAvatarPreview();
        closeModal(els.mediaPickerModal);
      });
      frag.appendChild(btn);
    }
    els.mediaGrid.appendChild(frag);
  }

  /* --------- Events --------- */
  function bindEvents(){
    if(els.newAuthorBtn) els.newAuthorBtn.addEventListener("click", openCreateModal);
    if(els.refreshAuthorsBtn) els.refreshAuthorsBtn.addEventListener("click", loadAuthors);

    if(els.applyFiltersBtn) els.applyFiltersBtn.addEventListener("click", ()=>{
      state.filters.search = String(els.fSearch?.value || "").trim();
      state.pageSize = parseInt(els.fPageSize?.value || "20", 10) || 20;
      applyClientFilters();
    });

    if(els.resetFiltersBtn) els.resetFiltersBtn.addEventListener("click", ()=>{
      state.filters.search = "";
      state.pageSize = 20;
      if(els.fSearch) els.fSearch.value = "";
      if(els.fPageSize) els.fPageSize.value = "20";
      applyClientFilters();
    });

    // table actions
    if(els.authorsTbody){
      els.authorsTbody.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-action]");
        if(!btn) return;
        const action = btn.getAttribute("data-action");
        const userId = btn.getAttribute("data-user");
        if(action === "edit") openEditModal(userId);
        if(action === "delete") deleteAuthor(userId);
      });
    }

    // editor modal close
    if(els.closeAuthorModalBtn) els.closeAuthorModalBtn.addEventListener("click", ()=>closeModal(els.authorModal));
    if(els.cancelAuthorBtn) els.cancelAuthorBtn.addEventListener("click", ()=>closeModal(els.authorModal));
    if(els.authorModal){
      els.authorModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) closeModal(els.authorModal);
      });
    }

    if(els.authorForm) els.authorForm.addEventListener("submit", submitAuthorForm);

    // user search debounce
    let t = null;
    const runSearch = async ()=>{
      if(state.editor.mode !== "create") return;
      const q = String(els.aUserSearch?.value || "").trim();
      if(!q){
        if(els.userSearchResults){
          els.userSearchResults.innerHTML = "";
          els.userSearchResults.classList.add("hidden");
        }
        return;
      }
      const users = await searchUsers(q);
      renderUserSearchResults(users);
    };

    if(els.aUserSearch){
      els.aUserSearch.addEventListener("input", ()=>{
        if(state.editor.mode !== "create") return;
        clearTimeout(t);
        t = setTimeout(runSearch, 280);
      });
    }

    if(els.aUserId){
      els.aUserId.addEventListener("change", async ()=>{
        if(state.editor.mode !== "create") return;
        const v = String(els.aUserId.value || "").trim();
        if(!v) return;
        const users = await searchUsers(v);
        if(users[0]){
          state.editor.selectedUser = users[0];
          if(els.aUserSearch) els.aUserSearch.value = users[0].username || "";
        }
      });
    }

    // avatar
    if(els.pickAvatarBtn) els.pickAvatarBtn.addEventListener("click", openMediaPicker);
    if(els.clearAvatarBtn) els.clearAvatarBtn.addEventListener("click", ()=>{
      if(els.aAvatarId) els.aAvatarId.value = "";
      updateAvatarPreview();
    });
    if(els.aAvatarId) els.aAvatarId.addEventListener("input", updateAvatarPreview);

    // media picker close
    if(els.closeMediaPickerBtn) els.closeMediaPickerBtn.addEventListener("click", ()=>closeModal(els.mediaPickerModal));
    if(els.mediaPickerModal){
      els.mediaPickerModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) closeModal(els.mediaPickerModal);
      });
    }
    if(els.mediaSearch) els.mediaSearch.addEventListener("input", renderMediaGrid);
    if(els.mediaLoadMoreBtn) els.mediaLoadMoreBtn.addEventListener("click", loadMediaPage);

    // confirm modal close on backdrop click (also resolves the promise)
    if(els.confirmModal){
      els.confirmModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close){
          if(typeof confirmCancel === "function") confirmCancel();
          else closeModal(els.confirmModal);
        }
      });
    }

    // esc key
    document.addEventListener("keydown", (e)=>{
      if(e.key === "Escape"){
        if(els.mediaPickerModal?.classList.contains("isOpen")) closeModal(els.mediaPickerModal);
        if(els.confirmModal?.classList.contains("isOpen")){ if(typeof confirmCancel === "function") confirmCancel(); else closeModal(els.confirmModal); }
        if(els.authorModal?.classList.contains("isOpen")) closeModal(els.authorModal);
      }
    });
  }

  async function init(){
    portalModalsToBody();
    bindEvents();
    await hydrateTopUser();
    // default filters UI
    if(els.fPageSize) els.fPageSize.value = "20";
    await loadAuthors();
    updateAvatarPreview();
  }

  init();
})();
