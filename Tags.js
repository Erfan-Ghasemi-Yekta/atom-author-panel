(function () {
  "use strict";

  if (!APP.requireAuth()) return;

  APP.setActiveNav();
  APP.attachLogout("logoutBtn");
  APP.ensureMe({ silent: true });

  const tbody = document.getElementById("tagsTbody");
  const searchEl = document.getElementById("tagSearch");
  const refreshBtn = document.getElementById("refreshBtn");
  const newBtn = document.getElementById("newTagBtn");

  const modal = document.getElementById("tagModal");
  const modalTitle = document.getElementById("tagModalTitle");
  const saveBtn = document.getElementById("saveTagBtn");

  const modeEl = document.getElementById("tagMode");
  const idHidden = document.getElementById("tagIdHidden");

  const nameEl = document.getElementById("tagName");
  const slugEl = document.getElementById("tagSlug");

  let tags = [];

  function setEmpty() {
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "موردی یافت نشد.";
    td.style.color = "var(--muted)";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function render(list) {
    tbody.innerHTML = "";
    if (!list.length) return setEmpty();

    list.forEach((t) => {
      const tr = document.createElement("tr");

      const tdId = document.createElement("td");
      tdId.className = "mono";
      tdId.textContent = t.id;
      tr.appendChild(tdId);

      const tdName = document.createElement("td");
      tdName.textContent = t.name || "—";
      tr.appendChild(tdName);

      const tdSlug = document.createElement("td");
      tdSlug.className = "mono";
      tdSlug.textContent = t.slug || "—";
      tr.appendChild(tdSlug);

      const tdAct = document.createElement("td");
      const row = document.createElement("div");
      row.className = "row";

      const edit = document.createElement("button");
      edit.className = "btn small ghost";
      edit.type = "button";
      edit.textContent = "ویرایش";
      edit.addEventListener("click", () => openEdit(t));

      const del = document.createElement("button");
      del.className = "btn small danger";
      del.type = "button";
      del.textContent = "حذف";
      del.addEventListener("click", () => onDelete(t));

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
    td.colSpan = 4;
    td.textContent = "در حال دریافت...";
    td.style.color = "var(--muted)";
    tr.appendChild(td);
    tbody.appendChild(tr);

    try {
      const data = await APP.apiJson("/api/blog/tags/", { method: "GET" });
      tags = Array.isArray(data) ? data : [];
      applySearchAndRender();
    } catch (err) {
      APP.showToast(err.message || "خطا در دریافت تگ‌ها", "danger");
      setEmpty();
    }
  }

  function applySearchAndRender() {
    const q = (searchEl.value || "").trim().toLowerCase();
    if (!q) return render(tags);

    const filtered = tags.filter((t) => {
      const name = (t.name || "").toLowerCase();
      const slug = (t.slug || "").toLowerCase();
      const id = String(t.id || "");
      return name.includes(q) || slug.includes(q) || id.includes(q);
    });

    render(filtered);
  }

  function resetForm() {
    modeEl.value = "create";
    idHidden.value = "";
    nameEl.value = "";
    slugEl.value = "";
  }

  function openCreate() {
    resetForm();
    modalTitle.textContent = "تگ جدید";
    APP.openModal(modal);
  }

  function openEdit(tag) {
    resetForm();
    modeEl.value = "edit";
    idHidden.value = String(tag.id);
    nameEl.value = tag.name || "";
    slugEl.value = tag.slug || "";
    modalTitle.textContent = `ویرایش تگ #${tag.id}`;
    APP.openModal(modal);
  }

  function buildPayload() {
    return {
      name: nameEl.value.trim(),
      slug: slugEl.value.trim(),
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
        await APP.apiJson("/api/blog/tags/", { method: "POST", body: JSON.stringify(p) });
        APP.showToast("تگ ایجاد شد ✅", "success");
      } else {
        const id = idHidden.value;
        await APP.apiJson(`/api/blog/tags/${id}/`, { method: "PATCH", body: JSON.stringify(p) });
        APP.showToast("تگ بروزرسانی شد ✅", "success");
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

  async function onDelete(tag) {
    const ok = window.confirm(`حذف شود؟\n\n${tag.name} (#${tag.id})`);
    if (!ok) return;

    try {
      await APP.apiJson(`/api/blog/tags/${tag.id}/`, { method: "DELETE" });
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
