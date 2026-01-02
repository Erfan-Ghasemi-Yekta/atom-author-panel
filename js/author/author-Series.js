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
    newSeriesBtn: $("newSeriesBtn"),
    refreshSeriesBtn: $("refreshSeriesBtn"),

    // filters
    fSearch: $("fSearch"),
    fStrategy: $("fStrategy"),
    fPageSize: $("fPageSize"),
    applyFiltersBtn: $("applyFiltersBtn"),
    resetFiltersBtn: $("resetFiltersBtn"),
    activeFilters: $("activeFilters"),

    // stats
    statTotal: $("statTotal"),
    statShown: $("statShown"),

    // table
    seriesTbody: $("seriesTbody"),
    resultsHint: $("resultsHint"),
    paginationBar: $("paginationBar"),

    // editor modal
    seriesModal: $("seriesModal"),
    seriesModalTitle: $("seriesModalTitle"),
    seriesModalSub: $("seriesModalSub"),
    closeSeriesModalBtn: $("closeSeriesModalBtn"),
    cancelSeriesBtn: $("cancelSeriesBtn"),
    seriesForm: $("seriesForm"),
    formError: $("formError"),

    // form fields
    sSlug: $("sSlug"),
    sTitle: $("sTitle"),
    sDescription: $("sDescription"),
    sOrderStrategy: $("sOrderStrategy"),

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
    series: [],
    filtered: [],
    page: 1,
    pageSize: 20,
    filters: {
      search: "",
      strategy: ""
    },
    editor: {
      mode: "create", // create | edit
      id: null,
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

  function clearNode(node){ if(!node) return; while(node.firstChild) node.removeChild(node.firstChild); }

  function escapeHtml(str){
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function truncate(str, n=160){
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
    const modals = [els.seriesModal, els.confirmModal].filter(Boolean);
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
      if(els.userRoleTop) els.userRoleTop.textContent = "مدیریت سری‌ها";
      if(els.userAvatarTop){
        const initials = String(name).trim().slice(0,2).toUpperCase();
        els.userAvatarTop.textContent = initials || "AT";
      }
    }catch(_){}
  }

  function strategyLabel(v){
    if(v === "by_date") return "بر اساس تاریخ";
    return "دستی";
  }
  function strategyClass(v){
    return v === "by_date" ? "strategyTag--by_date" : "strategyTag--manual";
  }

  /* --------- Filters + Pagination --------- */
  function renderActiveFilters(){
    if(!els.activeFilters) return;
    const chips = [];
    const s = state.filters.search;
    const st = state.filters.strategy;

    if(s) chips.push(`<span class="chip"><b>جستجو:</b> ${escapeHtml(s)}</span>`);
    if(st) chips.push(`<span class="chip"><b>استراتژی:</b> ${escapeHtml(strategyLabel(st))}</span>`);

    els.activeFilters.innerHTML = chips.length ? chips.join("") : `<span class="chip chip--muted">بدون فیلتر</span>`;
  }

  function applyClientFilters(){
    const q = String(state.filters.search || "").trim().toLowerCase();
    const st = String(state.filters.strategy || "").trim();

    let list = Array.isArray(state.series) ? [...state.series] : [];

    if(q){
      list = list.filter(s=>{
        const hay = [s.slug, s.title, s.description, s.order_strategy, s.id]
          .map(x=>String(x||"").toLowerCase())
          .join(" ");
        return hay.includes(q);
      });
    }
    if(st){
      list = list.filter(s=> String(s.order_strategy || "manual") === st);
    }

    state.filtered = list;
    state.page = 1;
    render();
  }

  function renderStats(){
    if(els.statTotal) els.statTotal.textContent = nf.format(state.series.length);
    if(els.statShown) els.statShown.textContent = nf.format(state.filtered.length);
  }

  function renderTable(){
    if(!els.seriesTbody) return;

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

    clearNode(els.seriesTbody);

    if(!pageItems.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="emptyCell">سری‌ای برای نمایش وجود ندارد.</td>`;
      els.seriesTbody.appendChild(tr);
      return;
    }

    for(const s of pageItems){
      const desc = truncate(s.description || "", 180);
      const strategy = s.order_strategy || "manual";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <span class="slugMono">${escapeHtml(s.slug || "—")}</span>
            <span class="mono">#${escapeHtml(s.id)}</span>
          </div>
        </td>
        <td>${escapeHtml(s.title || "—")}</td>
        <td class="descCell" title="${escapeHtml(s.description || "")}">${escapeHtml(desc || "—")}</td>
        <td><span class="strategyTag ${strategyClass(strategy)}">${escapeHtml(strategyLabel(strategy))}</span></td>
        <td class="actions">
          <button class="btn btn--small" data-action="edit" data-id="${escapeHtml(s.id)}">ویرایش</button>
          <button class="btn btn--small btn--danger" data-action="delete" data-id="${escapeHtml(s.id)}">حذف</button>
        </td>
      `;
      els.seriesTbody.appendChild(tr);
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

  function setLoading(loading, message="در حال دریافت لیست سری‌ها..."){
    if(!els.seriesTbody) return;
    if(!loading) return;
    clearNode(els.seriesTbody);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="loadingCell">${escapeHtml(message)}</td>`;
    els.seriesTbody.appendChild(tr);
  }

  /* --------- Data --------- */
  async function loadSeries(){
    setLoading(true);
    try{
      const list = await apiFetch("/api/blog/series/");
      state.series = Array.isArray(list) ? list : (list?.results || []);
      applyClientFilters();
      toast("لیست سری‌ها به‌روزرسانی شد", "success");
    }catch(err){
      console.error(err);
      clearNode(els.seriesTbody);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="errorCell">${escapeHtml(err.message || "خطا در دریافت سری‌ها")}</td>`;
      els.seriesTbody.appendChild(tr);
      toast("خطا در دریافت سری‌ها", "danger");
    }
  }

  /* --------- Editor --------- */
  function resetSeriesForm(){
    if(els.seriesForm) els.seriesForm.reset();
    if(els.formError){
      els.formError.textContent = "";
      els.formError.classList.add("hidden");
    }
    state.editor.id = null;

    if(els.sOrderStrategy && !els.sOrderStrategy.value){
      els.sOrderStrategy.value = "manual";
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
    resetSeriesForm();

    if(els.seriesModalTitle) els.seriesModalTitle.textContent = "ساخت سری جدید";
    if(els.seriesModalSub) els.seriesModalSub.textContent = "Slug یکتا و عنوان را وارد کن، سپس ذخیره کن.";

    if(els.sOrderStrategy) els.sOrderStrategy.value = "manual";

    openModal(els.seriesModal);
    if(els.sSlug) els.sSlug.focus();
  }

  async function openEditModal(id){
    state.editor.mode = "edit";
    resetSeriesForm();

    const sid = parseInt(id, 10);
    state.editor.id = Number.isFinite(sid) ? sid : null;

    if(els.seriesModalTitle) els.seriesModalTitle.textContent = "ویرایش سری";
    if(els.seriesModalSub) els.seriesModalSub.textContent = state.editor.id ? `Series ID: #${state.editor.id}` : "—";

    openModal(els.seriesModal);

    try{
      setFormError("");
      const detail = await apiFetch(`/api/blog/series/${encodeURIComponent(state.editor.id)}/`);
      if(els.sSlug) els.sSlug.value = detail.slug || "";
      if(els.sTitle) els.sTitle.value = detail.title || "";
      if(els.sDescription) els.sDescription.value = detail.description || "";
      if(els.sOrderStrategy) els.sOrderStrategy.value = detail.order_strategy || "manual";
    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در دریافت اطلاعات سری");
    }
  }

  function gatherSeriesPayload(){
    const slug = String(els.sSlug?.value || "").trim();
    const title = String(els.sTitle?.value || "").trim();
    const description = String(els.sDescription?.value || "").trim();
    const order_strategy = String(els.sOrderStrategy?.value || "").trim() || "manual";

    const errors = [];
    if(!slug) errors.push("Slug الزامی است.");
    if(slug && !/^[-a-zA-Z0-9_]+$/.test(slug)) errors.push("Slug فقط می‌تواند شامل حروف/اعداد/خط‌تیره/underscore باشد.");
    if(!title) errors.push("Title الزامی است.");
    if(order_strategy && !["manual","by_date"].includes(order_strategy)) errors.push("Order strategy نامعتبر است.");

    const payload = { slug, title, description, order_strategy };
    return { payload, errors };
  }

  async function submitSeriesForm(ev){
    ev.preventDefault();

    const {payload, errors} = gatherSeriesPayload();
    if(errors.length){
      setFormError(errors.join(" "));
      return;
    }
    setFormError("");

    const btn = els.seriesForm?.querySelector('button[type="submit"]');
    if(btn){
      btn.disabled = true;
      btn.dataset._txt = btn.textContent;
      btn.textContent = "در حال ذخیره...";
    }

    try{
      if(state.editor.mode === "create"){
        await apiFetch("/api/blog/series/", { method:"POST", json: payload });
        toast("سری ساخته شد", "success");
      }else{
        const sid = state.editor.id;
        await apiFetch(`/api/blog/series/${encodeURIComponent(sid)}/`, { method:"PATCH", json: payload });
        toast("سری ویرایش شد", "success");
      }

      closeModal(els.seriesModal);
      await loadSeries();

    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در ذخیره سری");
      toast("خطا در ذخیره", "danger");
    }finally{
      if(btn){
        btn.disabled = false;
        btn.textContent = btn.dataset._txt || "ذخیره";
      }
    }
  }

  async function deleteSeries(id){
    const sid = parseInt(id, 10);
    if(!Number.isFinite(sid)) return;

    const ok = await confirmDialog({
      title: "حذف سری",
      message: `سری #${sid} حذف شود؟ این عملیات غیرقابل برگشت است.`,
      yesText: "حذف",
      noText: "انصراف"
    });
    if(!ok) return;

    try{
      await apiFetch(`/api/blog/series/${encodeURIComponent(sid)}/`, { method:"DELETE" });
      toast("سری حذف شد", "success");
      await loadSeries();
    }catch(err){
      console.error(err);
      toast("خطا در حذف سری", "danger");
    }
  }

  /* --------- Events --------- */
  function bindEvents(){
    if(els.newSeriesBtn) els.newSeriesBtn.addEventListener("click", openCreateModal);
    if(els.refreshSeriesBtn) els.refreshSeriesBtn.addEventListener("click", loadSeries);

    if(els.applyFiltersBtn) els.applyFiltersBtn.addEventListener("click", ()=>{
      state.filters.search = String(els.fSearch?.value || "").trim();
      state.filters.strategy = String(els.fStrategy?.value || "").trim();
      state.pageSize = parseInt(els.fPageSize?.value || "20", 10) || 20;
      applyClientFilters();
    });

    if(els.resetFiltersBtn) els.resetFiltersBtn.addEventListener("click", ()=>{
      state.filters.search = "";
      state.filters.strategy = "";
      state.pageSize = 20;
      if(els.fSearch) els.fSearch.value = "";
      if(els.fStrategy) els.fStrategy.value = "";
      if(els.fPageSize) els.fPageSize.value = "20";
      applyClientFilters();
    });

    // table actions
    if(els.seriesTbody){
      els.seriesTbody.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-action]");
        if(!btn) return;
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        if(action === "edit") openEditModal(id);
        if(action === "delete") deleteSeries(id);
      });
    }

    // editor modal close
    if(els.closeSeriesModalBtn) els.closeSeriesModalBtn.addEventListener("click", ()=>closeModal(els.seriesModal));
    if(els.cancelSeriesBtn) els.cancelSeriesBtn.addEventListener("click", ()=>closeModal(els.seriesModal));
    if(els.seriesModal){
      els.seriesModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) closeModal(els.seriesModal);
      });
    }
    if(els.seriesForm) els.seriesForm.addEventListener("submit", submitSeriesForm);

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
        if(els.confirmModal?.classList.contains("isOpen")){
          if(typeof confirmCancel === "function") confirmCancel();
          else closeModal(els.confirmModal);
        }
        if(els.seriesModal?.classList.contains("isOpen")) closeModal(els.seriesModal);
      }
    });
  }

  async function init(){
    portalModalsToBody();
    bindEvents();
    await hydrateTopUser();
    if(els.fPageSize) els.fPageSize.value = "20";
    if(els.sOrderStrategy) els.sOrderStrategy.value = "manual";
    await loadSeries();
  }

  init();
})();