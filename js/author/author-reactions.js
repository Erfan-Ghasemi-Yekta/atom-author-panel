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
    newReactionBtn: $("newReactionBtn"),
    refreshReactionsBtn: $("refreshReactionsBtn"),

    // filters
    fSearch: $("fSearch"),
    fUserId: $("fUserId"),
    fReaction: $("fReaction"),
    fContentType: $("fContentType"),
    fPageSize: $("fPageSize"),
    applyFiltersBtn: $("applyFiltersBtn"),
    resetFiltersBtn: $("resetFiltersBtn"),
    activeFilters: $("activeFilters"),

    // stats
    statTotal: $("statTotal"),
    statShown: $("statShown"),

    // table
    reactionsTbody: $("reactionsTbody"),
    resultsHint: $("resultsHint"),
    paginationBar: $("paginationBar"),

    // editor modal
    reactionModal: $("reactionModal"),
    reactionModalTitle: $("reactionModalTitle"),
    reactionModalSub: $("reactionModalSub"),
    closeReactionModalBtn: $("closeReactionModalBtn"),
    cancelReactionBtn: $("cancelReactionBtn"),
    reactionForm: $("reactionForm"),
    formError: $("formError"),

    // form fields
    rUserSearch: $("rUserSearch"),
    rUserId: $("rUserId"),
    rUserHint: $("rUserHint"),
    userSearchResults: $("userSearchResults"),
    rReaction: $("rReaction"),
    rContentType: $("rContentType"),
    rObjectId: $("rObjectId"),

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
  const dtf = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });

  let confirmCancel = null;

  const state = {
    me: null,
    reactions: [],
    filtered: [],
    page: 1,
    pageSize: 20,
    filters: {
      search: "",
      userId: "",
      reaction: "",
      contentType: ""
    },
    userMap: new Map(),   // userId -> UserReadOnly
    editor: {
      mode: "create", // create | edit
      id: null,
      selectedUser: null, // UserReadOnly
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
    const modals = [els.reactionModal, els.confirmModal].filter(Boolean);
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
      if(els.userRoleTop) els.userRoleTop.textContent = "مدیریت واکنش‌ها";
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

    const s = String(state.filters.search || "").trim();
    if(s) chips.push(`<span class="chip"><b>جستجو:</b> ${escapeHtml(s)}</span>`);

    const uid = String(state.filters.userId || "").trim();
    if(uid) chips.push(`<span class="chip"><b>User:</b> <span class="mono">#${escapeHtml(uid)}</span></span>`);

    const r = String(state.filters.reaction || "").trim();
    if(r) chips.push(`<span class="chip"><b>Reaction:</b> ${escapeHtml(r)}</span>`);

    const ct = String(state.filters.contentType || "").trim();
    if(ct) chips.push(`<span class="chip"><b>Content type:</b> <span class="mono">#${escapeHtml(ct)}</span></span>`);

    els.activeFilters.innerHTML = chips.length ? chips.join("") : `<span class="chip chip--muted">بدون فیلتر</span>`;
  }

  function applyClientFilters(){
    const q = String(state.filters.search || "").trim().toLowerCase();
    const filterUserId = String(state.filters.userId || "").trim();
    const filterReaction = String(state.filters.reaction || "").trim().toLowerCase();
    const filterContentType = String(state.filters.contentType || "").trim();

    let list = Array.isArray(state.reactions) ? [...state.reactions] : [];

    if(filterUserId){
      list = list.filter(it => String(it.user ?? "") === filterUserId);
    }
    if(filterContentType){
      list = list.filter(it => String(it.content_type ?? "") === filterContentType);
    }
    if(filterReaction){
      list = list.filter(it => String(it.reaction || "").toLowerCase().includes(filterReaction));
    }

    if(q){
      list = list.filter(it=>{
        const user = state.userMap.get(it.user);
        const hay = [
          it.id,
          it.user,
          it.reaction,
          it.content_type,
          it.object_id,
          user?.username,
          user?.email,
          user?.first_name,
          user?.last_name
        ].map(x=>String(x||"").toLowerCase()).join(" ");
        return hay.includes(q) || (`#${it.user}`.includes(q));
      });
    }

    state.filtered = list;
    state.page = 1;
    render();
  }

  function renderStats(){
    if(els.statTotal) els.statTotal.textContent = nf.format(state.reactions.length);
    if(els.statShown) els.statShown.textContent = nf.format(state.filtered.length);
  }


  const faMonths = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
  const faNums = "۰۱۲۳۴۵۶۷۸۹";
  const arNums = "٠١٢٣٤٥٦٧٨٩";

  function toFaDigits(input){
    return String(input ?? "").replace(/\d/g, d => faNums[d] ?? d);
  }

  function faToEnDigits(input){
    return String(input ?? "")
      .replace(/[۰-۹]/g, d => String(faNums.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(arNums.indexOf(d)));
  }

  function parseJalaliDateTime(str){
    const s = faToEnDigits(str).trim();
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if(!m) return null;

    const jy = Number(m[1]);
    const jm = Number(m[2]);
    const jd = Number(m[3]);

    if(!(jy > 0 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31)) return null;

    const hh = (m[4] !== undefined) ? Number(m[4]) : null;
    const mm = (m[5] !== undefined) ? Number(m[5]) : null;
    const ss = (m[6] !== undefined) ? Number(m[6]) : null;

    if(hh !== null && !(hh >= 0 && hh <= 23)) return null;
    if(mm !== null && !(mm >= 0 && mm <= 59)) return null;
    if(ss !== null && !(ss >= 0 && ss <= 59)) return null;

    return { jy, jm, jd, hh, mm, ss };
  }

  function fmtDate(v){
    if(!v) return "—";

    // Backend returns Jalali like "1404/10/08 14:33:20".
    // If we feed that into Date(), it will be treated as Gregorian year 1404 and show wrong Jalali (year ~783).
    const s = String(v).trim();
    const jal = parseJalaliDateTime(s);

    if(jal){
      const day = toFaDigits(String(jal.jd));
      const monthName = faMonths[jal.jm - 1] || nf.format(jal.jm);
      const year = toFaDigits(String(jal.jy));

      let out = `${day} ${monthName} ${year}`;
      if(jal.hh !== null && jal.mm !== null){
        const hh = String(jal.hh).padStart(2,"0");
        const mm = String(jal.mm).padStart(2,"0");
        out += ` — ${toFaDigits(`${hh}:${mm}`)}`;
      }
      return out;
    }

    // Fallback: ISO/Gregorian timestamps
    try{
      const d = new Date(v);
      if(Number.isNaN(d.getTime())) return "—";
      return dtf.format(d);
    }catch(_){
      return "—";
    }
  }


  function renderTable(){
    if(!els.reactionsTbody) return;

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

    clearNode(els.reactionsTbody);

    if(!pageItems.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" class="emptyCell">واکنشی برای نمایش وجود ندارد.</td>`;
      els.reactionsTbody.appendChild(tr);
      return;
    }

    for(const it of pageItems){
      const user = state.userMap.get(it.user);
      const userLabel = user ? `${user.username || ""}`.trim() : "";
      const fullName = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="userCell">
            <b>${escapeHtml(userLabel || "—")}</b>
            <div class="sub">
              <span class="mono">#${escapeHtml(it.user)}</span>
              ${fullName ? `<span class="muted">${escapeHtml(fullName)}</span>` : `<span class="muted">—</span>`}
            </div>
          </div>
        </td>
        <td class="reactionCell">${escapeHtml(it.reaction || "—")}</td>
        <td><span class="mono">#${escapeHtml(it.content_type)}</span></td>
        <td><span class="mono">#${escapeHtml(it.object_id)}</span></td>
        <td class="createdCell">${escapeHtml(fmtDate(it.created_at))}</td>
        <td class="actions">
          <button class="btn btn--small" data-action="edit" data-id="${escapeHtml(it.id)}">ویرایش</button>
          <button class="btn btn--small btn--danger" data-action="delete" data-id="${escapeHtml(it.id)}">حذف</button>
        </td>
      `;
      els.reactionsTbody.appendChild(tr);
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

  function setLoading(loading, message="در حال دریافت لیست واکنش‌ها..."){
    if(!els.reactionsTbody) return;
    if(!loading) return;
    clearNode(els.reactionsTbody);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="loadingCell">${escapeHtml(message)}</td>`;
    els.reactionsTbody.appendChild(tr);
  }

  /* --------- Users hydration --------- */
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

  async function loadReactions(){
    setLoading(true);
    try{
      const data = await apiFetch("/api/blog/reactions/");
      const {items} = normalizeList(data);
      state.reactions = items || [];

      const userIds = state.reactions.map(r=>r.user).filter(Boolean);
      await ensureUsers(userIds);

      applyClientFilters();
      toast("لیست واکنش‌ها به‌روزرسانی شد", "success");
    }catch(err){
      console.error(err);
      clearNode(els.reactionsTbody);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" class="errorCell">${escapeHtml(err.message || "خطا در دریافت واکنش‌ها")}</td>`;
      els.reactionsTbody.appendChild(tr);
      toast("خطا در دریافت واکنش‌ها", "danger");
    }
  }

  /* --------- Editor --------- */
  function resetReactionForm(){
    if(els.reactionForm) els.reactionForm.reset();
    if(els.formError){
      els.formError.textContent = "";
      els.formError.classList.add("hidden");
    }
    state.editor.id = null;
    state.editor.selectedUser = null;

    if(els.userSearchResults){
      els.userSearchResults.innerHTML = "";
      els.userSearchResults.classList.add("hidden");
    }
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

  async function openCreateModal(){
    state.editor.mode = "create";
    resetReactionForm();

    if(els.reactionModalTitle) els.reactionModalTitle.textContent = "ساخت واکنش جدید";
    if(els.reactionModalSub) els.reactionModalSub.textContent = "فیلدها را وارد کن و ذخیره کن.";

    if(els.rUserId) els.rUserId.disabled = false;
    if(els.rUserSearch) els.rUserSearch.disabled = false;

    openModal(els.reactionModal);
  }

  async function openEditModal(id){
    state.editor.mode = "edit";
    resetReactionForm();

    const rid = parseInt(id, 10);
    state.editor.id = Number.isFinite(rid) ? rid : null;

    if(els.reactionModalTitle) els.reactionModalTitle.textContent = "ویرایش واکنش";
    if(els.reactionModalSub) els.reactionModalSub.textContent = state.editor.id ? `Reaction ID: #${state.editor.id}` : "—";

    // user is fixed in edit mode
    if(els.rUserId){
      els.rUserId.value = "";
      els.rUserId.disabled = true;
    }
    if(els.rUserSearch){
      els.rUserSearch.value = "";
      els.rUserSearch.disabled = true;
    }

    openModal(els.reactionModal);

    try{
      setFormError("");
      const detail = await apiFetch(`/api/blog/reactions/${encodeURIComponent(state.editor.id)}/`);

      if(detail?.user) await ensureUsers([detail.user]);
      const u = state.userMap.get(detail.user);
      state.editor.selectedUser = u || null;

      if(els.rUserId) els.rUserId.value = detail.user ? String(detail.user) : "";
      if(els.rReaction) els.rReaction.value = detail.reaction || "";
      if(els.rContentType) els.rContentType.value = detail.content_type ? String(detail.content_type) : "";
      if(els.rObjectId) els.rObjectId.value = (detail.object_id !== undefined && detail.object_id !== null) ? String(detail.object_id) : "";

    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در دریافت اطلاعات واکنش");
    }
  }

  function gatherReactionPayload(){
    const reaction = String(els.rReaction?.value || "").trim();
    const contentTypeRaw = String(els.rContentType?.value || "").trim();
    const objectIdRaw = String(els.rObjectId?.value || "").trim();
    const userRaw = String(els.rUserId?.value || "").trim();

    const content_type = contentTypeRaw ? parseInt(contentTypeRaw, 10) : NaN;
    const object_id = objectIdRaw ? parseInt(objectIdRaw, 10) : NaN;
    const user = userRaw ? parseInt(userRaw, 10) : NaN;

    const errors = [];
    if(!reaction) errors.push("Reaction الزامی است.");
    if(!Number.isFinite(content_type)) errors.push("Content type الزامی است و باید عدد باشد.");
    if(!Number.isFinite(object_id)) errors.push("Object id الزامی است و باید عدد باشد.");

    const payload = { reaction, content_type, object_id };

    // In many backends user is read-only; but you asked for this field, so we send it only when provided.
    if(state.editor.mode === "create" && userRaw){
      if(!Number.isFinite(user)) errors.push("User ID باید عدد معتبر باشد.");
      else payload.user = user;
    }

    return { payload, errors };
  }

  async function submitReactionForm(ev){
    ev.preventDefault();

    const {payload, errors} = gatherReactionPayload();
    if(errors.length){
      setFormError(errors.join(" "));
      return;
    }
    setFormError("");

    const btn = els.reactionForm?.querySelector('button[type="submit"]');
    if(btn){
      btn.disabled = true;
      btn.dataset._txt = btn.textContent;
      btn.textContent = "در حال ذخیره...";
    }

    try{
      if(state.editor.mode === "create"){
        await apiFetch("/api/blog/reactions/", { method:"POST", json: payload });
        toast("واکنش ساخته شد", "success");
      }else{
        const rid = state.editor.id;
        await apiFetch(`/api/blog/reactions/${encodeURIComponent(rid)}/`, { method:"PATCH", json: payload });
        toast("واکنش ویرایش شد", "success");
      }

      closeModal(els.reactionModal);
      await loadReactions();

    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در ذخیره واکنش");
      toast("خطا در ذخیره", "danger");
    }finally{
      if(btn){
        btn.disabled = false;
        btn.textContent = btn.dataset._txt || "ذخیره";
      }
    }
  }

  async function deleteReaction(id){
    const rid = parseInt(id, 10);
    if(!Number.isFinite(rid)) return;

    const ok = await confirmDialog({
      title: "حذف واکنش",
      message: `واکنش #${rid} حذف شود؟ این عملیات غیرقابل برگشت است.`,
      yesText: "حذف",
      noText: "انصراف"
    });
    if(!ok) return;

    try{
      await apiFetch(`/api/blog/reactions/${encodeURIComponent(rid)}/`, { method:"DELETE" });
      toast("واکنش حذف شد", "success");
      await loadReactions();
    }catch(err){
      console.error(err);
      toast("خطا در حذف واکنش", "danger");
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
      const data = await apiFetch(url);
      const {items} = normalizeList(data);
      return items.slice(0, 20);
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
        if(els.rUserId) els.rUserId.value = String(u.id);
        if(els.rUserSearch) els.rUserSearch.value = u.username || "";
        if(els.userSearchResults) els.userSearchResults.classList.add("hidden");
      });
      frag.appendChild(btn);
    }

    els.userSearchResults.appendChild(frag);
    els.userSearchResults.classList.remove("hidden");
  }

  /* --------- Events --------- */
  function bindEvents(){
    if(els.newReactionBtn) els.newReactionBtn.addEventListener("click", openCreateModal);
    if(els.refreshReactionsBtn) els.refreshReactionsBtn.addEventListener("click", loadReactions);

    if(els.applyFiltersBtn) els.applyFiltersBtn.addEventListener("click", ()=>{
      state.filters.search = String(els.fSearch?.value || "").trim();
      state.filters.userId = String(els.fUserId?.value || "").trim();
      state.filters.reaction = String(els.fReaction?.value || "").trim();
      state.filters.contentType = String(els.fContentType?.value || "").trim();
      state.pageSize = parseInt(els.fPageSize?.value || "20", 10) || 20;
      applyClientFilters();
    });

    if(els.resetFiltersBtn) els.resetFiltersBtn.addEventListener("click", ()=>{
      state.filters.search = "";
      state.filters.userId = "";
      state.filters.reaction = "";
      state.filters.contentType = "";
      state.pageSize = 20;

      if(els.fSearch) els.fSearch.value = "";
      if(els.fUserId) els.fUserId.value = "";
      if(els.fReaction) els.fReaction.value = "";
      if(els.fContentType) els.fContentType.value = "";
      if(els.fPageSize) els.fPageSize.value = "20";

      applyClientFilters();
    });

    // table actions
    if(els.reactionsTbody){
      els.reactionsTbody.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-action]");
        if(!btn) return;
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        if(action === "edit") openEditModal(id);
        if(action === "delete") deleteReaction(id);
      });
    }

    // editor modal close
    if(els.closeReactionModalBtn) els.closeReactionModalBtn.addEventListener("click", ()=>closeModal(els.reactionModal));
    if(els.cancelReactionBtn) els.cancelReactionBtn.addEventListener("click", ()=>closeModal(els.reactionModal));
    if(els.reactionModal){
      els.reactionModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) closeModal(els.reactionModal);
      });
    }

    if(els.reactionForm) els.reactionForm.addEventListener("submit", submitReactionForm);

    // user search debounce
    let t = null;
    const runSearch = async ()=>{
      if(state.editor.mode !== "create") return;
      const q = String(els.rUserSearch?.value || "").trim();
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

    if(els.rUserSearch){
      els.rUserSearch.addEventListener("input", ()=>{
        if(state.editor.mode !== "create") return;
        clearTimeout(t);
        t = setTimeout(runSearch, 280);
      });
    }

    if(els.rUserId){
      els.rUserId.addEventListener("change", async ()=>{
        if(state.editor.mode !== "create") return;
        const v = String(els.rUserId.value || "").trim();
        if(!v) return;
        const users = await searchUsers(v);
        if(users[0]){
          state.editor.selectedUser = users[0];
          if(els.rUserSearch) els.rUserSearch.value = users[0].username || "";
        }
      });
    }

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
        if(els.reactionModal?.classList.contains("isOpen")) closeModal(els.reactionModal);
      }
    });
  }

  async function init(){
    portalModalsToBody();
    bindEvents();
    await hydrateTopUser();
    if(els.fPageSize) els.fPageSize.value = "20";
    await loadReactions();
  }

  init();
})();