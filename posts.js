(function () {
  "use strict";

  if (!APP.requireAuth()) return;

  APP.setActiveNav();
  APP.attachLogout("logoutBtn");
  APP.ensureMe({ silent: true });

  // ====== Elements ======
  const tbody = document.getElementById("postsTbody");
  const pageInfo = document.getElementById("pageInfo");

  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const visibilityFilter = document.getElementById("visibilityFilter");
  const statusFilter = document.getElementById("statusFilter");
  const pageSizeEl = document.getElementById("pageSize");

  const applyFiltersBtn = document.getElementById("applyFiltersBtn");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const refreshBtn = document.getElementById("refreshBtn");

  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");

  const newPostBtn = document.getElementById("newPostBtn");

  // Modal
  const postModal = document.getElementById("postModal");
  const postModalTitle = document.getElementById("postModalTitle");
  const savePostBtn = document.getElementById("savePostBtn");

  const formMode = document.getElementById("formMode");
  const originalSlug = document.getElementById("originalSlug");

  const titleEl = document.getElementById("title");
  const slugEl = document.getElementById("slug");
  const statusEl = document.getElementById("status");
  const visibilityEl = document.getElementById("visibility");
  const categoryIdEl = document.getElementById("categoryId");
  const tagIdsEl = document.getElementById("tagIds");
  const excerptEl = document.getElementById("excerpt");
  const contentEl = document.getElementById("content");
  const isHotEl = document.getElementById("isHot");
  const seriesEl = document.getElementById("series");
  const canonicalUrlEl = document.getElementById("canonicalUrl");
  const seoTitleEl = document.getElementById("seoTitle");
  const seoDescriptionEl = document.getElementById("seoDescription");
  const coverMediaIdEl = document.getElementById("coverMediaId");
  const ogImageIdEl = document.getElementById("ogImageId");
  const pickCoverBtn = document.getElementById("pickCoverBtn");
  const pickOgBtn = document.getElementById("pickOgBtn");

  // Media Modal
  const mediaModal = document.getElementById("mediaModal");
  const mediaGrid = document.getElementById("mediaGrid");
  const mediaPrevBtn = document.getElementById("mediaPrevBtn");
  const mediaNextBtn = document.getElementById("mediaNextBtn");

  // ====== State ======
  let categories = [];
  let tags = [];

  let page = 1;
  let pageSize = Number(pageSizeEl?.value || 10);

  let lastPosts = null; // {count,next,previous,results}
  let lastMedia = null; // {count,next,previous,results}
  let mediaPage = 1;
  let mediaTarget = null; // 'cover' | 'og'

  // ====== Helpers ======
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("fa-IR");
  }

  function badgeForStatus(status) {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = status || "—";
    if (status === "published") b.classList.add("primary");
    else if (status === "draft") b.classList.add("warning");
    else if (status === "archived") b.classList.add("danger");
    return b;
  }

  function badgeForVisibility(vis) {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = vis || "—";
    if (vis === "public") b.classList.add("primary");
    else if (vis === "private") b.classList.add("danger");
    else if (vis === "unlisted") b.classList.add("warning");
    return b;
  }

  function setLoadingRows() {
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "در حال دریافت اطلاعات...";
    td.style.color = "var(--muted)";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function setEmptyRows() {
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "موردی یافت نشد.";
    td.style.color = "var(--muted)";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function setPageInfo() {
    if (!pageInfo) return;
    if (!lastPosts) {
      pageInfo.textContent = "—";
      return;
    }
    const total = lastPosts.count ?? 0;
    const from = total ? (page - 1) * pageSize + 1 : 0;
    const to = Math.min(page * pageSize, total);
    pageInfo.textContent = `${from} تا ${to} از ${total} | صفحه ${page}`;
  }

  function setPagingButtons() {
    if (!lastPosts) return;
    prevPageBtn.disabled = !lastPosts.previous;
    nextPageBtn.disabled = !lastPosts.next;
  }

  function readFilters() {
    return {
      search: (searchInput?.value || "").trim(),
      category: categoryFilter?.value || "",
      visibility: visibilityFilter?.value || "",
      status: statusFilter?.value || "",
    };
  }

  function clearFilters() {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "";
    if (visibilityFilter) visibilityFilter.value = "";
    if (statusFilter) statusFilter.value = "";
  }

  // ====== API calls ======
  async function loadCategories() {
    const data = await APP.apiJson("/api/blog/categories/", { method: "GET" });
    categories = Array.isArray(data) ? data : [];
    // filter dropdown by slug
    categoryFilter.innerHTML = `<option value="">همه دسته‌بندی‌ها</option>`;
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.slug;
      opt.textContent = `${c.name} (${c.slug})`;
      categoryFilter.appendChild(opt);
    });

    // form category by id
    categoryIdEl.innerHTML = `<option value="">— انتخاب کنید —</option>`;
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.name} (#${c.id})`;
      categoryIdEl.appendChild(opt);
    });
  }

  async function loadTags() {
    const data = await APP.apiJson("/api/blog/tags/", { method: "GET" });
    tags = Array.isArray(data) ? data : [];

    tagIdsEl.innerHTML = "";
    tags.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.name} (${t.slug})`;
      tagIdsEl.appendChild(opt);
    });
  }

  async function loadPosts() {
    setLoadingRows();
    pageSize = Number(pageSizeEl?.value || 10);

    const f = readFilters();
    // طبق Swagger، status فیلتر رسمی ندارد، ولی ارسالش معمولاً مشکلی ایجاد نمی‌کند.
    const query = APP.toQuery({
      page,
      page_size: pageSize,
      search: f.search,
      category: f.category,
      visibility: f.visibility,
      status: f.status,
    });

    try {
      const data = await APP.apiJson(`/api/blog/posts/${query}`, { method: "GET" });
      lastPosts = data;

      const results = Array.isArray(data?.results) ? data.results : [];
      if (!results.length) {
        setEmptyRows();
        setPageInfo();
        setPagingButtons();
        return;
      }

      renderPosts(results, f.status);
      setPageInfo();
      setPagingButtons();
    } catch (err) {
      tbody.innerHTML = "";
      APP.showToast(err.message || "خطا در دریافت پست‌ها", "danger");
      setEmptyRows();
    }
  }

  function renderPosts(posts, statusFilterLocal) {
    tbody.innerHTML = "";

    // اگر status فیلتر از سمت API پشتیبانی نشود، اینجا لوکال فیلتر می‌کنیم.
    let list = posts;
    if (statusFilterLocal) {
      list = posts.filter((p) => (p.status || "") === statusFilterLocal);
    }

    if (!list.length) {
      setEmptyRows();
      return;
    }

    list.forEach((p) => {
      const tr = document.createElement("tr");

      // title
      const tdTitle = document.createElement("td");
      const t = document.createElement("div");
      t.className = "post-title";
      t.textContent = p.title || "—";
      const ex = document.createElement("div");
      ex.className = "two-lines";
      ex.textContent = p.excerpt || "";
      const slug = document.createElement("div");
      slug.className = "small-muted mono";
      slug.style.marginTop = "6px";
      slug.textContent = p.slug ? `/${p.slug}/` : "";
      tdTitle.appendChild(t);
      tdTitle.appendChild(ex);
      tdTitle.appendChild(slug);
      tr.appendChild(tdTitle);

      // status
      const tdStatus = document.createElement("td");
      tdStatus.appendChild(badgeForStatus(p.status));
      tr.appendChild(tdStatus);

      // visibility
      const tdVis = document.createElement("td");
      tdVis.appendChild(badgeForVisibility(p.visibility));
      tr.appendChild(tdVis);

      // category
      const tdCat = document.createElement("td");
      tdCat.textContent = p.category || "—";
      tr.appendChild(tdCat);

      // tags count
      const tdTags = document.createElement("td");
      const tagCount = Array.isArray(p.tags) ? p.tags.length : 0;
      tdTags.innerHTML = "";
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = `${tagCount} تگ`;
      tdTags.appendChild(b);
      tr.appendChild(tdTags);

      // published_at
      const tdPub = document.createElement("td");
      tdPub.textContent = fmtDate(p.published_at);
      tr.appendChild(tdPub);

      // actions
      const tdAct = document.createElement("td");
      const row = document.createElement("div");
      row.className = "row";

      const editBtn = document.createElement("button");
      editBtn.className = "btn small ghost";
      editBtn.type = "button";
      editBtn.textContent = "ویرایش";
      editBtn.addEventListener("click", () => openEditModal(p.slug));

      const pubBtn = document.createElement("button");
      pubBtn.className = "btn small secondary";
      pubBtn.type = "button";
      pubBtn.textContent = "انتشار";
      pubBtn.disabled = p.status === "published";
      pubBtn.title = "POST /api/blog/posts/{slug}/publish/";
      pubBtn.addEventListener("click", () => publishPost(p.slug));

      const delBtn = document.createElement("button");
      delBtn.className = "btn small danger";
      delBtn.type = "button";
      delBtn.textContent = "حذف";
      delBtn.addEventListener("click", () => deletePost(p.slug, p.title));

      row.appendChild(editBtn);
      row.appendChild(pubBtn);
      row.appendChild(delBtn);
      tdAct.appendChild(row);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
  }

  async function fetchPostDetail(slug) {
    return await APP.apiJson(`/api/blog/posts/${encodeURIComponent(slug)}/`, { method: "GET" });
  }

  async function createPost(payload) {
    return await APP.apiJson("/api/blog/posts/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function patchPost(slug, payload) {
    return await APP.apiJson(`/api/blog/posts/${encodeURIComponent(slug)}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async function deletePost(slug, title) {
    if (!slug) return;
    const ok = window.confirm(`حذف شود؟\n\n${title || slug}`);
    if (!ok) return;

    try {
      await APP.apiJson(`/api/blog/posts/${encodeURIComponent(slug)}/`, { method: "DELETE" });
      APP.showToast("پست حذف شد.", "success");
      await loadPosts();
    } catch (err) {
      APP.showToast(err.message || "حذف ناموفق بود.", "danger");
    }
  }

  async function publishPost(slug) {
    if (!slug) return;
    const ok = window.confirm("پست منتشر شود؟");
    if (!ok) return;

    try {
      await APP.apiJson(`/api/blog/posts/${encodeURIComponent(slug)}/publish/`, { method: "POST" });
      APP.showToast("پست منتشر شد.", "success");
      await loadPosts();
    } catch (err) {
      APP.showToast(err.message || "انتشار ناموفق بود.", "danger");
    }
  }

  // ====== Modal logic ======
  function resetForm() {
    formMode.value = "create";
    originalSlug.value = "";

    titleEl.value = "";
    slugEl.value = "";
    statusEl.value = "draft";
    visibilityEl.value = "public";
    excerptEl.value = "";
    contentEl.value = "";
    isHotEl.checked = false;
    seriesEl.value = "";
    canonicalUrlEl.value = "";
    seoTitleEl.value = "";
    seoDescriptionEl.value = "";
    coverMediaIdEl.value = "";
    ogImageIdEl.value = "";

    // select first category empty
    categoryIdEl.value = "";
    // tags
    Array.from(tagIdsEl.options).forEach((o) => (o.selected = false));
  }

  function openCreateModal() {
    resetForm();
    postModalTitle.textContent = "پست جدید";
    APP.openModal(postModal);
  }

  async function openEditModal(slug) {
    if (!slug) return;

    resetForm();
    formMode.value = "edit";
    originalSlug.value = slug;

    postModalTitle.textContent = `ویرایش پست: ${slug}`;
    APP.openModal(postModal);

    savePostBtn.disabled = true;
    savePostBtn.textContent = "در حال دریافت...";

    try {
      const data = await fetchPostDetail(slug);

      titleEl.value = data.title || "";
      slugEl.value = data.slug || slug;
      statusEl.value = data.status || "draft";
      visibilityEl.value = data.visibility || "public";
      excerptEl.value = data.excerpt || "";
      contentEl.value = data.content || "";

      isHotEl.checked = Boolean(data.is_hot);
      seriesEl.value = data.series ?? "";
      canonicalUrlEl.value = data.canonical_url ?? "";
      seoTitleEl.value = data.seo_title ?? "";
      seoDescriptionEl.value = data.seo_description ?? "";

      // cover/og ids
      if (data.cover_media && typeof data.cover_media === "object") {
        coverMediaIdEl.value = data.cover_media.id ?? "";
      }
      if (data.og_image && typeof data.og_image === "object") {
        ogImageIdEl.value = data.og_image.id ?? "";
      }

      // tags -> ids
      const ids = Array.isArray(data.tags) ? data.tags.map((t) => t.id).filter(Boolean) : [];
      Array.from(tagIdsEl.options).forEach((o) => {
        o.selected = ids.includes(Number(o.value));
      });

      // category: swagger می‌گوید string؛ بعضی بک‌اندها object می‌دهند.
      let catId = "";
      if (data.category && typeof data.category === "object" && data.category.id) {
        catId = String(data.category.id);
      } else if (typeof data.category === "string") {
        // تلاش برای match کردن category با slug یا name
        const found =
          categories.find((c) => c.slug === data.category) ||
          categories.find((c) => c.name === data.category);
        if (found) catId = String(found.id);
      }
      if (catId) categoryIdEl.value = catId;
    } catch (err) {
      APP.showToast(err.message || "خطا در دریافت جزئیات پست", "danger");
    } finally {
      savePostBtn.disabled = false;
      savePostBtn.textContent = "ذخیره";
    }
  }

  function buildPayload() {
    const title = titleEl.value.trim();
    const excerpt = excerptEl.value.trim();
    const content = contentEl.value.trim();
    const status = statusEl.value;
    const visibility = visibilityEl.value;

    const category_id = Number(categoryIdEl.value);
    const tag_ids = Array.from(tagIdsEl.selectedOptions).map((o) => Number(o.value)).filter((n) => Number.isFinite(n));

    const payload = {
      title,
      excerpt,
      content,
      status,
      visibility,
      is_hot: Boolean(isHotEl.checked),

      category_id,
      tag_ids,

      series: seriesEl.value === "" ? null : Number(seriesEl.value),

      canonical_url: canonicalUrlEl.value.trim() === "" ? null : canonicalUrlEl.value.trim(),
      seo_title: seoTitleEl.value.trim(),
      seo_description: seoDescriptionEl.value.trim(),

      cover_media_id: coverMediaIdEl.value === "" ? null : Number(coverMediaIdEl.value),
      og_image_id: ogImageIdEl.value === "" ? null : Number(ogImageIdEl.value),
    };

    const slug = slugEl.value.trim();
    if (slug) payload.slug = slug;

    return payload;
  }

  function validatePayload(payload) {
    if (!payload.title) return "عنوان الزامی است.";
    if (!payload.excerpt) return "خلاصه الزامی است.";
    if (!payload.content) return "محتوا الزامی است.";
    if (!payload.category_id || !Number.isFinite(payload.category_id)) return "دسته‌بندی الزامی است.";
    return null;
  }

  async function onSave() {
    const mode = formMode.value;
    const slug0 = originalSlug.value;

    const payload = buildPayload();
    const errMsg = validatePayload(payload);
    if (errMsg) {
      APP.showToast(errMsg, "warning");
      return;
    }

    savePostBtn.disabled = true;
    savePostBtn.textContent = "در حال ذخیره...";

    try {
      if (mode === "create") {
        await createPost(payload);
        APP.showToast("پست ایجاد شد ✅", "success");
      } else {
        await patchPost(slug0, payload);
        APP.showToast("پست بروزرسانی شد ✅", "success");
      }

      APP.closeModal(postModal);
      await loadPosts();
    } catch (err) {
      APP.showToast(err.message || "ذخیره ناموفق بود.", "danger");
    } finally {
      savePostBtn.disabled = false;
      savePostBtn.textContent = "ذخیره";
    }
  }

  // ===== Media Picker =====
  async function loadMedia(pageNum) {
    mediaPage = pageNum;
    mediaGrid.innerHTML = "";
    const q = APP.toQuery({ page: mediaPage, page_size: 12 });

    try {
      const data = await APP.apiJson(`/api/blog/media/${q}`, { method: "GET" });
      lastMedia = data;
      renderMedia(data?.results || []);
      mediaPrevBtn.disabled = !data.previous;
      mediaNextBtn.disabled = !data.next;
    } catch (err) {
      APP.showToast(err.message || "خطا در دریافت رسانه‌ها", "danger");
    }
  }

  function renderMedia(items) {
    mediaGrid.innerHTML = "";
    if (!Array.isArray(items) || !items.length) {
      const div = document.createElement("div");
      div.className = "col-12 small-muted";
      div.textContent = "موردی یافت نشد.";
      mediaGrid.appendChild(div);
      return;
    }

    items.forEach((m) => {
      const card = document.createElement("div");
      card.className = "card card--flat col-3";
      card.style.cursor = "pointer";
      card.style.overflow = "hidden";

      const body = document.createElement("div");
      body.className = "card__body";
      body.style.padding = "10px";

      // Preview
      if (m && m.url && typeof m.url === "string" && (m.mime || "").startsWith("image/")) {
        const img = document.createElement("img");
        img.src = m.url;
        img.alt = m.alt_text || m.title || `media-${m.id}`;
        img.style.width = "100%";
        img.style.height = "120px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "10px";
        img.style.marginBottom = "8px";
        body.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.style.width = "100%";
        ph.style.height = "120px";
        ph.style.borderRadius = "10px";
        ph.style.border = "1px dashed var(--border)";
        ph.style.display = "flex";
        ph.style.alignItems = "center";
        ph.style.justifyContent = "center";
        ph.style.color = "var(--muted)";
        ph.style.marginBottom = "8px";
        ph.textContent = "Preview";
        body.appendChild(ph);
      }

      const line1 = document.createElement("div");
      line1.className = "mono";
      line1.style.fontSize = "12px";
      line1.textContent = `#${m.id} • ${m.type || "media"}`;

      const line2 = document.createElement("div");
      line2.className = "small-muted";
      line2.style.marginTop = "4px";
      line2.textContent = (m.title || m.alt_text || "").slice(0, 60);

      body.appendChild(line1);
      body.appendChild(line2);

      card.appendChild(body);

      card.addEventListener("click", () => {
        if (!m || !m.id) return;
        if (mediaTarget === "cover") coverMediaIdEl.value = String(m.id);
        if (mediaTarget === "og") ogImageIdEl.value = String(m.id);
        APP.showToast(`Media ID انتخاب شد: ${m.id}`, "success");
        APP.closeModal(mediaModal);
      });

      mediaGrid.appendChild(card);
    });
  }

  function openMediaPicker(target) {
    mediaTarget = target;
    APP.openModal(mediaModal);
    loadMedia(1);
  }

  // ===== Events =====
  newPostBtn.addEventListener("click", openCreateModal);
  savePostBtn.addEventListener("click", onSave);

  applyFiltersBtn.addEventListener("click", () => {
    page = 1;
    loadPosts();
  });

  clearFiltersBtn.addEventListener("click", () => {
    clearFilters();
    page = 1;
    loadPosts();
  });

  refreshBtn.addEventListener("click", () => loadPosts());

  prevPageBtn.addEventListener("click", () => {
    if (!lastPosts?.previous) return;
    page = Math.max(1, page - 1);
    loadPosts();
  });

  nextPageBtn.addEventListener("click", () => {
    if (!lastPosts?.next) return;
    page = page + 1;
    loadPosts();
  });

  pageSizeEl.addEventListener("change", () => {
    page = 1;
    loadPosts();
  });

  pickCoverBtn.addEventListener("click", () => openMediaPicker("cover"));
  pickOgBtn.addEventListener("click", () => openMediaPicker("og"));

  mediaPrevBtn.addEventListener("click", () => {
    if (!lastMedia?.previous) return;
    loadMedia(Math.max(1, mediaPage - 1));
  });

  mediaNextBtn.addEventListener("click", () => {
    if (!lastMedia?.next) return;
    loadMedia(mediaPage + 1);
  });

  // ===== Init =====
  (async function init() {
    try {
      await loadCategories();
      await loadTags();
      await loadPosts();
    } catch (err) {
      APP.showToast(err.message || "خطا در بارگذاری اولیه", "danger");
    }
  })();
})();
