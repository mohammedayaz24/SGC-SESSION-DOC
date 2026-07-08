/*!
 * SGC Session Documentation Portal
 * Vanilla JS application logic — no frameworks, no build step.
 *
 * Structure (search these headers to navigate):
 *   1. STATE
 *   2. DOM REFERENCES
 *   3. UTILITIES
 *   4. VALIDATION
 *   5. DYNAMIC LIST RENDERING (form side)
 *   6. DOCUMENT CONTENT (single, always-one-page HTML)
 *   7. ONE-PAGE FIT ENGINE (uniform shrink, never just font-size)
 *   8. DOCUMENT RENDERING (mount into any container)
 *   9. QR CODE GENERATION
 *  10. RESPONSIVE ZOOM (visual-only, fits the dashboard, unrelated to fit engine)
 *  11. EXPORT: PDF / PNG / PRINT
 *  12. THEME
 *  13. SAMPLE DATA / RESET / MODAL
 *  14. EVENT WIRING / INIT
 *
 * ARCHITECTURE NOTE: this document is ALWAYS exactly one A4 page. Rather
 * than paginating, or shrinking only the font (which leaves padding/margins
 * full-size and makes content look cramped), the entire content block is
 * uniformly scaled down — via a JS-computed `zoom` plus a compensating
 * `width` on `.doc-body__scale` — only as much as needed to fit. Text,
 * spacing, table padding, and QR cards all shrink together, so a reduced
 * page still reads as a clean, proportional "zoomed out" version of the
 * full design. The exact same function drives the live preview, the modal,
 * PDF export, and PNG export, so all four are always pixel-consistent.
 */
