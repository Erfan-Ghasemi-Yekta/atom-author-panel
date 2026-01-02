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
    newCommentBtn: $("newCommentBtn"),
    refreshCommentsBtn: $("refreshCommentsBtn"),

    // filters
    fSearch: $("fSearch"),
    fStatus: $("fStatus"),
    fPageSize: $("fPageSize"),
    applyFiltersBtn: $("applyFiltersBtn"),
    resetFiltersBtn: $("resetFiltersBtn"),
    activeFilters: $("activeFilters"),

    // stats
    statTotal: $("statTotal"),
    statShown: $("statShown"),
    statPending: $("statPending"),

    // table
    commentsTbody: $("commentsTbody"),
    resultsHint: $("resultsHint"),
    paginationBar: $("paginationBar"),

    // editor modal
    commentModal: $("commentModal"),
    commentModalTitle: $("commentModalTitle"),
    commentModalSub: $("commentModalSub"),
    closeCommentModalBtn: $("closeCommentModalBtn"),
    cancelCommentBtn: $("cancelCommentBtn"),
    commentForm: $("commentForm"),
    formError: $("formError"),

    // form fields
    cPostId: $("cPostId"),
    cPostHint: $("cPostHint"),
    cUserId: $("cUserId"),
    cUserHint: $("cUserHint"),
    cParentId: $("cParentId"),
    cContent: $("cContent"),
    cStatus: $("cStatus"),
    cIp: $("cIp"),
    cUserAgent: $("cUserAgent"),

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
    comments: [],
    filtered: [],
    page: 1,
    pageSize: 20,
    filters: {
      search: "",
      status: ""
    },
    userMap: new Map(), // userId -> UserReadOnly
    postMap: new Map(), // postId -> PostList
    editor: {
      mode: "create", // create | edit
      id: null
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

  function truncate(str, n=180){
    const s = String(str || "").trim();
    if(!s) return "";
    if(s.length <= n) return s;
    return s.slice(0, n-1) + "…";
  }

  function toFaDigits(input){
    const map = "۰۱۲۳۴۵۶۷۸۹";
    return String(input ?? "").replace(/\d/g, (d)=>map[d]);
  }

  function formatDate(value){
    if(!value) return "—";
    const s = String(value).trim();
    if(!s) return "—";

    // Backend already returns a Jalali string like: 1404/10/08 14:15:12
    // If so, DON'T parse with Date (it would treat 1404 as Gregorian year).
    if(/^(13|14)\d{2}\/\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/.test(s)){
      return toFaDigits(s);
    }

    // Otherwise try native date parsing (ISO/Gregorian)
    try{
      const d = new Date(s);
      if(Number.isNaN(d.getTime())) return toFaDigits(s);
      return d.toLocaleString("fa-IR");
    }catch(_){
      return toFaDigits(s);
    }
  }

  function statusLabel(status){
    const s = String(status || "").toLowerCase();
    if(s === "approved") return "Approved";
    if(s === "spam") return "Spam";
    if(s === "removed") return "Removed";
    return "Pending";
  }
  function statusClass(status){
    const s = String(status || "").toLowerCase();
    if(s === "approved") return "statusBadge statusBadge--approved";
    if(s === "spam") return "statusBadge statusBadge--spam";
    if(s === "removed") return "statusBadge statusBadge--removed";
    return "statusBadge statusBadge--pending";
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
    const modals = [els.commentModal, els.confirmModal].filter(Boolean);
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
      if(els.userRoleTop) els.userRoleTop.textContent = "مدیریت کامنت‌ها";
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
    const st = state.filters.status;

    if(s) chips.push(`<span class="chip"><b>جستجو:</b> ${escapeHtml(s)}</span>`);
    if(st) chips.push(`<span class="chip"><b>Status:</b> ${escapeHtml(statusLabel(st))}</span>`);

    els.activeFilters.innerHTML = chips.length ? chips.join("") : `<span class="chip chip--muted">بدون فیلتر</span>`;
  }

  function applyClientFilters(){
    const q = String(state.filters.search || "").trim().toLowerCase();
    const status = String(state.filters.status || "").trim().toLowerCase();
    let list = Array.isArray(state.comments) ? [...state.comments] : [];

    if(status){
      list = list.filter(c => String(c.status || "pending").toLowerCase() === status);
    }

    if(q){
      list = list.filter(c=>{
        const u = state.userMap.get(c.user);
        const p = state.postMap.get(c.post);

        const hay = [
          c.id,
          c.post,
          c.user,
          c.parent,
          c.status,
          c.content,
          u?.username,
          u?.email,
          u?.first_name,
          u?.last_name,
          p?.title,
          p?.slug
        ].map(x=>String(x||"").toLowerCase()).join(" ");

        // allow "#123" patterns
        return hay.includes(q)
          || (`#${c.id}`.includes(q))
          || (`#${c.post}`.includes(q))
          || (`#${c.user}`.includes(q))
          || (`#${c.parent}`.includes(q));
      });
    }

    state.filtered = list;
    state.page = 1;
    render();
  }

  function renderStats(){
    const total = state.comments.length;
    const shown = state.filtered.length;
    const pending = state.comments.filter(c => String(c.status || "pending").toLowerCase() === "pending").length;

    if(els.statTotal) els.statTotal.textContent = nf.format(total);
    if(els.statShown) els.statShown.textContent = nf.format(shown);
    if(els.statPending) els.statPending.textContent = nf.format(pending);
  }

  function renderTable(){
    if(!els.commentsTbody) return;

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

    clearNode(els.commentsTbody);

    if(!pageItems.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="8" class="emptyCell">کامنتی برای نمایش وجود ندارد.</td>`;
      els.commentsTbody.appendChild(tr);
      return;
    }

    for(const c of pageItems){
      const user = state.userMap.get(c.user);
      const post = state.postMap.get(c.post);

      const userLabel = user ? `${user.username || user.email || ""}`.trim() : "";
      const fullName = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "";

      const postTitle = post?.title || "";
      const postSlug = post?.slug || "";

      const contentText = truncate(c.content || "", 180);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="mono">#${escapeHtml(c.id)}</span></td>

        <td>
          <div class="postCell">
            <b>${escapeHtml(postTitle || "—")}</b>
            <div class="sub">
              <span class="mono">#${escapeHtml(c.post)}</span>
              ${postSlug ? `<span class="muted">${escapeHtml(postSlug)}</span>` : `<span class="muted">—</span>`}
            </div>
          </div>
        </td>

        <td>
          <div class="userCell">
            <b>${escapeHtml(userLabel || "—")}</b>
            <div class="sub">
              <span class="mono">#${escapeHtml(c.user)}</span>
              ${fullName ? `<span class="muted">${escapeHtml(fullName)}</span>` : `<span class="muted">—</span>`}
            </div>
          </div>
        </td>

        <td>${c.parent ? `<span class="mono">#${escapeHtml(c.parent)}</span>` : `<span class="muted">—</span>`}</td>

        <td class="contentCell" title="${escapeHtml(c.content || "")}">${escapeHtml(contentText || "—")}</td>

        <td><span class="${statusClass(c.status)}">${escapeHtml(statusLabel(c.status))}</span></td>

        <td>${escapeHtml(formatDate(c.created_at))}</td>

        <td class="actions">
          <button class="btn btn--small" data-action="edit" data-id="${escapeHtml(c.id)}">ویرایش</button>
          <button class="btn btn--small btn--danger" data-action="delete" data-id="${escapeHtml(c.id)}">حذف</button>
        </td>
      `;
      els.commentsTbody.appendChild(tr);
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

  function setLoading(loading, message="در حال دریافت لیست کامنت‌ها..."){
    if(!els.commentsTbody) return;
    if(!loading) return;
    clearNode(els.commentsTbody);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="8" class="loadingCell">${escapeHtml(message)}</td>`;
    els.commentsTbody.appendChild(tr);
  }

  /* --------- Users + Posts hydration --------- */
  async function fetchWithConcurrency(items, worker, concurrency=6){
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

  async function tryFindPostInSearch(id){
    try{
      const data = await apiFetch(`/api/blog/posts/?search=${encodeURIComponent(String(id))}&page_size=50`);
      const {items} = normalizeList(data);
      const found = items.find(p => String(p.id) === String(id));
      if(found && found.id) state.postMap.set(found.id, found);
      return found || null;
    }catch(_){
      return null;
    }
  }

  async function ensurePosts(postIds){
    const ids = postIds.filter(Boolean).map(Number).filter(n=>Number.isFinite(n));
    const missing = ids.filter(id => !state.postMap.has(id));
    if(!missing.length) return;

    // best-effort: try search endpoint per id (cheap, likely to work).
    await fetchWithConcurrency(missing, async (id)=>{
      return await tryFindPostInSearch(id);
    }, 6);
  }

  async function loadComments(){
    setLoading(true);
    try{
      const list = await apiFetch("/api/blog/comments/");
      state.comments = Array.isArray(list) ? list : (list?.results || []);

      const userIds = state.comments.map(c=>c.user).filter(Boolean);
      const postIds = state.comments.map(c=>c.post).filter(Boolean);

      await Promise.all([
        ensureUsers(userIds),
        ensurePosts(postIds)
      ]);

      applyClientFilters();
      toast("لیست کامنت‌ها به‌روزرسانی شد", "success");
    }catch(err){
      console.error(err);
      clearNode(els.commentsTbody);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="8" class="errorCell">${escapeHtml(err.message || "خطا در دریافت کامنت‌ها")}</td>`;
      els.commentsTbody.appendChild(tr);
      toast("خطا در دریافت کامنت‌ها", "danger");
    }
  }

  /* --------- Editor --------- */
  function resetCommentForm(){
    if(els.commentForm) els.commentForm.reset();
    if(els.formError){
      els.formError.textContent = "";
      els.formError.classList.add("hidden");
    }
    state.editor.id = null;

    // keep user read-only
    if(els.cUserId){
      els.cUserId.value = state.me?.id ? String(state.me.id) : "";
    }

    if(els.cIp) els.cIp.value = "";
    if(els.cUserAgent) els.cUserAgent.value = "";
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

  function updatePostHint(){
    if(!els.cPostHint) return;
    const id = els.cPostId?.value ? parseInt(els.cPostId.value, 10) : NaN;
    if(!Number.isFinite(id)){
      els.cPostHint.textContent = "Post ID الزامی است.";
      return;
    }
    const p = state.postMap.get(id);
    if(p?.title){
      els.cPostHint.textContent = `Post: ${p.title}${p.slug ? ` (${p.slug})` : ""}`;
    }else{
      els.cPostHint.textContent = "اگر عنوان پست را پیدا کنیم، اینجا نمایش داده می‌شود.";
    }
  }

  async function openCreateModal(){
    state.editor.mode = "create";
    resetCommentForm();

    if(els.commentModalTitle) els.commentModalTitle.textContent = "ساخت کامنت جدید";
    if(els.commentModalSub) els.commentModalSub.textContent = "Post، Content و Status را وارد کن.";

    // defaults
    if(els.cStatus) els.cStatus.value = "pending";

    openModal(els.commentModal);
    updatePostHint();
  }

  async function openEditModal(id){
    state.editor.mode = "edit";
    resetCommentForm();

    const cid = parseInt(id, 10);
    state.editor.id = Number.isFinite(cid) ? cid : null;

    if(els.commentModalTitle) els.commentModalTitle.textContent = "ویرایش کامنت";
    if(els.commentModalSub) els.commentModalSub.textContent = state.editor.id ? `Comment ID: #${state.editor.id}` : "—";

    openModal(els.commentModal);

    try{
      setFormError("");
      const detail = await apiFetch(`/api/blog/comments/${encodeURIComponent(state.editor.id)}/`);

      // hydrate dependencies
      if(detail?.user) await ensureUsers([detail.user]);
      if(detail?.post) await ensurePosts([detail.post]);

      if(els.cPostId) els.cPostId.value = detail.post ? String(detail.post) : "";
      if(els.cUserId) els.cUserId.value = detail.user ? String(detail.user) : "";
      if(els.cParentId) els.cParentId.value = detail.parent ? String(detail.parent) : "";
      if(els.cContent) els.cContent.value = detail.content || "";
      if(els.cStatus) els.cStatus.value = detail.status || "pending";

      // optional fields (if backend returns them)
      if(els.cIp) els.cIp.value = detail.ip || detail.ip_address || "";
      if(els.cUserAgent) els.cUserAgent.value = detail.user_agent || detail.userAgent || "";

      updatePostHint();
    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در دریافت اطلاعات کامنت");
    }
  }

  function gatherCommentPayload(){
    const postRaw = String(els.cPostId?.value || "").trim();
    const post = postRaw ? parseInt(postRaw, 10) : NaN;

    const parentRaw = String(els.cParentId?.value || "").trim();
    const parent = parentRaw ? parseInt(parentRaw, 10) : null;

    const content = String(els.cContent?.value || "").trim();
    const status = String(els.cStatus?.value || "pending").trim();

    const errors = [];
    if(!Number.isFinite(post)) errors.push("Post ID الزامی است.");
    if(!content) errors.push("Content الزامی است.");
    if(parentRaw && !Number.isFinite(parent)) errors.push("Parent باید یک عدد معتبر (Comment ID) باشد.");

    const payload = { post, content, status };
    payload.parent = parentRaw ? parent : null;

    return { payload, errors };
  }

  async function submitCommentForm(ev){
    ev.preventDefault();

    const {payload, errors} = gatherCommentPayload();
    if(errors.length){
      setFormError(errors.join(" "));
      return;
    }
    setFormError("");

    const btn = els.commentForm?.querySelector('button[type="submit"]');
    if(btn){
      btn.disabled = true;
      btn.dataset._txt = btn.textContent;
      btn.textContent = "در حال ذخیره...";
    }

    try{
      if(state.editor.mode === "create"){
        await apiFetch("/api/blog/comments/", { method:"POST", json: payload });
        toast("کامنت ساخته شد", "success");
      }else{
        const id = state.editor.id;
        await apiFetch(`/api/blog/comments/${encodeURIComponent(id)}/`, { method:"PATCH", json: payload });
        toast("کامنت ویرایش شد", "success");
      }

      closeModal(els.commentModal);
      await loadComments();

    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در ذخیره کامنت");
      toast("خطا در ذخیره", "danger");
    }finally{
      if(btn){
        btn.disabled = false;
        btn.textContent = btn.dataset._txt || "ذخیره";
      }
    }
  }

  async function deleteComment(id){
    const cid = parseInt(id, 10);
    if(!Number.isFinite(cid)) return;

    const ok = await confirmDialog({
      title: "حذف کامنت",
      message: `کامنت #${cid} حذف شود؟ این عملیات غیرقابل برگشت است.`,
      yesText: "حذف",
      noText: "انصراف"
    });
    if(!ok) return;

    try{
      await apiFetch(`/api/blog/comments/${encodeURIComponent(cid)}/`, { method:"DELETE" });
      toast("کامنت حذف شد", "success");
      await loadComments();
    }catch(err){
      console.error(err);
      toast("خطا در حذف کامنت", "danger");
    }
  }

  /* --------- Events --------- */
  function bindEvents(){
    if(els.newCommentBtn) els.newCommentBtn.addEventListener("click", openCreateModal);
    if(els.refreshCommentsBtn) els.refreshCommentsBtn.addEventListener("click", loadComments);

    if(els.applyFiltersBtn) els.applyFiltersBtn.addEventListener("click", ()=>{
      state.filters.search = String(els.fSearch?.value || "").trim();
      state.filters.status = String(els.fStatus?.value || "").trim();
      state.pageSize = parseInt(els.fPageSize?.value || "20", 10) || 20;
      applyClientFilters();
    });

    if(els.resetFiltersBtn) els.resetFiltersBtn.addEventListener("click", ()=>{
      state.filters.search = "";
      state.filters.status = "";
      state.pageSize = 20;
      if(els.fSearch) els.fSearch.value = "";
      if(els.fStatus) els.fStatus.value = "";
      if(els.fPageSize) els.fPageSize.value = "20";
      applyClientFilters();
    });

    // table actions
    if(els.commentsTbody){
      els.commentsTbody.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-action]");
        if(!btn) return;
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        if(action === "edit") openEditModal(id);
        if(action === "delete") deleteComment(id);
      });
    }

    // editor modal close
    if(els.closeCommentModalBtn) els.closeCommentModalBtn.addEventListener("click", ()=>closeModal(els.commentModal));
    if(els.cancelCommentBtn) els.cancelCommentBtn.addEventListener("click", ()=>closeModal(els.commentModal));
    if(els.commentModal){
      els.commentModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) closeModal(els.commentModal);
      });
    }

    if(els.commentForm) els.commentForm.addEventListener("submit", submitCommentForm);
    if(els.cPostId) els.cPostId.addEventListener("input", async ()=>{
      updatePostHint();
      const id = parseInt(els.cPostId.value || "", 10);
      if(Number.isFinite(id) && !state.postMap.has(id)){
        await ensurePosts([id]);
        updatePostHint();
      }
    });

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
        if(els.confirmModal?.classList.contains("isOpen")){ if(typeof confirmCancel === "function") confirmCancel(); else closeModal(els.confirmModal); }
        if(els.commentModal?.classList.contains("isOpen")) closeModal(els.commentModal);
      }
    });
  }

  async function init(){
    portalModalsToBody();
    bindEvents();
    await hydrateTopUser();

    // default filters UI
    if(els.fPageSize) els.fPageSize.value = "20";
    if(els.fStatus) els.fStatus.value = "";

    // prefill user id in editor from "me"
    if(els.cUserId && state.me?.id) els.cUserId.value = String(state.me.id);

    await loadComments();
    updatePostHint();
  }

  init();
})();