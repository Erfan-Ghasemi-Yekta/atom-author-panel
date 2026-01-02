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
    newTagBtn: $("newTagBtn"),
    refreshTagsBtn: $("refreshTagsBtn"),

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
    tagsTbody: $("tagsTbody"),
    resultsHint: $("resultsHint"),
    paginationBar: $("paginationBar"),

    // editor modal
    tagModal: $("tagModal"),
    tagModalTitle: $("tagModalTitle"),
    tagModalSub: $("tagModalSub"),
    closeTagModalBtn: $("closeTagModalBtn"),
    cancelTagBtn: $("cancelTagBtn"),
    tagForm: $("tagForm"),
    formError: $("formError"),

    // form fields
    tSlug: $("tSlug"),
    tName: $("tName"),
    tDescription: $("tDescription"),

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
    tags: [],
    filtered: [],
    page: 1,
    pageSize: 20,
    filters: {
      search: ""
    },
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
          // try to show readable message
          if(j && typeof j === "object"){
            const flat = Object.entries(j).map(([k,v])=>`${k}: ${Array.isArray(v)? v.join(" "): String(v)}`).join(" | ");
            message += flat ? ` — ${flat}` : ` — ${JSON.stringify(j)}`;
          }else{
            message += ` — ${JSON.stringify(j)}`;
          }
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

  function truncate(str, n=180){
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
    const modals = [els.tagModal, els.confirmModal].filter(Boolean);
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
      if(els.userRoleTop) els.userRoleTop.textContent = "مدیریت تگ‌ها";
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
    let list = Array.isArray(state.tags) ? [...state.tags] : [];

    if(q){
      list = list.filter(t=>{
        const hay = [t.slug, t.name, t.description].map(x=>String(x||"").toLowerCase()).join(" ");
        return hay.includes(q);
      });
    }

    state.filtered = list;
    state.page = 1;
    render();
  }

  function renderStats(){
    if(els.statTotal) els.statTotal.textContent = nf.format(state.tags.length);
    if(els.statShown) els.statShown.textContent = nf.format(state.filtered.length);
  }

  function renderTable(){
    if(!els.tagsTbody) return;

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

    clearNode(els.tagsTbody);

    if(!pageItems.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" class="emptyCell">تگی برای نمایش وجود ندارد.</td>`;
      els.tagsTbody.appendChild(tr);
      return;
    }

    for(const t of pageItems){
      const tr = document.createElement("tr");
      const desc = truncate(t.description || "", 220);

      tr.innerHTML = `
        <td><span class="mono">${escapeHtml(t.slug || "—")}</span></td>
        <td>${escapeHtml(t.name || "—")}</td>
        <td class="descCell" title="${escapeHtml(t.description || "")}">${escapeHtml(desc || "—")}</td>
        <td class="actions">
          <button class="btn btn--small" data-action="edit" data-id="${escapeHtml(t.id)}">ویرایش</button>
          <button class="btn btn--small btn--danger" data-action="delete" data-id="${escapeHtml(t.id)}">حذف</button>
        </td>
      `;
      els.tagsTbody.appendChild(tr);
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

  function setLoading(loading, message="در حال دریافت لیست تگ‌ها..."){
    if(!els.tagsTbody) return;
    if(!loading) return;
    clearNode(els.tagsTbody);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="loadingCell">${escapeHtml(message)}</td>`;
    els.tagsTbody.appendChild(tr);
  }

  async function loadTags(){
    setLoading(true);
    try{
      const list = await apiFetch("/api/blog/tags/");
      state.tags = Array.isArray(list) ? list : (list?.results || []);

      // sort by name to keep UI stable
      state.tags.sort((a,b)=>{
        const an = String(a?.name || "").toLowerCase();
        const bn = String(b?.name || "").toLowerCase();
        return an.localeCompare(bn);
      });

      applyClientFilters();
      toast("لیست تگ‌ها به‌روزرسانی شد", "success");
    }catch(err){
      console.error(err);
      clearNode(els.tagsTbody);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" class="errorCell">${escapeHtml(err.message || "خطا در دریافت تگ‌ها")}</td>`;
      els.tagsTbody.appendChild(tr);
      toast("خطا در دریافت تگ‌ها", "danger");
    }
  }

  /* --------- Editor --------- */
  function resetTagForm(){
    if(els.tagForm) els.tagForm.reset();
    if(els.formError){
      els.formError.textContent = "";
      els.formError.classList.add("hidden");
    }
    state.editor.id = null;
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

  function openCreateModal(){
    state.editor.mode = "create";
    resetTagForm();

    if(els.tagModalTitle) els.tagModalTitle.textContent = "ساخت تگ جدید";
    if(els.tagModalSub) els.tagModalSub.textContent = "Slug باید یکتا باشد.";

    openModal(els.tagModal);
    if(els.tSlug) els.tSlug.focus();
  }

  async function openEditModal(id){
    state.editor.mode = "edit";
    resetTagForm();

    const tid = parseInt(id, 10);
    state.editor.id = Number.isFinite(tid) ? tid : null;

    if(els.tagModalTitle) els.tagModalTitle.textContent = "ویرایش تگ";
    if(els.tagModalSub) els.tagModalSub.textContent = state.editor.id ? `Tag ID: #${state.editor.id}` : "—";

    openModal(els.tagModal);

    try{
      setFormError("");
      const detail = await apiFetch(`/api/blog/tags/${encodeURIComponent(state.editor.id)}/`);
      if(els.tSlug) els.tSlug.value = detail.slug || "";
      if(els.tName) els.tName.value = detail.name || "";
      if(els.tDescription) els.tDescription.value = detail.description || "";
    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در دریافت اطلاعات تگ");
    }
  }

  function gatherTagPayload(){
    const slug = String(els.tSlug?.value || "").trim();
    const name = String(els.tName?.value || "").trim();
    const description = String(els.tDescription?.value || "").trim();

    const errors = [];
    if(!slug) errors.push("Slug الزامی است.");
    if(!name) errors.push("Name الزامی است.");

    if(slug){
      if(slug.length > 50) errors.push("Slug حداکثر 50 کاراکتر است.");
      if(!/^[-a-zA-Z0-9_]+$/.test(slug)) errors.push("Slug فقط می‌تواند شامل حروف/عدد/خط تیره/آندرلاین باشد.");
    }
    if(name && name.length > 255) errors.push("Name حداکثر 255 کاراکتر است.");

    const payload = { slug, name };

    // Some backends may not expose description in schema but accept it.
    if(description) payload.description = description;

    return { payload, errors };
  }

  async function submitTagForm(ev){
    ev.preventDefault();

    const {payload, errors} = gatherTagPayload();
    if(errors.length){
      setFormError(errors.join(" "));
      return;
    }
    setFormError("");

    const btn = els.tagForm?.querySelector('button[type="submit"]');
    if(btn){
      btn.disabled = true;
      btn.dataset._txt = btn.textContent;
      btn.textContent = "در حال ذخیره...";
    }

    try{
      if(state.editor.mode === "create"){
        await apiFetch("/api/blog/tags/", { method:"POST", json: payload });
        toast("تگ ساخته شد", "success");
      }else{
        const tid = state.editor.id;
        await apiFetch(`/api/blog/tags/${encodeURIComponent(tid)}/`, { method:"PATCH", json: payload });
        toast("تگ ویرایش شد", "success");
      }

      closeModal(els.tagModal);
      await loadTags();

    }catch(err){
      console.error(err);
      setFormError(err.message || "خطا در ذخیره تگ");
      toast("خطا در ذخیره", "danger");
    }finally{
      if(btn){
        btn.disabled = false;
        btn.textContent = btn.dataset._txt || "ذخیره";
      }
    }
  }

  async function deleteTag(id){
    const tid = parseInt(id, 10);
    if(!Number.isFinite(tid)) return;

    const cur = state.tags.find(x => Number(x.id) === tid) || null;
    const label = cur ? (cur.name || cur.slug || `#${tid}`) : `#${tid}`;

    const ok = await confirmDialog({
      title: "حذف تگ",
      message: `تگ «${label}» حذف شود؟ این عملیات غیرقابل برگشت است.`,
      yesText: "حذف",
      noText: "انصراف"
    });
    if(!ok) return;

    try{
      await apiFetch(`/api/blog/tags/${encodeURIComponent(tid)}/`, { method:"DELETE" });
      toast("تگ حذف شد", "success");
      await loadTags();
    }catch(err){
      console.error(err);
      toast("خطا در حذف تگ", "danger");
    }
  }

  /* --------- Events --------- */
  function bindEvents(){
    if(els.newTagBtn) els.newTagBtn.addEventListener("click", openCreateModal);
    if(els.refreshTagsBtn) els.refreshTagsBtn.addEventListener("click", loadTags);

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
    if(els.tagsTbody){
      els.tagsTbody.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-action]");
        if(!btn) return;
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        if(action === "edit") openEditModal(id);
        if(action === "delete") deleteTag(id);
      });
    }

    // editor modal close
    if(els.closeTagModalBtn) els.closeTagModalBtn.addEventListener("click", ()=>closeModal(els.tagModal));
    if(els.cancelTagBtn) els.cancelTagBtn.addEventListener("click", ()=>closeModal(els.tagModal));
    if(els.tagModal){
      els.tagModal.addEventListener("click", (e)=>{
        if(e.target?.dataset?.close) closeModal(els.tagModal);
      });
    }

    if(els.tagForm) els.tagForm.addEventListener("submit", submitTagForm);

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
        if(els.tagModal?.classList.contains("isOpen")) closeModal(els.tagModal);
      }
    });
  }

  async function init(){
    portalModalsToBody();
    bindEvents();
    await hydrateTopUser();
    if(els.fPageSize) els.fPageSize.value = "20";
    await loadTags();
  }

  init();
})();
