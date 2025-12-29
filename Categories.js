(function () {
  "use strict";

  if (!APP.requireAuth()) return;

  APP.setActiveNav();
  APP.attachLogout("logoutBtn");
  APP.ensureMe({ silent: true });

  const tbody = document.getElementById("categoriesTbody");
  const searchEl = document.getElementById("categorySearch");
  const refreshBtn = document.getElementById("refreshBtn");
  const newBtn = document.getElementById("newCategoryBtn");

  const modal = document.getElementById("categoryModal");
  const modalTitle = document.getElementById("categoryModalTitle");
  const saveBtn = document.getElementById("saveCategoryBtn");

  const modeEl = document.getElementById("categoryMode");
  const idHidden = document.getElementById("categoryIdHidden");

  const nameEl = document.getElementById("categoryName");
  const slugEl = document.getElementById("categorySlug");
  const parentEl = document.getElementById("categoryParent");

  let categories = [];

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

    list.forEach((c) => {
      const tr = document.createElement("tr");

      const tdId = document.createElement("td");
      tdId.className = "mono";
      tdId.textContent = c.id;
      tr.appendChild(tdId);

      const tdName = document.createElement("td");
      tdName.textContent = c.name || "—";
      tr.appendChild(tdName);

      const tdSlug = document.createElement("td");
      tdSlug.className = "mono";
      tdSlug.textContent = c.slug || "—";
      tr.appendChild(tdSlug);

      const tdParent = document.createElement("td");
      tdParent.className = "mono";
      tdParent.textContent = c.parent ? `#${c.parent}` : "—";
      tr.appendChild(tdParent);

      const tdAct = document.createElement("td");
      const row = document.createElement("div");
      row.className = "row";

      const edit = document.createElement("button");
      edit.className = "btn small ghost";
      edit.type = "button";
      edit.textContent = "ویرایش";
      edit.addEventListener("click", () => openEdit(c));

      const del = document.createElement("button");
      del.className = "btn small danger";
      del.type = "button";
      del.textContent = "حذف";
      del.addEventListener("click", () => onDelete(c));

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
      const data = await APP.apiJson("/api/blog/categories/", { method: "GET" });
      categories = Array.isArray(data) ? data : [];
      applySearchAndRender();
      fillParentOptions();
    } catch (err) {
      APP.showToast(err.message || "خطا در دریافت دسته‌بندی‌ها", "danger");
      setEmpty();
    }
  }

  function applySearchAndRender() {
    const q = (searchEl.value || "").trim().toLowerCase();
    if (!q) return render(categories);

    const filtered = categories.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const slug = (c.slug || "").toLowerCase();
      const id = String(c.id || "");
      return name.includes(q) || slug.includes(q) || id.includes(q);
    });

    render(filtered);
  }

  function fillParentOptions(excludeId) {
    parentEl.innerHTML = `<option value="">بدون والد</option>`;
    categories.forEach((c) => {
      if (excludeId && c.id === excludeId) return;
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.name} (#${c.id})`;
      parentEl.appendChild(opt);
    });
  }

  function resetForm() {
    modeEl.value = "create";
    idHidden.value = "";
    nameEl.value = "";
    slugEl.value = "";
    parentEl.value = "";
    fillParentOptions();
  }

  function openCreate() {
    resetForm();
    modalTitle.textContent = "دسته‌بندی جدید";
    APP.openModal(modal);
  }

  function openEdit(cat) {
    resetForm();
    modeEl.value = "edit";
    idHidden.value = String(cat.id);

    nameEl.value = cat.name || "";
    slugEl.value = cat.slug || "";
    fillParentOptions(cat.id);
    parentEl.value = cat.parent ? String(cat.parent) : "";

    modalTitle.textContent = `ویرایش دسته‌بندی #${cat.id}`;
    APP.openModal(modal);
  }

  function buildPayload() {
    return {
      name: nameEl.value.trim(),
      slug: slugEl.value.trim(),
      parent: parentEl.value === "" ? null : Number(parentEl.value),
    };
  }

  function validatePayload(p) {
    if (!p.name) return "نام الزامی است.";
    if (!p.slug) return "اسلاگ الزامی است.";
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
        await APP.apiJson("/api/blog/categories/", {
          method: "POST",
          body: JSON.stringify(p),
        });
        APP.showToast("دسته‌بندی ایجاد شد ✅", "success");
      } else {
        const id = idHidden.value;
        await APP.apiJson(`/api/blog/categories/${id}/`, {
          method: "PATCH",
          body: JSON.stringify(p),
        });
        APP.showToast("دسته‌بندی بروزرسانی شد ✅", "success");
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

  async function onDelete(cat) {
    const ok = window.confirm(`حذف شود؟\n\n${cat.name} (#${cat.id})`);
    if (!ok) return;

    try {
      await APP.apiJson(`/api/blog/categories/${cat.id}/`, { method: "DELETE" });
      APP.showToast("حذف شد.", "success");
      await load();
    } catch (e) {
      APP.showToast(e.message || "حذف ناموفق بود.", "danger");
    }
  }

  // Events
  newBtn.addEventListener("click", openCreate);
  saveBtn.addEventListener("click", onSave);
  refreshBtn.addEventListener("click", load);
  searchEl.addEventListener("input", applySearchAndRender);

  // Init
  load();
})();
