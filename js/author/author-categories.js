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
    newCategoryBtn: $("newCategoryBtn"),
    refreshCategoriesBtn: $("refreshCategoriesBtn"),

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
    categoriesTbody: $("categoriesTbody"),
    resultsHint: $("resultsHint"),
    paginationBar: $("paginationBar"),

    // editor modal
    categoryModal: $("categoryModal"),
    categoryModalTitle: $("categoryModalTitle"),
    categoryModalSub: $("categoryModalSub"),
    closeCategoryModalBtn: $("closeCategoryModalBtn"),
    cancelCategoryBtn: $("cancelCategoryBtn"),
    categoryForm: $("categoryForm"),
    formError: $("formError"),

    // form fields
    cName: $("cName"),
    cSlug: $("cSlug"),
    cParent: $("cParent"),
    cDescription: $("cDescription"),
    cOrder: $("cOrder"),

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
    categories: [],
    filtered: [],
    page: 1,
    pageSize: 20,
    filters: { search: "" },
    catMap: new Map(), // id -> category
    editor: {
      mode: "create", // create | edit
      id: null,
      slugTouched: false,
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
    const modals = [els.categoryModal, els.confirmModal].filter(Boolean);
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
      if(els.userRoleTop) els.userRoleTop.textContent = "مدیریت دسته‌بندی‌ها";
      if(els.userAvatarTop){
        const initials = String(name).trim().slice(0,2).toUpperCase();
        els.userAvatarTop.textContent = initials || "AT";
      }
    }catch(_){}
  }

  function getId(c){ return Number(c?.id); }
  function getParentId(c){
    const p = c?.parent;
    if(p === null || p === undefined || p === "") return null;
    if(typeof p === "number") return p;
    if(typeof p === "string" && p.trim()) return parseInt(p, 10);
    if(typeof p === "object" && p?.id) return Number(p.id);
    return null;
  }

  function buildCatMap(){
    state.catMap = new Map();
    for(const c of state.categories){
      const id = getId(c);
      if(Number.isFinite(id)) state.catMap.set(id, c);
    }
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
    let list = Array.isArray(state.categories) ? [...state.categories] : [];

    // sort by order then name (stable-ish)
    list.sort((a,b)=>{
      const ao = (a?.order === null || a?.order === undefined || a?.order === "") ? 1e9 : Number(a.order);
      const bo = (b?.order === null || b?.order === undefined || b?.order === "") ? 1e9 : Number(b.order);
      if(ao !== bo) return ao - bo;
      return String(a?.name || "").localeCompare(String(b?.name || ""), "fa");
    });

    if(q){
      list = list.filter(c=>{
        const pid = getParentId(c);
        const parent = pid ? state.catMap.get(pid) : null;
        const hay = [
          c?.id,
          c?.name,
          c?.slug,
          c?.description,
          c?.order,
          parent?.name,
          parent?.slug
        ].map(x=>String(x||"").toLowerCase()).join(" ");
        return hay.includes(q) || (`#${c?.id}`.toLowerCase().includes(q));
      });
    }

    state.filtered = list;
    state.page = 1;
    render();
  }

  function renderStats(){
    if(els.statTotal) els.statTotal.textContent = nf.format(state.categories.length);
    if(els.statShown) els.statShown.textContent = nf.format(state.filtered.length);
  }

  function renderTable(){
    if(!els.categoriesTbody) return;

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

    clearNode(els.categoriesTbody);

    if(!pageItems.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" class="emptyCell">دسته‌بندی‌ای برای نمایش وجود ندارد.</td>`;
      els.categoriesTbody.appendChild(tr);
      return;
    }

    for(const c of pageItems){
      const id = getId(c);
      const pid = getParentId(c);
      const parent = pid ? state.catMap.get(pid) : null;

      const descText = truncate(c?.description || "", 160);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="nameCell">
            <b>${escapeHtml(c?.name || "—")}</b>
            <div class="sub">
              ${Number.isFinite(id) ? `<span class="mono">#${escapeHtml(id)}</span>` : `<span class="muted">—</span>`}
              ${c?.slug ? `<span class="muted">/${escapeHtml(c.slug)}/</span>` : ``}
            </div>
          </div>
        </td>
        <td>${c?.slug ? `<span class="mono">${escapeHtml(c.slug)}</span>` : `<span class="muted">—</span>`}</td>
        <td>
          ${parent ? `${escapeHtml(parent.name || "—")} <span class="mono">#${escapeHtml(getId(parent))}</span>` : `<span class="muted">—</span>`}
        </td>
        <td>${(c?.order !== undefined && c?.order !== null && c?.order !== "") ? `<span class="mono">${escapeHtml(c.order)}</span>` : `<span class="muted">—</span>`}</td>
        <td class="descCell" title="${escapeHtml(c?.description || "")}">${escapeHtml(descText || "—")}</td>
        <td class="actions">
          <button class="btn btn--small" data-action="edit" data-id="${escapeHtml(id)}">ویرایش</button>
          <button class="btn btn--small btn--danger" data-action="delete" data-id="${escapeHtml(id)}">حذف</button>
        </td>
      `;
      els.categoriesTbody.appendChild(tr);
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

  function setLoading(loading, message="در حال دریافت لیست دسته‌بندی‌ها..."){
    if(!els.categoriesTbody) return;
    if(!loading) return;
    clearNode(els.categoriesTbody);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="loadingCell">${escapeHtml(message)}</td>`;
    els.categoriesTbody.appendChild(tr);
  }

  async function loadCategories(){
    setLoading(true);
    try{
      const data = await apiFetch("/api/blog/categories/");
      const {items} = normalizeList(data);
      state.categories = items || [];
      buildCatMap();
      applyClientFilters();
      toast("لیست دسته‌بندی‌ها به‌روزرسانی شد", "success");
    }catch(err){
      console.error(err);
      clearNode(els.categoriesTbody);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" class="errorCell">${escapeHtml(err.message || "خطا در دریافت دسته‌بندی‌ها")}</td>`;
      els.categoriesTbody.appendChild(tr);
      toast("خطا در دریافت دسته‌بندی‌ها", "danger");
    }
  }

  /* --------- Editor --------- */
  function resetCategoryForm(){
    if(els.categoryForm) els.categoryForm.reset();
    if(els.formError){
      els.formError.textContent = "";
      els.formError.classList.add("hidden");
    }
    state.editor.id = null;
    state.editor.slugTouched = false;
    fillParentOptions(null);
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

  function fillParentOptions(excludeId){
    if(!els.cParent) return;
    const ex = Number(excludeId);
    const opts = [];

    opts.push(`<option value="">— بدون Parent (ریشه) —</option>`);

    const list = Array.isArray(state.categories) ? [...state.categories] : [];
    list.sort((a,b)=>String(a?.name||"").localeCompare(String(b?.name||""), "fa"));

    for(const c of list){
      const id = getId(c);
      if(!Number.isFinite(id)) continue;
      if(Number.isFinite(ex) && id === ex) continue;
      opts.push(`<option value="${escapeHtml(id)}">${escapeHtml(c?.name || "—")} (#${escapeHtml(id)})</option>`);
    }

    els.cParent.innerHTML = opts.join("");
  }

  function openCreateModal(){
    state.editor.mode = "create";
    resetCategoryForm();

    if(els.categoryModalTitle) els.categoryModalTitle.textContent = "ساخت دسته‌بندی جدید";
    if(els.categoryModalSub) els.categoryModalSub.textContent = "اطلاعات دسته‌بندی را وارد کن.";

    openModal(els.categoryModal);
  }

  async function openEditModal(id){
    state.editor.mode = "edit";
    resetCategoryForm();

    const cid = parseInt(String(id), 10);
    state.editor.id = Number.isFinite(cid) ? cid : null;

    if(els.categoryModalTitle) els.categoryModalTitle.textContent = "ویرایش دسته‌بندی";
    if(els.categoryModalSub) els.categoryModalSub.textContent = state.editor.id ? `Category ID: #${state.editor.id}` : "—";

    fillParentOptions(state.editor.id);

    openModal(els.categoryModal);

    try{
      setFormError("");
      const detail = await apiFetch(`/api/blog/categories/${encodeURIComponent(state.editor.id)}/`);

      if(els.cName) els.cName.value = detail?.name || "";
      if(els.cSlug) els.cSlug.value = detail?.slug || "";
      if(els.cDescription) els.cDescription.value = detail?.description || "";
      if(els.cOrder) els.cOrder.value = (detail?.order !== undefined && detail?.order !== null) ? String(detail.order) : "";

      const pid = getParentId(detail);
      if(els.cParent){
        els.cParent.value = (pid !== null && pid !== undefined) ? String(pid) : "";
      }

    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در دریافت اطلاعات دسته‌بندی");
    }
  }

  function slugify(str){
    const s = String(str || "").trim().toLowerCase();
    if(!s) return "";
    // keep latin letters, digits, spaces and hyphen
    const cleaned = s
      .replace(/[_]+/g, "-")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned;
  }

  function gatherCategoryPayload(){
    const name = String(els.cName?.value || "").trim();
    let slug = String(els.cSlug?.value || "").trim();

    const parentRaw = String(els.cParent?.value || "").trim();
    const parent = parentRaw ? parseInt(parentRaw, 10) : null;

    const description = String(els.cDescription?.value || "").trim();

    const orderRaw = String(els.cOrder?.value || "").trim();
    const order = orderRaw ? parseInt(orderRaw, 10) : null;

    const errors = [];
    if(!name) errors.push("Name الزامی است.");
    if(!slug){
      // if user didn't type slug, try auto from name
      const auto = slugify(name);
      if(auto){
        slug = auto;
        if(els.cSlug) els.cSlug.value = auto;
      }else{
        errors.push("Slug الزامی است.");
      }
    }

    if(orderRaw && !Number.isFinite(order)) errors.push("Order باید یک عدد معتبر باشد.");
    if(parentRaw && !Number.isFinite(parent)) errors.push("Parent باید یک گزینه معتبر باشد.");

    const payload = { name, slug, description: description || "" };

    // Parent: empty => null
    payload.parent = Number.isFinite(parent) ? parent : null;

    // Order: if user set it, send it; otherwise only default on create
    if(orderRaw){
      payload.order = order;
    }else if(state.editor.mode === "create"){
      payload.order = 0;
    }

    return { payload, errors };
  }

  async function submitCategoryForm(ev){
    ev.preventDefault();

    const {payload, errors} = gatherCategoryPayload();
    if(errors.length){
      setFormError(errors.join(" "));
      return;
    }
    setFormError("");

    const btn = els.categoryForm?.querySelector('button[type="submit"]');
    if(btn){
      btn.disabled = true;
      btn.dataset._txt = btn.textContent;
      btn.textContent = "در حال ذخیره...";
    }

    try{
      if(state.editor.mode === "create"){
        await apiFetch("/api/blog/categories/", { method:"POST", json: payload });
        toast("دسته‌بندی ساخته شد", "success");
      }else{
        const id = state.editor.id;
        await apiFetch(`/api/blog/categories/${encodeURIComponent(id)}/`, { method:"PATCH", json: payload });
        toast("دسته‌بندی ویرایش شد", "success");
      }

      closeModal(els.categoryModal);
      await loadCategories();

    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در ذخیره دسته‌بندی");
      toast("خطا در ذخیره", "danger");
    }finally{
      if(btn){
        btn.disabled = false;
        btn.textContent = btn.dataset._txt || "ذخیره";
      }
    }
  }

  async function deleteCategory(id){
    const cid = parseInt(String(id), 10);
    if(!Number.isFinite(cid)) return;

    const c = state.catMap.get(cid);
    const label = c?.name ? `«${c.name}»` : `#${cid}`;

    const ok = await confirmDialog({
      title: "حذف دسته‌بندی",
      message: `دسته‌بندی ${label} حذف شود؟ این عملیات غیرقابل برگشت است.`,
      yesText: "حذف",
      noText: "انصراف"
    });
    if(!ok) return;

    try{
      await apiFetch(`/api/blog/categories/${encodeURIComponent(cid)}/`, { method:"DELETE" });
      toast("دسته‌بندی حذف شد", "success");
      await loadCategories();
    }catch(err){
      console.error(err);
      toast("خطا در حذف دسته‌بندی", "danger");
    }
  }

  /* --------- Events --------- */
  function bindEvents(){
    if(els.newCategoryBtn) els.newCategoryBtn.addEventListener("click", openCreateModal);
    if(els.refreshCategoriesBtn) els.refreshCategoriesBtn.addEventListener("click", loadCategories);

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
    if(els.categoriesTbody){
      els.categoriesTbody.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-action]");
        if(!btn) return;
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        if(action === "edit") openEditModal(id);
        if(action === "delete") deleteCategory(id);
      });
    }

    // modal close
    if(els.closeCategoryModalBtn) els.closeCategoryModalBtn.addEventListener("click", ()=>closeModal(els.categoryModal));
    if(els.cancelCategoryBtn) els.cancelCategoryBtn.addEventListener("click", ()=>closeModal(els.categoryModal));
    if(els.categoryModal){
      els.categoryModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) closeModal(els.categoryModal);
      });
    }

    if(els.categoryForm) els.categoryForm.addEventListener("submit", submitCategoryForm);

    // Auto-slug (only if user hasn't touched slug input)
    if(els.cSlug){
      els.cSlug.addEventListener("input", ()=>{
        state.editor.slugTouched = true;
      });
    }
    if(els.cName){
      els.cName.addEventListener("input", ()=>{
        if(state.editor.mode !== "create") return;
        if(state.editor.slugTouched) return;
        const s = slugify(els.cName.value);
        if(s && els.cSlug) els.cSlug.value = s;
      });
    }

    // confirm modal close on backdrop click
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
        if(els.categoryModal?.classList.contains("isOpen")) closeModal(els.categoryModal);
      }
    });
  }

  async function init(){
    portalModalsToBody();
    bindEvents();
    await hydrateTopUser();
    if(els.fPageSize) els.fPageSize.value = "20";
    await loadCategories();
  }

  init();
})();
