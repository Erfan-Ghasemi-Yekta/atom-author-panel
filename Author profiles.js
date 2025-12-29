(function () {
  "use strict";

  if (!APP.requireAuth()) return;

  APP.setActiveNav();
  APP.attachLogout("logoutBtn");
  APP.ensureMe({ silent: true });

  const tbody = document.getElementById("authorsTbody");
  const searchEl = document.getElementById("authorSearch");
  const refreshBtn = document.getElementById("refreshBtn");
  const newBtn = document.getElementById("newAuthorBtn");

  const modal = document.getElementById("authorModal");
  const modalTitle = document.getElementById("authorModalTitle");
  const saveBtn = document.getElementById("saveAuthorBtn");

  const modeEl = document.getElementById("authorMode");
  const authorUserIdEl = document.getElementById("authorUserId");
  const displayNameEl = document.getElementById("authorDisplayName");
  const bioEl = document.getElementById("authorBio");
  const avatarEl = document.getElementById("authorAvatar");

  const userSearchInput = document.getElementById("userSearchInput");
  const userSearchBtn = document.getElementById("userSearchBtn");
  const userResults = document.getElementById("userResults");

  const pickAvatarBtn = document.getElementById("pickAvatarBtn");

  // Media Modal
  const mediaModal = document.getElementById("mediaModal");
  const mediaGrid = document.getElementById("mediaGrid");
  const mediaPrevBtn = document.getElementById("mediaPrevBtn");
  const mediaNextBtn = document.getElementById("mediaNextBtn");

  let authors = [];
  let lastMedia = null;
  let mediaPage = 1;

  function setEmpty() {
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "موردی یافت نشد.";
    td.style.color = "var(--muted)";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function render(list) {
    tbody.innerHTML = "";
    if (!list.length) return setEmpty();

    list.forEach((a) => {
      const tr = document.createElement("tr");

      const tdUser = document.createElement("td");
      tdUser.className = "mono";
      tdUser.textContent = a.user;
      tr.appendChild(tdUser);

      const tdName = document.createElement("td");
      tdName.textContent = a.display_name || "—";
      tr.appendChild(tdName);

      const tdBio = document.createElement("td");
      tdBio.className = "profile-bio";
      tdBio.textContent = a.bio || "";
      tr.appendChild(tdBio);

      const tdAvatar = document.createElement("td");
      tdAvatar.className = "mono";
      tdAvatar.textContent = a.avatar ? `#${a.avatar}` : "—";
      tr.appendChild(tdAvatar);

      const tdAct = document.createElement("td");
      const row = document.createElement("div");
      row.className = "row";

      const edit = document.createElement("button");
      edit.className = "btn small ghost";
      edit.type = "button";
      edit.textContent = "ویرایش";
      edit.addEventListener("click", () => openEdit(a));

      const del = document.createElement("button");
      del.className = "btn small danger";
      del.type = "button";
      del.textContent = "حذف";
      del.addEventListener("click", () => onDelete(a));

      row.appendChild(edit);
      row.appendChild(del);
      tdAct.appendChild(row);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
  }

  async function load() {
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "در حال دریافت...";
    td.style.color = "var(--muted)";
    tr.appendChild(td);
    tbody.appendChild(tr);

    try {
      const data = await APP.apiJson("/api/blog/authors/", { method: "GET" });
      authors = Array.isArray(data) ? data : [];
      applySearchAndRender();
    } catch (err) {
      APP.showToast(err.message || "خطا در دریافت نویسنده‌ها", "danger");
      setEmpty();
    }
  }

  function applySearchAndRender() {
    const q = (searchEl.value || "").trim().toLowerCase();
    if (!q) return render(authors);

    const filtered = authors.filter((a) => {
      const dn = (a.display_name || "").toLowerCase();
      const id = String(a.user || "");
      return dn.includes(q) || id.includes(q);
    });

    render(filtered);
  }

  function resetForm() {
    modeEl.value = "create";
    modalTitle.textContent = "پروفایل جدید";
    authorUserIdEl.value = "";
    authorUserIdEl.disabled = false;

    displayNameEl.value = "";
    bioEl.value = "";
    avatarEl.value = "";

    userSearchInput.value = "";
    userResults.innerHTML = "";
  }

  function openCreate() {
    resetForm();
    APP.openModal(modal);
  }

  function openEdit(a) {
    resetForm();
    modeEl.value = "edit";
    modalTitle.textContent = `ویرایش پروفایل User #${a.user}`;

    authorUserIdEl.value = String(a.user);
    authorUserIdEl.disabled = true; // تغییر کلید روت سخت است، بهتر است غیرفعال باشد.

    displayNameEl.value = a.display_name || "";
    bioEl.value = a.bio || "";
    avatarEl.value = a.avatar ? String(a.avatar) : "";

    APP.openModal(modal);
  }

  function buildPayload() {
    return {
      user: Number(authorUserIdEl.value),
      display_name: displayNameEl.value.trim(),
      bio: bioEl.value.trim(),
      avatar: avatarEl.value === "" ? null : Number(avatarEl.value),
    };
  }

  function validatePayload(p) {
    if (!p.user || !Number.isFinite(p.user)) return "User ID الزامی است.";
    if (!p.display_name) return "Display name الزامی است.";
    return null;
  }

  async function onSave() {
    const p = buildPayload();
    const err = validatePayload(p);
    if (err) {
      APP.showToast(err, "warning");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "در حال ذخیره...";

    try {
      if (modeEl.value === "create") {
        await APP.apiJson("/api/blog/authors/", { method: "POST", body: JSON.stringify(p) });
        APP.showToast("پروفایل ایجاد شد ✅", "success");
      } else {
        // کلید: user id
        const userId = authorUserIdEl.value;
        await APP.apiJson(`/api/blog/authors/${userId}/`, { method: "PATCH", body: JSON.stringify(p) });
        APP.showToast("پروفایل بروزرسانی شد ✅", "success");
      }

      APP.closeModal(modal);
      await load();
    } catch (e) {
      APP.showToast(e.message || "ذخیره ناموفق بود.", "danger");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "ذخیره";
    }
  }

  async function onDelete(a) {
    const ok = window.confirm(`حذف پروفایل؟\n\n${a.display_name} (User #${a.user})`);
    if (!ok) return;

    try {
      await APP.apiJson(`/api/blog/authors/${a.user}/`, { method: "DELETE" });
      APP.showToast("حذف شد.", "success");
      await load();
    } catch (e) {
      APP.showToast(e.message || "حذف ناموفق بود.", "danger");
    }
  }

  // ===== User Search =====
  async function searchUsers() {
    const q = (userSearchInput.value || "").trim();
    if (!q) {
      APP.showToast("username را وارد کنید.", "warning");
      return;
    }

    userSearchBtn.disabled = true;
    userSearchBtn.textContent = "در حال جستجو...";

    try {
      const qs = APP.toQuery({ username: q });
      const data = await APP.apiJson(`/api/users/users/${qs}`, { method: "GET" });

      userResults.innerHTML = "";
      if (!Array.isArray(data) || !data.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "نتیجه‌ای پیدا نشد";
        userResults.appendChild(opt);
        return;
      }

      data.slice(0, 50).forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.id;
        const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
        opt.textContent = full ? `${u.username} (#${u.id}) - ${full}` : `${u.username} (#${u.id})`;
        userResults.appendChild(opt);
      });

      APP.showToast("نتایج آماده است. یک مورد را انتخاب کنید.", "info");
    } catch (e) {
      APP.showToast(e.message || "جستجو ناموفق بود.", "danger");
    } finally {
      userSearchBtn.disabled = false;
      userSearchBtn.textContent = "جستجو";
    }
  }

  userResults.addEventListener("change", () => {
    const v = userResults.value;
    if (!v) return;
    authorUserIdEl.value = v;
  });

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
        avatarEl.value = String(m.id);
        APP.showToast(`Avatar انتخاب شد: ${m.id}`, "success");
        APP.closeModal(mediaModal);
      });

      mediaGrid.appendChild(card);
    });
  }

  function openMediaPicker() {
    APP.openModal(mediaModal);
    loadMedia(1);
  }

  // Events
  newBtn.addEventListener("click", openCreate);
  saveBtn.addEventListener("click", onSave);
  refreshBtn.addEventListener("click", load);
  searchEl.addEventListener("input", applySearchAndRender);

  userSearchBtn.addEventListener("click", searchUsers);
  pickAvatarBtn.addEventListener("click", openMediaPicker);

  mediaPrevBtn.addEventListener("click", () => {
    if (!lastMedia?.previous) return;
    loadMedia(Math.max(1, mediaPage - 1));
  });

  mediaNextBtn.addEventListener("click", () => {
    if (!lastMedia?.next) return;
    loadMedia(mediaPage + 1);
  });

  // Init
  load();
})();