(function () {
  "use strict";

  /* ============================== 1. STATE ============================== */
  const MAX_OBJECTIVES = 5;

  const defaultState = () => ({
    topic: "",
    handler: "",
    date: "",
    time: "13:00",
    duration: "1 - 1:30",
    venue: "SGC ROOM",
    attendees: "",
    objectives: [""],
    summary: "",
    concepts: [{ concept: "", description: "" }],
    outcomes: [""],
    links: [{ title: "", url: "" }]
  });

  let state = defaultState();

  /* ========================== 2. DOM REFERENCES =========================== */
  const el = (id) => document.getElementById(id);

  const form = el("sessionForm");
  const docContent = el("docContent"); // .a4-page-list wrapper for the live preview
  const exportRoot = el("exportRoot");
  const statusDot = el("statusDot");
  const statusText = el("statusText");
  const fitValue = el("fitValue");

  /* ============================== 3. UTILITIES ============================ */

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function orPlaceholder(value, placeholder) {
    const v = String(value == null ? "" : value).trim();
    return v ? esc(v) : `<span class="doc-empty">${esc(placeholder)}</span>`;
  }

  function isValidUrl(str) {
    if (!str) return false;
    try {
      const u = new URL(str.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  function formatDateLong(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  }

  function formatTime12h(timeStr) {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return "";
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  }

  function dayFromDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { weekday: "long" });
  }

  function autosize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderDocument();
      updateStatus();
    });
  }

  /* ============================== 4. VALIDATION ============================ */

  const REQUIRED_FIELDS = ["topic", "handler", "date", "time", "venue", "attendees"];

  const ERROR_MESSAGES = {
    topic: "Session topic is required.",
    handler: "Session handler is required.",
    date: "Please select a date.",
    time: "Please select a time.",
    venue: "Venue is required.",
    attendees: "Enter the number of attendees."
  };

  function validateField(id) {
    const input = el(id);
    const errorEl = el("err-" + id);
    if (!input) return true;
    const value = String(input.value || "").trim();
    const valid = value.length > 0 && (id !== "attendees" || Number(value) >= 0);
    input.classList.toggle("is-invalid", !valid);
    if (errorEl) errorEl.textContent = valid ? "" : ERROR_MESSAGES[id];
    return valid;
  }

  function validateAll() {
    return REQUIRED_FIELDS.map(validateField).every(Boolean);
  }

  function updateStatus() {
    const allFilled = REQUIRED_FIELDS.every((id) => String(state[id] || "").trim().length > 0);
    statusDot.classList.toggle("is-valid", allFilled);
    statusText.textContent = allFilled ? "Document ready" : "Draft in progress";
  }

  /* ==================== 5. DYNAMIC LIST RENDERING (form) ==================== */

  function renderObjectivesForm() {
    const container = el("objectivesList");
    container.innerHTML = state.objectives.map((val, i) => `
      <div class="list-row" data-index="${i}">
        <span class="list-row__bullet">${i + 1}</span>
        <input type="text" maxlength="140" placeholder="e.g. Understand core Git commands"
               data-list="objectives" data-index="${i}" value="${esc(val)}" aria-label="Learning objective ${i + 1}" />
        <button type="button" class="icon-btn" data-remove="objectives" data-index="${i}"
                aria-label="Remove objective ${i + 1}" ${state.objectives.length <= 1 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>
        </button>
      </div>`).join("");
    el("addObjective").disabled = state.objectives.length >= MAX_OBJECTIVES;
  }

  function renderOutcomesForm() {
    const container = el("outcomesList");
    container.innerHTML = state.outcomes.map((val, i) => `
      <div class="list-row" data-index="${i}">
        <span class="list-row__bullet">${i + 1}</span>
        <input type="text" maxlength="160" placeholder="e.g. 90% of attendees completed the hands-on lab"
               data-list="outcomes" data-index="${i}" value="${esc(val)}" aria-label="Session outcome ${i + 1}" />
        <button type="button" class="icon-btn" data-remove="outcomes" data-index="${i}"
                aria-label="Remove outcome ${i + 1}" ${state.outcomes.length <= 1 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>
        </button>
      </div>`).join("");
  }

  function renderConceptsForm() {
    const container = el("conceptsTable");
    container.innerHTML = state.concepts.map((row, i) => `
      <div class="concept-row" data-index="${i}">
        <div class="concept-row__head">
          <span class="concept-row__label">Concept ${i + 1}</span>
          <button type="button" class="icon-btn" data-remove="concepts" data-index="${i}"
                  aria-label="Remove concept ${i + 1}" ${state.concepts.length <= 1 ? "disabled" : ""}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="field">
          <label class="sr-only" for="concept-name-${i}">Concept name ${i + 1}</label>
          <input type="text" id="concept-name-${i}" maxlength="80" placeholder="Concept name"
                 data-list="concepts" data-field="concept" data-index="${i}" value="${esc(row.concept)}" />
        </div>
        <div class="field">
          <label class="sr-only" for="concept-desc-${i}">Description ${i + 1}</label>
          <textarea id="concept-desc-${i}" rows="2" maxlength="300" placeholder="Short description"
                    data-list="concepts" data-field="description" data-index="${i}">${esc(row.description)}</textarea>
        </div>
      </div>`).join("");
    container.querySelectorAll("textarea").forEach(autosize);
    el("addConcept").disabled = false;
  }

  function renderLinksForm() {
    const container = el("linksList");
    container.innerHTML = state.links.map((row, i) => {
      const hasUrl = row.url.trim().length > 0;
      const valid = isValidUrl(row.url);
      const hintClass = !hasUrl ? "" : valid ? "is-valid" : "is-invalid";
      const hintText = !hasUrl ? "QR will appear once a valid link is added" : valid ? "✓ Valid link — QR generated" : "⚠ Enter a full URL (https://...)";
      return `
      <div class="list-row list-row--link" data-index="${i}">
        <div class="link-fields">
          <input type="text" maxlength="90" placeholder="Reference title"
                 data-list="links" data-field="title" data-index="${i}" value="${esc(row.title)}"
                 aria-label="Reference title ${i + 1}" />
          <input type="url" maxlength="300" placeholder="https://..."
                 data-list="links" data-field="url" data-index="${i}" value="${esc(row.url)}"
                 aria-label="Reference URL ${i + 1}" />
          <button type="button" class="icon-btn" data-remove="links" data-index="${i}"
                  aria-label="Remove reference ${i + 1}" ${state.links.length <= 1 ? "disabled" : ""}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="link-meta">
          <span class="link-qr-hint ${hintClass}">${hintText}</span>
        </div>
      </div>`;
    }).join("");
  }

  function renderAllFormLists() {
    renderObjectivesForm();
    renderOutcomesForm();
    renderConceptsForm();
    renderLinksForm();
  }

  function handleDynamicInput(e) {
    const t = e.target;
    const listName = t.getAttribute("data-list");
    if (!listName) return;
    const index = Number(t.getAttribute("data-index"));
    const field = t.getAttribute("data-field");

    if (field) {
      state[listName][index][field] = t.value;
    } else {
      state[listName][index] = t.value;
    }

    if (t.tagName === "TEXTAREA") autosize(t);
    if (listName === "links") renderLinksHintOnly(index);
    scheduleRender();
  }

  function renderLinksHintOnly(index) {
    const row = document.querySelector(`.list-row--link[data-index="${index}"]`);
    if (!row) return;
    const hintEl = row.querySelector(".link-qr-hint");
    const url = state.links[index].url;
    const hasUrl = url.trim().length > 0;
    const valid = isValidUrl(url);
    hintEl.className = "link-qr-hint " + (!hasUrl ? "" : valid ? "is-valid" : "is-invalid");
    hintEl.textContent = !hasUrl
      ? "QR will appear once a valid link is added"
      : valid ? "✓ Valid link — QR generated" : "⚠ Enter a full URL (https://...)";
  }

  function handleDynamicRemove(e) {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const listName = btn.getAttribute("data-remove");
    const index = Number(btn.getAttribute("data-index"));
    if (state[listName].length <= 1) return;
    state[listName].splice(index, 1);
    rerenderList(listName);
    scheduleRender();
  }

  function rerenderList(listName) {
    if (listName === "objectives") renderObjectivesForm();
    if (listName === "outcomes") renderOutcomesForm();
    if (listName === "concepts") renderConceptsForm();
    if (listName === "links") renderLinksForm();
  }

  /* ===================== 6. DOCUMENT CONTENT (single page) ===================== */

  /** Static header markup. */
  function renderHeaderHTML() {
    return `<header class="doc-header">
      <div class="doc-header__logos doc-header__logos--left">
        <img class="doc-header__logo" src="officiallogo.png" alt="First logo" />
      </div>
      <div class="doc-header__mid">
        <p class="doc-header__college">Student Guidance Cell</p>
        <p class="doc-header__dept">C. Abdul Hakeem College of Engineering &amp; Technology</p>
        <h2 class="doc-header__doctitle">Session Summary Document</h2>
      </div>
      <div class="doc-header__logos doc-header__logos--right">
        <img class="doc-header__logo" src="cahcet%20logo.png" alt="C. Abdul Hakeem College logo" />
      </div>
    </header>`;
  }

  /** Footer markup. */
  function renderFooterHTML(s) {
    const generatedDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    return `<footer class="doc-footer">
      <div class="doc-footer__col">
        <p class="doc-footer__label">Generated</p>
        <p>${esc(generatedDate)}</p>
      </div>
      <div class="doc-footer__col">
        <p class="doc-footer__label">Prepared By</p>
        <p>${orPlaceholder(s.handler, "—")}</p>
      </div>
      <div class="doc-footer__brand">
        <strong>SGC Documentation Team</strong>
        <p>Student Guidance Cell &middot; CAHCET</p>
      </div>
    </footer>`;
  }

  /** Build the full body content (everything between header and footer) as one block. */
  function buildBodyHTML(s) {
    const dateLong = formatDateLong(s.date);
    const dayName = dayFromDate(s.date);
    const timeText = formatTime12h(s.time);

    const objectives = s.objectives.filter((o) => o.trim().length > 0);
    const outcomes = s.outcomes.filter((o) => o.trim().length > 0);
    const concepts = s.concepts.filter((c) => c.concept.trim() || c.description.trim());
    const links = s.links.filter((l) => l.title.trim() || l.url.trim());

    const objectivesHTML = objectives.length
      ? `<ol class="doc-list">${objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ol>`
      : `<p class="doc-empty">No learning objectives added yet.</p>`;

    const outcomesHTML = outcomes.length
      ? `<ul class="doc-list">${outcomes.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`
      : `<p class="doc-empty">No session outcomes recorded yet.</p>`;

    const conceptsHTML = concepts.length
      ? `<table class="concepts-table">
           <thead><tr><th style="width:28%">Concept</th><th>Description</th></tr></thead>
           <tbody>${concepts.map((c) => `<tr><td class="c-name">${esc(c.concept) || "—"}</td><td>${esc(c.description) || "—"}</td></tr>`).join("")}</tbody>
         </table>`
      : `<p class="doc-empty">No key concepts documented yet.</p>`;

    const linksHTML = links.length
      ? `<div class="ref-list">${links.map((l) => {
          const valid = isValidUrl(l.url);
          return `<div class="ref-item">
            <div class="ref-item__qr" ${valid ? `data-qr-url="${esc(l.url)}"` : ""}>
              ${valid ? "" : `<span style="font-size:8px;color:#aab;text-align:center;">No&nbsp;QR</span>`}
            </div>
            <div class="ref-item__text">
              <p class="ref-item__title">${esc(l.title) || "Untitled reference"}</p>
              <p class="ref-item__url">${esc(l.url) || "—"}</p>
            </div>
          </div>`;
        }).join("")}</div>`
      : `<p class="doc-empty">No reference links added yet.</p>`;

    return `
      <p class="doc-topic-line">
        ${orPlaceholder(s.topic, "Untitled Session Topic")}
        <span>Prepared for institutional record</span>
      </p>

      <section class="doc-section">
        <h3 class="doc-section__title">Session Information</h3>
        <table class="info-table">
          <tr>
            <td class="k2">Handler</td><td>${orPlaceholder(s.handler, "Not specified")}</td>
            <td class="k2">Venue</td><td>${orPlaceholder(s.venue, "Not specified")}</td>
          </tr>
          <tr>
            <td class="k2">Date</td><td>${dateLong ? esc(dateLong) : `<span class="doc-empty">Not set</span>`}</td>
            <td class="k2">Day</td><td>${dayName ? esc(dayName) : `<span class="doc-empty">—</span>`}</td>
          </tr>
          <tr>
            <td class="k2">Time</td><td>${timeText ? esc(timeText) : `<span class="doc-empty">Not set</span>`}</td>
            <td class="k2">Duration</td><td>${orPlaceholder(s.duration, "Not specified")}</td>
          </tr>
          <tr>
            <td class="k2">Attendees</td><td colspan="3">${String(s.attendees).trim() ? esc(s.attendees) : `<span class="doc-empty">Not specified</span>`}</td>
          </tr>
        </table>
      </section>

      <section class="doc-section">
        <h3 class="doc-section__title">Learning Objectives</h3>
        ${objectivesHTML}
      </section>

      <section class="doc-section">
        <h3 class="doc-section__title">Executive Summary</h3>
        <p class="doc-summary">${orPlaceholder(s.summary, "Executive summary will appear here as it is written.")}</p>
      </section>

      <section class="doc-section">
        <h3 class="doc-section__title">Key Concepts</h3>
        ${conceptsHTML}
      </section>

      <section class="doc-section">
        <h3 class="doc-section__title">Session Outcome</h3>
        ${outcomesHTML}
      </section>

      <section class="doc-section" style="margin-bottom:0;">
        <h3 class="doc-section__title">Reference Links</h3>
        ${linksHTML}
      </section>`;
  }

  /* ================ 7. ONE-PAGE FIT ENGINE (uniform shrink, never just font-size) ================ */

  const MIN_SCALE = 0.6; // never shrink content below 60% — beyond this we let it show rather than become unreadable

  /**
   * Uniformly shrink `.doc-body__scale` inside `pageEl` — via a compensating
   * `width` plus `zoom` — until it fits within the available body height, or
   * hits MIN_SCALE. Returns the scale factor actually used (1 = no shrink).
   *
   * Why width + zoom together: `zoom` alone shrinks BOTH dimensions of the
   * element, which would leave a growing blank margin on the right as it
   * shrinks. Widening the un-zoomed box first (by 1/scale) means that after
   * zoom scales it back down, it exactly refills the full content width —
   * so the page always looks fully used, just written smaller.
   */
  function applyOnePageFit(pageEl) {
    const bodyEl = pageEl.querySelector(".doc-body");
    const scaleEl = pageEl.querySelector(".doc-body__scale");
    const headerEl = pageEl.querySelector(".doc-header");
    const footerEl = pageEl.querySelector(".doc-footer");
    if (!bodyEl || !scaleEl || !headerEl || !footerEl) return 1;

    // Reset to natural size for a clean first measurement.
    scaleEl.style.zoom = 1;
    scaleEl.style.width = "auto";

    const pageHeight = pageEl.getBoundingClientRect().height;
    const headerHeight = headerEl.getBoundingClientRect().height;
    const footerHeight = footerEl.getBoundingClientRect().height;
    const bodyStyles = getComputedStyle(bodyEl);
    const bodyPad = parseFloat(bodyStyles.paddingTop) + parseFloat(bodyStyles.paddingBottom);
    const available = pageHeight - headerHeight - footerHeight - bodyPad - 4; // small safety buffer

    const naturalWidth = scaleEl.getBoundingClientRect().width;
    const naturalHeight = scaleEl.scrollHeight;

    if (naturalHeight <= available || naturalWidth <= 0) {
      return 1; // fits already — leave at natural size, fully readable
    }

    let scale = Math.max(MIN_SCALE, available / naturalHeight);

    // A couple of correction passes: widening the box to compensate for zoom
    // can very slightly change wrapping, so re-measure and nudge if needed.
    for (let i = 0; i < 4; i++) {
      scaleEl.style.width = (naturalWidth / scale) + "px";
      scaleEl.style.zoom = scale;
      const renderedHeight = scaleEl.getBoundingClientRect().height;
      if (renderedHeight <= available || scale <= MIN_SCALE) break;
      scale = Math.max(MIN_SCALE, scale * (available / renderedHeight));
    }

    return scale;
  }

  /* ================ 8. DOCUMENT RENDERING (mount into any container) ================ */

  /**
   * Render the single-page document into `container` (an .a4-page-list
   * element), replacing its current contents. Used identically for the live
   * preview, the full-screen modal, and the hidden export clone — so all of
   * them always fit and look the same way.
   */
  function mountDocument(container, s) {
    container.innerHTML = "";
    const pageEl = document.createElement("div");
    pageEl.className = "a4-page";
    pageEl.innerHTML =
      renderHeaderHTML() +
      `<div class="doc-body"><div class="doc-body__scale">${buildBodyHTML(s)}</div></div>` +
      renderFooterHTML(s);
    container.appendChild(pageEl);
    generateQRCodes(pageEl);
    const scale = applyOnePageFit(pageEl);
    return scale;
  }

  /** Re-render the live center-panel preview, update the fit indicator and outer zoom. */
  function renderDocument() {
    const scale = mountDocument(docContent, state);
    fitValue.textContent = Math.round(scale * 100) + "%";
    updateStageZoom();
  }

  /* ========================== 9. QR CODE GENERATION ========================= */

  function generateQRCodes(container) {
    if (typeof QRCode === "undefined") return; // library not loaded (e.g. offline)
    const slots = container.querySelectorAll("[data-qr-url]");
    slots.forEach((slot) => {
      const url = slot.getAttribute("data-qr-url");
      if (!url) return;
      slot.innerHTML = "";
      try {
        new QRCode(slot, {
          text: url,
          width: 90,
          height: 90,
          colorDark: "#161d2b",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (err) {
        slot.innerHTML = `<span style="font-size:8px;color:#aab;">QR error</span>`;
      }
    });
  }

  /* ======================= 10. RESPONSIVE ZOOM (visual only) ======================= */

  /**
   * Scale the whole page down to fit the available dashboard width using CSS
   * `zoom` on the OUTER `.a4-page-list` wrapper. This is unrelated to, and
   * layered on top of, the one-page content fit above: this one just makes
   * the whole finished page smaller on-screen for narrow viewports, exactly
   * like zooming out on a PDF viewer. Export and print always operate on
   * their own full-scale (zoom: 1) clone, so they never inherit this.
   */
  function updateStageZoom() {
    if (!docContent.parentElement) return;
    docContent.style.zoom = 1;
    const firstPage = docContent.querySelector(".a4-page");
    if (!firstPage) return;
    const naturalWidth = firstPage.getBoundingClientRect().width;
    const available = docContent.parentElement.clientWidth - 4;
    const scale = Math.min(1, available / naturalWidth);
    docContent.style.zoom = scale > 0 ? scale : 1;
  }

  /* ======================= 11. EXPORT: PDF / PNG / PRINT ======================= */

  /** Build a fresh, full-scale, un-zoomed single-page clone in the hidden export root. */
  function prepareExportClone() {
    exportRoot.innerHTML = "";
    const list = document.createElement("div");
    list.className = "a4-page-list";
    exportRoot.appendChild(list);
    mountDocument(list, state);
    return list.querySelector(".a4-page");
  }

  function fileBaseName() {
    const topic = state.topic.trim() || "session-summary";
    const safe = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const date = state.date || new Date().toISOString().slice(0, 10);
    return `sgc-${safe}-${date}`;
  }

  async function exportToPdf() {
    setBusy("btnPdf", true);
    try {
      const pageEl = prepareExportClone();
      await new Promise((r) => setTimeout(r, 150)); // let QR codes paint
      const canvas = await html2canvas(pageEl, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      // Captured at true A4 proportions, so this is placed at exactly
      // 210x297mm with no stretching or squeezing — always a single page.
      pdf.addImage(imgData, "PNG", 0, 0, 210, 297, undefined, "FAST");
      pdf.save(fileBaseName() + ".pdf");
    } catch (err) {
      console.error(err);
      alert("PDF export failed. Please check your connection (export libraries load from a CDN) and try again.");
    } finally {
      setBusy("btnPdf", false);
    }
  }

  async function exportToPng() {
    setBusy("btnPng", true);
    try {
      const pageEl = prepareExportClone();
      await new Promise((r) => setTimeout(r, 150));
      const canvas = await html2canvas(pageEl, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = fileBaseName() + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error(err);
      alert("PNG export failed. Please check your connection (export libraries load from a CDN) and try again.");
    } finally {
      setBusy("btnPng", false);
    }
  }

  function printDocument() {
    // Print CSS (@media print) hides the dashboard chrome and prints the
    // single .a4-page at full, un-zoomed scale.
    window.print();
  }

  function setBusy(btnId, busy) {
    const btn = el(btnId);
    if (!btn) return;
    btn.disabled = busy;
  }

  /* ================================ 12. THEME ================================ */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    el("themeLabel").textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
    try { localStorage.setItem("sgc-theme", theme); } catch (e) { /* storage unavailable */ }
  }

  function toggleTheme() {
    const current = document.body.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  function loadStoredTheme() {
    let stored = null;
    try { stored = localStorage.getItem("sgc-theme"); } catch (e) { /* ignore */ }
    applyTheme(stored === "dark" ? "dark" : "light");
  }

  /* ===================== 13. SAMPLE DATA / RESET / MODAL ===================== */

  function loadSampleData() {
    state = {
      topic: "Introduction to Version Control with Git",
      handler: "XXXXXXXXXXXXXXXXXXXXXXXXX",
      date: new Date().toISOString().slice(0, 10),
      time: "10:30",
      duration: "1 hr 30 min",
      venue: "SGC ROOM",
      attendees: "64",
      objectives: [
        "Explain the purpose of version control in collaborative software projects",
        "Demonstrate core Git commands: clone, commit, push, and pull",
        "Practice resolving a merge conflict in a shared repository"
      ],
      summary: "This session introduced final-year students to Git and GitHub as the standard toolchain for collaborative development. Attendees moved from local repository basics to a live, hands-on branching and merge-conflict exercise modelled on real team workflows, closing with a Q&A on best practices for commit hygiene and code review.",
      concepts: [
        { concept: "Repository", description: "A tracked project folder containing the full history of changes." },
        { concept: "Commit", description: "A saved snapshot of changes with a descriptive message." },
        { concept: "Branching", description: "Working on features in isolation before merging into the main line." },
        { concept: "Merge Conflict", description: "When overlapping changes require manual reconciliation." }
      ],
      outcomes: [
        "92% of attendees successfully pushed their first commit during the session",
        "Live poll showed a 4.6/5 average confidence rating in using Git independently",
        "Follow-up practice repository shared for continued self-paced learning"
      ],
      links: [
        { title: "Pro Git Book (free online)", url: "https://git-scm.com/book/en/v2" },
        { title: "GitHub Learning Lab", url: "https://skills.github.com/" }
      ]
    };
    hydrateFormFromState();
    renderAllFormLists();
    renderDocument();
    validateAll();
    updateStatus();
  }

  function resetForm() {
    if (!confirm("Reset the form? All entered session details will be cleared.")) return;
    state = defaultState();
    hydrateFormFromState();
    renderAllFormLists();
    REQUIRED_FIELDS.forEach((id) => {
      el(id).classList.remove("is-invalid");
      const errorEl = el("err-" + id);
      if (errorEl) errorEl.textContent = "";
    });
    renderDocument();
    updateStatus();
  }

  function hydrateFormFromState() {
    ["topic", "handler", "date", "time", "duration", "venue", "attendees", "summary"].forEach((id) => {
      const input = el(id);
      if (input) input.value = state[id];
    });
    el("day").value = dayFromDate(state.date);
    el("summaryCount").textContent = String(state.summary.length);
    autosize(el("summary"));
  }

  function openPreviewModal() {
    const modal = el("previewModal");
    const modalList = el("a4PageModal");
    modalList.style.zoom = 1;
    mountDocument(modalList, state);
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    // Fit the page to the viewport height using zoom (visual only — the
    // content-level one-page fit already happened inside mountDocument).
    requestAnimationFrame(() => {
      const vh = window.innerHeight - 100;
      const naturalHeight = modalList.scrollHeight;
      const scale = Math.min(1, vh / naturalHeight);
      modalList.style.zoom = scale > 0 ? scale : 1;
    });
  }

  function closePreviewModal() {
    const modal = el("previewModal");
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  /* ========================== 14. EVENT WIRING / INIT ========================= */

  function wireStaticFields() {
    ["topic", "handler", "duration", "venue", "attendees"].forEach((id) => {
      el(id).addEventListener("input", () => {
        state[id] = el(id).value;
        if (REQUIRED_FIELDS.includes(id)) validateField(id);
        scheduleRender();
      });
      el(id).addEventListener("blur", () => {
        if (REQUIRED_FIELDS.includes(id)) validateField(id);
      });
    });

    el("date").addEventListener("input", () => {
      state.date = el("date").value;
      const day = dayFromDate(state.date);
      el("day").value = day;
      if (!state.duration || state.duration === "" || state.duration === "1 - 1:30") {
        state.duration = day === "Friday" ? "1 - 2:00" : "1 - 1:30";
        const durEl = el("duration");
        if (durEl) durEl.value = state.duration;
      }
      validateField("date");
      scheduleRender();
    });
    el("date").addEventListener("blur", () => validateField("date"));

    el("time").addEventListener("input", () => {
      state.time = el("time").value;
      validateField("time");
      scheduleRender();
    });
    el("time").addEventListener("blur", () => validateField("time"));

    el("summary").addEventListener("input", () => {
      state.summary = el("summary").value;
      el("summaryCount").textContent = String(state.summary.length);
      autosize(el("summary"));
      scheduleRender();
    });
  }

  function wireDynamicLists() {
    ["objectivesList", "outcomesList", "conceptsTable", "linksList"].forEach((id) => {
      el(id).addEventListener("input", handleDynamicInput);
      el(id).addEventListener("click", handleDynamicRemove);
    });

    el("addObjective").addEventListener("click", () => {
      if (state.objectives.length >= MAX_OBJECTIVES) return;
      state.objectives.push("");
      renderObjectivesForm();
      scheduleRender();
    });

    el("addOutcome").addEventListener("click", () => {
      state.outcomes.push("");
      renderOutcomesForm();
      scheduleRender();
    });

    el("addConcept").addEventListener("click", () => {
      state.concepts.push({ concept: "", description: "" });
      renderConceptsForm();
      scheduleRender();
    });

    el("addLink").addEventListener("click", () => {
      state.links.push({ title: "", url: "" });
      renderLinksForm();
      scheduleRender();
    });
  }

  function wireActions() {
    el("btnPreview").addEventListener("click", openPreviewModal);
    el("modalClose").addEventListener("click", closePreviewModal);
    el("modalBackdrop").addEventListener("click", closePreviewModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePreviewModal();
    });

    el("btnPdf").addEventListener("click", exportToPdf);
    el("btnPng").addEventListener("click", exportToPng);
    el("btnPrint").addEventListener("click", printDocument);
    el("btnSample").addEventListener("click", loadSampleData);
    el("btnReset").addEventListener("click", resetForm);
    el("btnTheme").addEventListener("click", toggleTheme);

    window.addEventListener("resize", () => {
      clearTimeout(window.__sgcResizeT);
      window.__sgcResizeT = setTimeout(updateStageZoom, 150);
    });
  }

  function init() {
    loadStoredTheme();
    form.addEventListener("submit", (e) => e.preventDefault());
    wireStaticFields();
    wireDynamicLists();
    wireActions();
    hydrateFormFromState();
    renderAllFormLists();
    renderDocument();
    updateStatus();
  }

  document.addEventListener("DOMContentLoaded", init);
})();