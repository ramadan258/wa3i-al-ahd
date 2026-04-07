// ---------------------------
// Quran (3 pages/day)
// ---------------------------
function getOrInitQuranStartDate(today) {
  const startDateRaw = new Date(CONFIG.QURAN.START_DATE_ISO);
  if (!Number.isNaN(startDateRaw.getTime())) {
    return new Date(startDateRaw.getFullYear(), startDateRaw.getMonth(), startDateRaw.getDate());
  }

  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function computeDailyQuranPages(today) {
  const total = CONFIG.QURAN.TOTAL_PAGES;
  const perDay = CONFIG.QURAN.PAGES_PER_DAY;

  const startDate = getOrInitQuranStartDate(today);
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const rawDiffDays = Math.floor((todayLocal.getTime() - startDate.getTime()) / 86400000);
  const diffDays = Math.max(0, rawDiffDays);
  const cycleLength = Math.max(1, Math.ceil(total / perDay));
  const dayInCycle = diffDays % cycleLength;
  const cycleNumber = Math.floor(diffDays / cycleLength) + 1;

  const start = (dayInCycle * perDay) + 1;
  const end = Math.min(total, start + perDay - 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return {
    start,
    end,
    pages,
    perDay,
    cycleLength,
    cycleDay: dayInCycle + 1,
    cycleNumber,
    absoluteDay: diffDays + 1,
  };
}

function buildLocalQuranUrl(page) {
  const safePage = Math.max(1, Math.min(CONFIG.QURAN.TOTAL_PAGES, Number(page || 1)));
  return `${String(CONFIG.QURAN.LOCAL_PDF_URL || "quran/standard1-quran.pdf")}#page=${safePage}&view=FitH`;
}

let LOCAL_QURAN_PDF_AVAILABLE = null;
let LOCAL_QURAN_PDF_CHECK = null;

async function canUseLocalQuranPdf() {
  if (LOCAL_QURAN_PDF_AVAILABLE !== null) {
    return LOCAL_QURAN_PDF_AVAILABLE;
  }

  if (String(window.location?.protocol || "").toLowerCase() === "file:") {
    LOCAL_QURAN_PDF_AVAILABLE = true;
    return true;
  }

  if (LOCAL_QURAN_PDF_CHECK) {
    return LOCAL_QURAN_PDF_CHECK;
  }

  const pdfUrl = String(CONFIG.QURAN.LOCAL_PDF_URL || "quran/standard1-quran.pdf").split("#")[0];
  LOCAL_QURAN_PDF_CHECK = fetch(pdfUrl, {
    method: "HEAD",
    cache: "no-store",
  })
    .then((response) => {
      LOCAL_QURAN_PDF_AVAILABLE = Boolean(response?.ok);
      return LOCAL_QURAN_PDF_AVAILABLE;
    })
    .catch(() => {
      LOCAL_QURAN_PDF_AVAILABLE = false;
      return false;
    })
    .finally(() => {
      LOCAL_QURAN_PDF_CHECK = null;
    });

  return LOCAL_QURAN_PDF_CHECK;
}

function buildWebQuranUrl(page) {
  const safePage = Math.max(1, Math.min(CONFIG.QURAN.TOTAL_PAGES, Number(page || 1)));
  return String(CONFIG.QURAN.PAGE_URL_TEMPLATE || "https://quran.com/page/{page}")
    .replace("{page}", String(safePage));
}

function describeQuranPlan(quranPlan) {
  if (!quranPlan) {
    return {
      rangeText: "ورد غير متاح",
      cycleText: "",
      dayText: "",
    };
  }

  const startText = formatArabicNumber(quranPlan.start);
  const endText = formatArabicNumber(quranPlan.end);
  return {
    rangeText: quranPlan.start === quranPlan.end
      ? `الصفحة ${startText}`
      : `الصفحات ${startText} - ${endText}`,
    cycleText: `الدورة ${formatArabicNumber(quranPlan.cycleNumber)} • اليوم ${formatArabicNumber(quranPlan.cycleDay)} من ${formatArabicNumber(quranPlan.cycleLength)}`,
    dayText: `اليوم ${formatArabicNumber(quranPlan.absoluteDay)} منذ بداية الورد`,
  };
}

function renderQuranTaskMeta(quranPlan) {
  const rangeEl = qs("#quranDailyPages");
  const metaEl = qs("#quranDailyMeta");
  const summary = describeQuranPlan(quranPlan);
  if (rangeEl) rangeEl.textContent = summary.rangeText;
  if (metaEl) metaEl.textContent = `${summary.cycleText} • ${summary.dayText}`;
}

function openUrlInNewTab(url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function openDailyQuran(quranPlan) {
  const startPage = Math.max(1, Number(quranPlan?.start || 1));
  const hasLocalPdf = await canUseLocalQuranPdf();
  if (!hasLocalPdf) {
    openUrlInNewTab(buildWebQuranUrl(startPage));
    showToast("المصحف المحلي غير متاح على النسخة المنشورة، فتم فتح quran.com بدلًا منه.");
    return false;
  }

  openUrlInNewTab(buildLocalQuranUrl(startPage));
  return true;
}

function openDailyQuranOnline(quranPlan) {
  const startPage = Math.max(1, Number(quranPlan?.start || 1));
  openUrlInNewTab(buildWebQuranUrl(startPage));
}

function setupQuranModal() {
  const modal = qs("#quranModal");
  const openBtn = qs("#openQuranReading");
  const closeBtn = qs("#closeQuranModal");
  const closeBtn2 = qs("#closeQuranModal2");
  const localBtn = qs("#quranOpenLocalTab");
  const webBtn = qs("#quranOpenWebTab");
  const copyBtn = qs("#quranCopyPlan");
  const markDoneBtn = qs("#quranMarkDone");
  const subEl = qs("#quranModalSub");
  const rangeEl = qs("#quranPlanRange");
  const metaEl = qs("#quranPlanMeta");
  const noteEl = qs("#quranNote");
  const navEl = qs("#quranPageNav");
  const frameEl = qs("#quranReaderFrame");
  const hintEl = qs("#quranReaderHint");
  if (!modal) return;

  let activePlan = null;

  function getPlan() {
    return WA3I_CTX.quranPlan || computeDailyQuranPages(new Date());
  }

  function updateDoneButton() {
    if (!markDoneBtn) return;
    const completed = Boolean(WA3I_CTX.state?.tasks?.quran_reading);
    markDoneBtn.textContent = completed ? "مكتمل اليوم ✅" : "تمت القراءة ✅";
  }

  function setActivePage(page) {
    const safePage = Math.max(1, Math.min(CONFIG.QURAN.TOTAL_PAGES, Number(page || activePlan?.start || 1)));
    if (frameEl) frameEl.src = buildLocalQuranUrl(safePage);

    navEl?.querySelectorAll("[data-quran-page]").forEach((btn) => {
      const btnPage = Number(btn.getAttribute("data-quran-page"));
      btn.classList.toggle("is-active", btnPage === safePage);
    });

    if (hintEl && activePlan) {
      const rangeText = activePlan.start === activePlan.end
        ? `ورد اليوم هو الصفحة ${formatArabicNumber(activePlan.start)}.`
        : `ورد اليوم من الصفحة ${formatArabicNumber(activePlan.start)} إلى ${formatArabicNumber(activePlan.end)}.`;
      hintEl.textContent = `الصفحة ${formatArabicNumber(safePage)} مفتوحة الآن من المصحف المحلي. ${rangeText} إذا لم يظهر العرض داخل الصفحة عندك، استخدم زر "فتح المصحف" أو افتح على quran.com.`;
    }
  }

  function renderPlan(plan) {
    activePlan = plan;
    const summary = describeQuranPlan(plan);

    if (subEl) {
      subEl.textContent = `ورد اليوم يبدأ من ${summary.rangeText}. يمكنك القراءة داخل الموقع أو فتحه في تبويب مستقل.`;
    }
    if (rangeEl) rangeEl.textContent = summary.rangeText;
    if (metaEl) metaEl.textContent = `${summary.cycleText} • ${summary.dayText}`;
    if (noteEl) {
      noteEl.textContent = `المصحف المحلي مضبوط على ورد اليوم: ${summary.rangeText}. خيار quran.com موجود كبديل سريع إذا أحببت.`;
    }

    if (navEl) {
      navEl.innerHTML = plan.pages.map((page) => `
        <button class="quran-page-chip${page === plan.start ? " is-active" : ""}" type="button" data-quran-page="${page}">
          صفحة ${formatArabicNumber(page)}
        </button>
      `).join("");

      navEl.querySelectorAll("[data-quran-page]").forEach((btn) => {
        btn.addEventListener("click", () => {
          setActivePage(Number(btn.getAttribute("data-quran-page")));
        });
      });
    }

    updateDoneButton();
    setActivePage(plan.start);
  }

  async function openModal() {
    const hasLocalPdf = await canUseLocalQuranPdf();
    if (!hasLocalPdf) {
      openDailyQuranOnline(getPlan());
      showToast("المصحف المحلي غير مرفوع على هذه النسخة بعد، فتم فتح ورد اليوم على quran.com.");
      return;
    }

    renderPlan(getPlan());
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  openBtn?.addEventListener("click", () => {
    openModal();
  });
  closeBtn?.addEventListener("click", closeModal);
  closeBtn2?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
  });

  localBtn?.addEventListener("click", () => {
    openDailyQuran(activePlan || getPlan());
  });

  webBtn?.addEventListener("click", () => {
    openDailyQuranOnline(activePlan || getPlan());
  });

  copyBtn?.addEventListener("click", async () => {
    const summary = describeQuranPlan(activePlan || getPlan());
    const text = `ورد القرآن اليوم: ${summary.rangeText} • ${summary.cycleText}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("تم نسخ ورد اليوم ✅");
    } catch {
      showToast("تعذّر النسخ تلقائيًا.");
    }
  });

  markDoneBtn?.addEventListener("click", () => {
    const todayISO = WA3I_CTX.todayISO;
    const state = WA3I_CTX.state;
    if (!todayISO || !state) return;

    state.tasks.quran_reading = true;
    setCheckbox("quran_reading", true);
    updateProgressUI(state);
    renderRiskCheckUI(state);
    maybeUpdateStreakOnFullCompletion(todayISO, state);
    setDailyState(todayISO, state);
    updateDoneButton();
    showToast("تم تعليم ورد القرآن كمكتمل ✅");
  });
}
