/* HA Monthly Audit — list UI, 10 rows per page (original app). */
(function () {
  "use strict";

  var PAGE_SIZE = 10;
  var DB_NAME = "ha-monthly-audit";
  var DB_VERSION = 1;
  var STORE = "records";
  var PREFS_KEY = "ha-monthly-audit-prefs";
  var APP_VER = "5";

  var RECOMMENDATIONS = [
    "Crown cleaning",
    "Crown reduction",
    "Crown thinning",
    "Crown raising",
    "Staking",
    "Cabling",
    "Cobra",
    "Re-inspection within 6 months",
    "Re-inspection within 3 months",
    "Removal",
    "Resis/tomo"
  ];

  function $(id) { return document.getElementById(id); }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function formatDateTimeHK(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
      }).formatToParts(d);
      var map = {};
      parts.forEach(function (p) { map[p.type] = p.value; });
      return map.year + "-" + map.month + "-" + map.day + " " + map.hour + ":" + map.minute + ":" + map.second;
    } catch (err) {
      return d.toISOString();
    }
  }

  function uid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    var buf = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
    else for (var i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(buf, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function norm(s) { return String(s || "").trim(); }

  function normTree(s) { return norm(s).replace(/\s+/g, "").toUpperCase(); }

  function sameText(a, b) {
    return norm(a).toLowerCase() === norm(b).toLowerCase();
  }

  function parseList(text) {
    return String(text || "")
      .split(/\s*[,;／]\s*|\n+/)
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }

  function joinList(arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var t = String(arr[i] || "").trim();
      if (!t) continue;
      var key = t.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(t);
    }
    return out.join(", ");
  }

  function listHas(arr, name) {
    for (var i = 0; i < arr.length; i++) if (sameText(arr[i], name)) return true;
    return false;
  }

  function toggleList(arr, name, exactLabel) {
    var found = -1;
    for (var i = 0; i < arr.length; i++) {
      if (sameText(arr[i], name)) { found = i; break; }
    }
    if (found >= 0) arr.splice(found, 1);
    else arr.push(exactLabel || name);
    return arr;
  }

  function estateMeta(name) {
    for (var i = 0; i < ESTATES.length; i++) {
      if (ESTATES[i].name === name) return ESTATES[i];
    }
    return { name: name };
  }

  function englishOf(name) {
    return estateMeta(name).english || "";
  }

  function normSearch(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[()（）]/g, " ")
      .replace(/\b(estate|court|factory|building)\b/g, " ")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function searchTokens(s) {
    return normSearch(s).split(" ").filter(Boolean);
  }

  function isRomanToken(t) {
    return /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/.test(t);
  }

  function tokensMatch(hayTokens, qTokens) {
    return qTokens.every(function (qt) {
      return hayTokens.some(function (ht) {
        if (isRomanToken(qt) || isRomanToken(ht)) return ht === qt;
        return ht.indexOf(qt) === 0;
      });
    });
  }

  function estateMatchesQuery(e, raw) {
    var q = norm(raw);
    if (!q) return true;
    if ((e.name || "").indexOf(q) !== -1) return true;
    var nq = searchTokens(q);
    if (!nq.length) return true;
    return tokensMatch(searchTokens((e.name || "") + " " + (e.english || "")), nq);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 2000);
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }

  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
  }

  var dbp = null;
  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: "id" });
          os.createIndex("date", "date", { unique: false });
          os.createIndex("estate", "estate", { unique: false });
          os.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  function txDone(tx, value) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(value); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error("aborted")); };
    });
  }

  async function allRecords() {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function putRecord(rec) {
    var db = await openDb();
    var tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    return txDone(tx, rec);
  }

  async function deleteRecord(id) {
    var db = await openDb();
    var tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    return txDone(tx);
  }

  async function clearAllRecords() {
    var db = await openDb();
    var tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    return txDone(tx);
  }

  var state = {
    rows: [],
    page: 0,
    query: "",
    estateTargetId: null,
    defectTargetId: null,
    recTargetId: null,
    numTargetId: null,
    confirmResolver: null,
    deferredInstall: null,
    lastEstate: "",
    saveTimer: 0
  };

  var toastTimer = 0;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function openDlg(el) {
    if (typeof el.showModal === "function") { if (!el.open) el.showModal(); }
    else el.setAttribute("open", "");
  }

  function closeDlg(el) {
    if (typeof el.close === "function" && el.open) el.close();
    else el.removeAttribute("open");
  }

  function confirmDialog(title, msg, okLabel, danger) {
    return new Promise(function (resolve) {
      $("confirmTitle").textContent = title;
      $("confirmMsg").textContent = msg;
      var ok = $("confirmOk");
      ok.textContent = okLabel || "確定";
      ok.classList.toggle("danger", !!danger);
      ok.classList.toggle("solid", !!danger);
      state.confirmResolver = resolve;
      openDlg($("confirmDlg"));
    });
  }

  function finishConfirm(yes) {
    var fn = state.confirmResolver;
    state.confirmResolver = null;
    closeDlg($("confirmDlg"));
    if (fn) fn(!!yes);
  }

  function emptyRow(seq) {
    return {
      id: uid(),
      seq: seq || 0,
      date: "",
      estate: state.lastEstate || "",
      treeNo: "",
      defect: "",
      recommendation: "",
      createdAt: "",
      updatedAt: "",
      persisted: false
    };
  }

  function isFilled(row) {
    return !!(norm(row.treeNo) || norm(row.defect) || norm(row.recommendation));
  }

  function toPersistable(row) {
    var now = new Date().toISOString();
    return {
      id: row.id,
      date: row.date || "",
      estate: norm(row.estate),
      treeNo: norm(row.treeNo),
      defect: norm(row.defect),
      recommendation: norm(row.recommendation),
      seq: row.seq || 0,
      createdAt: row.createdAt || now,
      updatedAt: now
    };
  }

  function fromStored(rec, index) {
    return {
      id: rec.id || uid(),
      seq: typeof rec.seq === "number" ? rec.seq : index + 1,
      date: rec.date || "",
      estate: rec.estate || "",
      treeNo: rec.treeNo || "",
      defect: rec.defect || "",
      recommendation: rec.recommendation || "",
      createdAt: rec.createdAt || "",
      updatedAt: rec.updatedAt || "",
      persisted: true
    };
  }

  function rememberFrom(row) {
    if (norm(row.estate)) state.lastEstate = row.estate;
    var p = loadPrefs();
    p.lastEstate = state.lastEstate;
    savePrefs(p);
  }

  function applyLastToEmpty(row) {
    if (isFilled(row)) return;
    /* 日期唔預先填；只可帶入上次屋邨。 */
    if (state.lastEstate && !norm(row.estate)) row.estate = state.lastEstate;
  }

  function padToPageMultiple() {
    if (!state.rows.length) {
      for (var i = 0; i < PAGE_SIZE; i++) state.rows.push(emptyRow(i + 1));
      return;
    }
    var rem = state.rows.length % PAGE_SIZE;
    if (rem === 0) return;
    var base = maxSeq();
    for (var j = 0; j < PAGE_SIZE - rem; j++) {
      var r = emptyRow(base + j + 1);
      applyLastToEmpty(r);
      state.rows.push(r);
    }
  }

  function maxSeq() {
    var m = 0;
    state.rows.forEach(function (r) { if (r.seq > m) m = r.seq; });
    return m;
  }

  function filteredIndexes() {
    var q = norm(state.query).toLowerCase();
    var idxs = [];
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (!q) { idxs.push(i); continue; }
      if (!isFilled(r) && !norm(r.estate) && !norm(r.date)) continue;
      var meta = { name: r.estate, english: englishOf(r.estate) };
      var blob = [r.date, r.treeNo, r.defect, r.recommendation].join(" ").toLowerCase();
      if (blob.indexOf(q) !== -1 || estateMatchesQuery(meta, state.query)) idxs.push(i);
    }
    return idxs;
  }

  function isViewLimited() { return !!norm(state.query); }

  function pageCount() {
    return Math.max(1, Math.ceil(filteredIndexes().length / PAGE_SIZE));
  }

  function filledCount() {
    var n = 0;
    state.rows.forEach(function (r) { if (isFilled(r)) n += 1; });
    return n;
  }

  function rowById(id) {
    for (var i = 0; i < state.rows.length; i++) if (state.rows[i].id === id) return state.rows[i];
    return null;
  }

  function scheduleSave(row) {
    rememberFrom(row);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () { persistRow(row); }, 280);
  }

  async function persistRow(row) {
    if (!isFilled(row)) {
      if (row.persisted) {
        await deleteRecord(row.id);
        row.persisted = false;
        row.createdAt = "";
        row.updatedAt = "";
        updateCount();
      }
      return;
    }
    var rec = toPersistable(row);
    await putRecord(rec);
    row.persisted = true;
    row.createdAt = rec.createdAt;
    row.updatedAt = rec.updatedAt;
    updateCount();
  }

  async function persistRowNow(row) {
    clearTimeout(state.saveTimer);
    await persistRow(row);
  }

  async function flushSaves() {
    clearTimeout(state.saveTimer);
    var rows = state.rows.slice();
    for (var i = 0; i < rows.length; i++) {
      if (isFilled(rows[i]) || rows[i].persisted) await persistRow(rows[i]);
    }
  }

  function updateCount() {
    $("countBadge").textContent = "已記錄 " + filledCount() + " 項";
  }

  function render() {
    if (state.page > pageCount() - 1) state.page = pageCount() - 1;
    if (state.page < 0) state.page = 0;
    $("pageLabel").textContent = "第 " + (state.page + 1) + " / " + pageCount() + " 頁";
    $("btnPrev").disabled = state.page <= 0;
    $("btnNext").disabled = isViewLimited() && state.page >= pageCount() - 1;
    updateCount();

    var indexes = filteredIndexes();
    var start = state.page * PAGE_SIZE;
    var slice = indexes.slice(start, start + PAGE_SIZE);
    var tbody = $("tbody");
    tbody.textContent = "";
    for (var i = 0; i < PAGE_SIZE; i++) {
      if (i < slice.length) tbody.appendChild(renderRow(state.rows[slice[i]], start + i + 1));
    }
  }

  function renderRow(row, number) {
    var tr = document.createElement("tr");
    tr.dataset.id = row.id;
    if (isFilled(row)) tr.classList.add("filled");

    var tdNum = document.createElement("td");
    tdNum.className = "num";
    tdNum.textContent = String(number);
    tr.appendChild(tdNum);

    var tdDate = document.createElement("td");
    tdDate.className = "date-col";
    var date = document.createElement("input");
    date.type = "date";
    date.value = row.date || "";
    date.setAttribute("aria-label", "日期");
    date.addEventListener("focus", function () { hideKeypad(); setActive(tr); });
    date.addEventListener("change", function () {
      row.date = date.value;
      rememberFrom(row);
      scheduleSave(row);
      maybeWarnDup(row);
    });
    tdDate.appendChild(date);
    tr.appendChild(tdDate);

    var tdEst = document.createElement("td");
    var estBtn = document.createElement("button");
    estBtn.type = "button";
    estBtn.className = "cell";
    estBtn.setAttribute("aria-label", "屋邨");
    var estNames = document.createElement("span");
    estNames.className = "names";
    var estVal = document.createElement("span");
    estVal.className = "val" + (row.estate ? "" : " placeholder");
    estVal.textContent = row.estate || "揀選屋邨";
    estNames.appendChild(estVal);
    if (row.estate && englishOf(row.estate)) {
      var estEn = document.createElement("span");
      estEn.className = "en";
      estEn.textContent = englishOf(row.estate);
      estNames.appendChild(estEn);
    }
    estBtn.appendChild(estNames);
    estBtn.addEventListener("click", function () {
      hideKeypad();
      setActive(tr);
      openEstatePicker(row.id);
    });
    tdEst.appendChild(estBtn);
    tr.appendChild(tdEst);

    var tdTree = document.createElement("td");
    tdTree.className = "tree-col";
    var tree = document.createElement("input");
    tree.type = "text";
    tree.inputMode = "none";
    tree.autocomplete = "off";
    tree.spellcheck = false;
    tree.setAttribute("aria-label", "號碼");
    tree.value = row.treeNo || "";
    tree.addEventListener("focus", function () {
      setActive(tr);
      openNumpad(row.id);
    });
    tree.addEventListener("input", function () {
      row.treeNo = tree.value;
      scheduleSave(row);
    });
    tree.addEventListener("blur", function () { maybeWarnDup(row); });
    tree.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        finishNumpadOnRow();
      }
    });
    tdTree.appendChild(tree);
    tr.appendChild(tdTree);

    var tdDef = document.createElement("td");
    tdDef.className = "def-cell";
    tdDef.appendChild(valueCell(row.defect, "Defect", function () {
      hideKeypad();
      setActive(tr);
      openDefectPicker(row.id);
    }));
    tr.appendChild(tdDef);

    var tdRec = document.createElement("td");
    tdRec.className = "rec-cell";
    tdRec.appendChild(valueCell(row.recommendation, "Recommendation", function () {
      hideKeypad();
      setActive(tr);
      openRecPicker(row.id);
    }));
    tr.appendChild(tdRec);

    var tdAct = document.createElement("td");
    tdAct.className = "act";
    var del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.setAttribute("aria-label", "刪除呢行");
    del.textContent = "×";
    del.addEventListener("click", function () { askClearRow(row); });
    tdAct.appendChild(del);
    tr.appendChild(tdAct);

    return tr;
  }

  function valueCell(text, label, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.setAttribute("aria-label", label);
    var span = document.createElement("span");
    span.className = "val" + (norm(text) ? "" : " placeholder");
    span.textContent = norm(text) || "選";
    b.appendChild(span);
    b.addEventListener("click", function (ev) {
      if (blockSyntheticCellClick) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      onClick();
    });
    return b;
  }

  function setActive(tr) {
    var rows = $("tbody").querySelectorAll("tr");
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle("active", rows[i] === tr);
  }

  function findDuplicate(row) {
    if (!norm(row.estate) || !row.date || !norm(row.treeNo)) return null;
    var key = normTree(row.treeNo);
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (r.id === row.id) continue;
      if (!isFilled(r)) continue;
      if (r.estate === row.estate && r.date === row.date && normTree(r.treeNo) === key) return r;
    }
    return null;
  }

  var dupLock = false;
  async function maybeWarnDup(row) {
    if (dupLock) return;
    var other = findDuplicate(row);
    if (!other) return;
    dupLock = true;
    $("dupMsg").textContent = row.date + "　" + row.estate + "　" + row.treeNo + " 已有另一行記錄。";
    openDlg($("dupDlg"));
  }

  function goPage(delta) {
    hideKeypad();
    flushSaves();
    var pages = pageCount();
    if (delta > 0 && state.page >= pages - 1) {
      if (isViewLimited()) return;
      var base = maxSeq();
      for (var i = 0; i < PAGE_SIZE; i++) {
        var r = emptyRow(base + i + 1);
        applyLastToEmpty(r);
        state.rows.push(r);
      }
      state.page += 1;
      render();
      var first = document.querySelector("#tbody tr input[aria-label='號碼']");
      if (first) first.focus();
      return;
    }
    state.page = Math.max(0, Math.min(pages - 1, state.page + delta));
    render();
  }

  /* ---- Estate picker ---- */
  function openEstatePicker(rowId) {
    state.estateTargetId = rowId;
    $("estateSearch").value = "";
    renderEstateList();
    openDlg($("estateDlg"));
    setTimeout(function () { $("estateSearch").focus(); }, 50);
  }

  function setRowEstate(row, name) {
    row.estate = name || "";
    rememberFrom(row);
    scheduleSave(row);
    render();
  }

  function renderEstateList() {
    var typedQ = $("estateSearch").value;
    var list = $("estateList");
    list.textContent = "";
    var n = 0;
    var current = rowById(state.estateTargetId);
    ESTATES.forEach(function (e) {
      if (typedQ && !estateMatchesQuery(e, typedQ)) return;
      n += 1;
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      if (current && current.estate === e.name) b.className = "on";
      var names = document.createElement("span");
      names.className = "names";
      var zh = document.createElement("span");
      zh.className = "zh";
      zh.textContent = e.name;
      names.appendChild(zh);
      if (e.english) {
        var en = document.createElement("span");
        en.className = "en";
        en.textContent = e.english;
        names.appendChild(en);
      }
      b.appendChild(names);
      b.addEventListener("click", function () {
        if (current) setRowEstate(current, e.name);
        closeDlg($("estateDlg"));
      });
      li.appendChild(b);
      list.appendChild(li);
    });
    var typed = norm($("estateSearch").value);
    if (typed && n === 0) {
      var li2 = document.createElement("li");
      var b2 = document.createElement("button");
      b2.type = "button";
      b2.textContent = "使用「" + typed + "」（名單以外）";
      b2.addEventListener("click", function () {
        if (current) setRowEstate(current, typed);
        closeDlg($("estateDlg"));
      });
      li2.appendChild(b2);
      list.appendChild(li2);
    }
    $("estatePickCount").textContent = n + " / " + ESTATES.length + " 個屋邨";
  }

  /* ---- Defect picker ---- */
  function openDefectPicker(rowId) {
    state.defectTargetId = rowId;
    $("defectSearch").value = "";
    renderDefectPicker();
    openDlg($("defectDlg"));
  }

  function currentDefects() {
    var row = rowById(state.defectTargetId);
    return parseList(row ? row.defect : "");
  }

  function setCurrentDefects(arr) {
    var row = rowById(state.defectTargetId);
    if (!row) return;
    row.defect = joinList(arr);
    rememberFrom(row);
    scheduleSave(row);
    renderDefectPicker();
    var btn = document.querySelector('tr[data-id="' + row.id + '"] td.def-cell button .val');
    if (btn) {
      btn.textContent = row.defect || "選";
      btn.classList.toggle("placeholder", !row.defect);
    }
  }

  function renderDefectPicker() {
    var selected = currentDefects();
    var box = $("defectShortcuts");
    box.textContent = "";
    DEFECT_SHORTCUTS.forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = name;
      if (listHas(selected, name)) b.className = "on";
      b.addEventListener("click", function () {
        setCurrentDefects(toggleList(currentDefects(), name, name));
      });
      box.appendChild(b);
    });

    var q = norm($("defectSearch").value);
    var ql = q.toLowerCase();
    var list = $("defectChoices");
    list.textContent = "";
    var n = 0;
    DEFECTS.forEach(function (name) {
      if (ql && name.toLowerCase().indexOf(ql) === -1) return;
      n += 1;
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = name;
      if (listHas(selected, name)) b.className = "on";
      b.addEventListener("click", function () {
        setCurrentDefects(toggleList(currentDefects(), name, name));
      });
      li.appendChild(b);
      list.appendChild(li);
    });
    if (!n && q) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "加入自訂「" + q + "」";
      b.addEventListener("click", function () {
        setCurrentDefects(toggleList(currentDefects(), q, q));
        $("defectSearch").value = "";
        renderDefectPicker();
      });
      li.appendChild(b);
      list.appendChild(li);
    }
  }

  /* ---- Recommendation picker (multi-select checkboxes) ---- */
  function openRecPicker(rowId) {
    state.recTargetId = rowId;
    renderRecPicker();
    openDlg($("recDlg"));
  }

  function renderRecPicker() {
    var row = rowById(state.recTargetId);
    var selected = parseList(row ? row.recommendation : "");
    var box = $("recChoices");
    box.textContent = "";
    RECOMMENDATIONS.forEach(function (d) {
      var on = listHas(selected, d);
      var b = document.createElement("button");
      b.type = "button";
      b.className = on ? "on" : "";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      var mark = document.createElement("span");
      mark.className = "rec-box";
      mark.setAttribute("aria-hidden", "true");
      var lab = document.createElement("span");
      lab.textContent = d;
      b.appendChild(mark);
      b.appendChild(lab);
      b.addEventListener("click", function () {
        if (!row) return;
        row.recommendation = joinList(toggleList(parseList(row.recommendation), d, d));
        rememberFrom(row);
        scheduleSave(row);
        renderRecPicker();
        var cell = document.querySelector('tr[data-id="' + row.id + '"] td.rec-cell button .val');
        if (cell) {
          cell.textContent = row.recommendation || "選";
          cell.classList.toggle("placeholder", !row.recommendation);
        }
      });
      box.appendChild(b);
    });
  }

  /* ---- Numpad ---- */
  function openNumpad(rowId) {
    state.numTargetId = rowId;
    $("numpad").hidden = false;
    document.body.classList.add("numpad-open");
    var row = rowById(rowId);
    $("numpadLabel").textContent = "號碼" + (row && row.estate ? " · " + row.estate : "");
    renderNumpadKeys();
    syncPrefixButtons();
  }

  function hideKeypad() {
    state.numTargetId = null;
    document.body.classList.remove("numpad-open");
    $("numpad").hidden = true;
  }

  /* 九宮格喺畫面底部。完成／下一個若喺 pointerdown 就收起鍵盤，
   * 之後嘅 click 可能會打中下面嘅 Defect 格。用呢個開關擋呢下殘留 click；
   * 之後用家自己再撳 Defect 會有新嘅 pointerdown，會取消阻擋。 */
  var blockSyntheticCellClick = false;
  var ghostClickTimer = 0;

  function armGhostClickGuard() {
    blockSyntheticCellClick = true;
    if (ghostClickTimer) clearTimeout(ghostClickTimer);
    ghostClickTimer = setTimeout(function () {
      blockSyntheticCellClick = false;
      ghostClickTimer = 0;
    }, 400);
  }

  function finishNumpadOnRow() {
    var row = rowById(state.numTargetId);
    hideKeypad();
    armGhostClickGuard();
    if (!row) return;
    persistRowNow(row);
    maybeWarnDup(row);
    var tr = document.querySelector('tr[data-id="' + row.id + '"]');
    if (tr) setActive(tr);
  }

  function treeInput() {
    if (!state.numTargetId) return null;
    return document.querySelector('tr[data-id="' + state.numTargetId + '"] input[aria-label="號碼"]');
  }

  function treePrefix(v) {
    var m = /^(AT|TG|T)/i.exec(String(v || ""));
    return m ? m[1].toUpperCase() : "";
  }

  function applyTreeValue(v) {
    var input = treeInput();
    var row = rowById(state.numTargetId);
    if (!input || !row) return;
    input.value = v;
    row.treeNo = v;
    scheduleSave(row);
    syncPrefixButtons();
  }

  function renderNumpadKeys() {
    var grid = $("numpadGrid");
    grid.textContent = "";
    ["1","2","3","4","5","6","7","8","9","清空","0","⌫"].forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = k;
      if (k === "清空" || k === "⌫") b.className = "fn";
      b.addEventListener("pointerdown", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        numpadPress(k);
      });
      grid.appendChild(b);
    });
  }

  function numpadPress(key) {
    var input = treeInput();
    var row = rowById(state.numTargetId);
    if (!input || !row) return;
    var v = String(input.value || "");
    if (key === "⌫") {
      var p = treePrefix(v);
      v = (p && v === p) ? "" : v.slice(0, -1);
    } else if (key === "清空") {
      v = treePrefix(v);
    } else {
      v += key;
    }
    applyTreeValue(v);
  }

  function applyPrefix(prefix) {
    var input = treeInput();
    if (!input) return;
    var v = String(input.value || "").replace(/^(AT|TG|T)/i, "");
    applyTreeValue(prefix + v);
  }

  function syncPrefixButtons() {
    var input = treeInput();
    var cur = input ? treePrefix(input.value) : "";
    var btns = $("numpadPrefixes").querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("on", btns[i].getAttribute("data-prefix") === cur);
    }
  }

  function numpadAdvance() {
    var row = rowById(state.numTargetId);
    if (row) {
      persistRowNow(row);
      maybeWarnDup(row);
    }
    var input = treeInput();
    var tr = input && input.closest("tr");
    var next = tr && tr.nextElementSibling;
    if (next) {
      var nxt = next.querySelector('input[aria-label="號碼"]');
      if (nxt) {
        armGhostClickGuard();
        nxt.focus();
        return;
      }
    }
    if (!isViewLimited() || state.page < pageCount() - 1) {
      armGhostClickGuard();
      goPage(1);
      var first = document.querySelector("#tbody tr input[aria-label='號碼']");
      if (first) first.focus();
      return;
    }
    hideKeypad();
    armGhostClickGuard();
    if (row) {
      var stay = document.querySelector('tr[data-id="' + row.id + '"]');
      if (stay) setActive(stay);
    }
  }

  async function askClearRow(row) {
    hideKeypad();
    if (!isFilled(row) && !norm(row.estate)) {
      row.date = "";
      row.estate = state.lastEstate || "";
      row.treeNo = "";
      row.defect = "";
      row.recommendation = "";
      render();
      return;
    }
    var ok = await confirmDialog(
      "刪除呢行？",
      "確定清除 " + (row.estate || "（未選屋邨）") + " " + (row.treeNo || "（未有號碼）") + " 呢行？",
      "刪除",
      true
    );
    if (!ok) return;
    if (row.persisted) await deleteRecord(row.id);
    row.date = "";
    row.estate = state.lastEstate || "";
    row.treeNo = "";
    row.defect = "";
    row.recommendation = "";
    row.createdAt = "";
    row.updatedAt = "";
    row.persisted = false;
    render();
    toast("已刪除呢行");
  }

  function exportXlsx(records, filename) {
    if (typeof XLSX === "undefined") { toast("Excel 元件未能載入"); return; }
    var rows = records.map(function (r) {
      return {
        "日期": r.date,
        "屋邨": r.estate,
        "屋邨英文": englishOf(r.estate),
        "號碼": r.treeNo,
        "Defect": r.defect,
        "Recommendation": r.recommendation || "",
        "建立時間": formatDateTimeHK(r.createdAt),
        "更新時間": formatDateTimeHK(r.updatedAt)
      };
    });
    if (!rows.length) {
      rows = [{ "日期": "", "屋邨": "", "屋邨英文": "", "號碼": "", "Defect": "", "Recommendation": "", "建立時間": "", "更新時間": "" }];
    }
    var ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 40 }, { wch: 36 },
      { wch: 20 }, { wch: 20 }
    ];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "記錄");
    var out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
    toast("已匯出 " + records.length + " 項");
  }

  function filledRowsFiltered() {
    var idxs = filteredIndexes();
    var out = [];
    idxs.forEach(function (i) {
      if (isFilled(state.rows[i])) out.push(state.rows[i]);
    });
    return out;
  }

  function backupJson() {
    var records = state.rows.filter(isFilled).map(toPersistable);
    var payload = { app: "ha-monthly-audit", version: 2, exportedAt: new Date().toISOString(), records: records };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "HA-Monthly-Audit-backup-" + todayISO() + ".json");
    toast("已下載 JSON 備份");
  }

  function readJsonFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try { resolve(JSON.parse(String(reader.result || ""))); }
        catch (e) { reject(e); }
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsText(file, "utf-8");
    });
  }

  async function restoreJson(file, mode) {
    var data = await readJsonFile(file);
    var incoming = [];
    if (data && Array.isArray(data.records)) incoming = data.records;
    else if (Array.isArray(data)) incoming = data;
    if (!incoming.length) { toast("備份檔冇記錄"); return; }
    if (mode === "replace") await clearAllRecords();
    var existing = await allRecords();
    var byKey = {};
    existing.forEach(function (r) {
      byKey[(r.date || "") + "|" + (r.estate || "") + "|" + normTree(r.treeNo)] = r;
    });
    var byId = {};
    existing.forEach(function (r) { byId[r.id] = r; });
    var now = new Date().toISOString();
    var n = 0;
    var max = 0;
    existing.forEach(function (r) { if (r.seq > max) max = r.seq || 0; });
    for (var i = 0; i < incoming.length; i++) {
      var src = incoming[i] || {};
      var rec = {
        id: src.id && !(mode === "merge" && byId[src.id]) ? (src.id || uid()) : uid(),
        date: norm(src.date),
        estate: norm(src.estate),
        treeNo: norm(src.treeNo),
        defect: norm(src.defect),
        recommendation: norm(src.recommendation),
        seq: typeof src.seq === "number" ? src.seq : ++max,
        createdAt: src.createdAt || now,
        updatedAt: src.updatedAt || now
      };
      if (mode === "merge") {
        var key = rec.date + "|" + rec.estate + "|" + normTree(rec.treeNo);
        if (byKey[key]) {
          rec.id = byKey[key].id;
          rec.createdAt = byKey[key].createdAt || rec.createdAt;
          rec.seq = byKey[key].seq || rec.seq;
          rec.updatedAt = now;
        } else if (src.id && byId[src.id]) rec.id = src.id;
      }
      if (!rec.date && !rec.estate && !rec.treeNo && !rec.defect && !rec.recommendation) continue;
      if (!rec.treeNo && !rec.defect && !rec.recommendation) continue;
      await putRecord(rec);
      n += 1;
    }
    await loadRows();
    toast("已還原 " + n + " 項（" + (mode === "replace" ? "取代" : "合併") + "）");
  }

  async function loadRows() {
    var recs = await allRecords();
    recs.sort(function (a, b) {
      var sa = typeof a.seq === "number" ? a.seq : 0;
      var sb = typeof b.seq === "number" ? b.seq : 0;
      if (sa && sb && sa !== sb) return sa - sb;
      var ca = a.createdAt || "";
      var cb = b.createdAt || "";
      if (ca !== cb) return ca < cb ? -1 : 1;
      if (a.date !== b.date) return (a.date || "") < (b.date || "") ? -1 : 1;
      return 0;
    });
    state.rows = recs.map(function (r, i) { return fromStored(r, i); });
    padToPageMultiple();
    if (!state.lastEstate) {
      var lastFilled = null;
      for (var i = state.rows.length - 1; i >= 0; i--) {
        if (isFilled(state.rows[i])) { lastFilled = state.rows[i]; break; }
      }
      if (lastFilled) rememberFrom(lastFilled);
    }
    state.rows.forEach(applyLastToEmpty);
    render();
  }

  function bind() {
    $("btnPrev").addEventListener("click", function () { goPage(-1); });
    $("btnNext").addEventListener("click", function () { goPage(1); });
    $("q").addEventListener("input", function () {
      state.query = $("q").value;
      state.page = 0;
      render();
    });
    $("btnExport").addEventListener("click", async function () {
      await flushSaves();
      var rows = filledRowsFiltered();
      if (!rows.length) { toast("未有記錄可匯出"); return; }
      var name = "HA-Monthly-Audit-" + todayISO() + (norm(state.query) ? "-篩選" : "") + ".xlsx";
      exportXlsx(rows, name);
    });

    $("estateDlgClose").addEventListener("click", function () { closeDlg($("estateDlg")); });
    $("estateSearch").addEventListener("input", renderEstateList);

    $("defectDlgClose").addEventListener("click", function () { closeDlg($("defectDlg")); var r = rowById(state.defectTargetId); if (r) persistRowNow(r); render(); });
    $("defectDone").addEventListener("click", function () { closeDlg($("defectDlg")); var r = rowById(state.defectTargetId); if (r) persistRowNow(r); render(); });
    $("defectClear").addEventListener("click", function () { setCurrentDefects([]); });
    $("defectSearch").addEventListener("input", renderDefectPicker);

    $("recDlgClose").addEventListener("click", function () { closeDlg($("recDlg")); var r = rowById(state.recTargetId); if (r) persistRowNow(r); render(); });
    $("recDone").addEventListener("click", function () { closeDlg($("recDlg")); var r = rowById(state.recTargetId); if (r) persistRowNow(r); render(); });
    $("recClear").addEventListener("click", function () {
      var row = rowById(state.recTargetId);
      if (!row) return;
      row.recommendation = "";
      scheduleSave(row);
      renderRecPicker();
    });

    $("numpadPrefixes").querySelectorAll("button").forEach(function (b) {
      b.addEventListener("pointerdown", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        applyPrefix(b.getAttribute("data-prefix"));
      });
    });
    $("numpadDone").addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      finishNumpadOnRow();
    });
    $("numpadDone").addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    });
    $("numpadClear").addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      numpadPress("清空");
    });
    $("numpadNext").addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      numpadAdvance();
    });
    $("numpadNext").addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    });
    document.addEventListener("pointerdown", function (ev) {
      if (blockSyntheticCellClick && ev.target.closest("table.sheet") && !ev.target.closest("#numpad")) {
        blockSyntheticCellClick = false;
      }
      if (!document.body.classList.contains("numpad-open")) return;
      if (ev.target.closest("#numpad") || ev.target.closest('input[aria-label="號碼"]')) return;
      hideKeypad();
    });
    document.addEventListener("click", function (ev) {
      if (!blockSyntheticCellClick) return;
      if (ev.target.closest("table.sheet button, table.sheet input")) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }, true);

    $("btnMore").addEventListener("click", function () { hideKeypad(); openDlg($("moreDlg")); });
    $("moreClose").addEventListener("click", function () { closeDlg($("moreDlg")); });
    $("btnBackup").addEventListener("click", function () {
      if (!filledCount()) { toast("未有記錄可備份"); return; }
      backupJson();
    });
    var pendingRestoreFile = null;
    $("btnRestore").addEventListener("click", function () { $("restoreFile").click(); });
    $("restoreFile").addEventListener("change", function () {
      var file = $("restoreFile").files && $("restoreFile").files[0];
      $("restoreFile").value = "";
      if (!file) return;
      pendingRestoreFile = file;
      closeDlg($("moreDlg"));
      openDlg($("restoreDlg"));
    });
    $("restoreCancel").addEventListener("click", function () { pendingRestoreFile = null; closeDlg($("restoreDlg")); });
    $("restoreMerge").addEventListener("click", async function () {
      var file = pendingRestoreFile;
      pendingRestoreFile = null;
      closeDlg($("restoreDlg"));
      if (file) await restoreJson(file, "merge");
    });
    $("restoreReplace").addEventListener("click", async function () {
      var file = pendingRestoreFile;
      closeDlg($("restoreDlg"));
      var ok = await confirmDialog("全部取代？", "現有記錄會被刪除，再用備份檔取代。確定繼續？", "全部取代", true);
      if (!ok) { pendingRestoreFile = null; return; }
      pendingRestoreFile = null;
      if (file) await restoreJson(file, "replace");
    });
    $("btnClearAll").addEventListener("click", async function () {
      closeDlg($("moreDlg"));
      var n = filledCount();
      if (!n) { toast("未有記錄"); return; }
      var ok = await confirmDialog("清除全部記錄", "確定刪除全部 " + n + " 條記錄？刪除後唔可復原，請確定已匯出或備份。", "全部刪除", true);
      if (!ok) return;
      await clearAllRecords();
      state.rows = [];
      state.page = 0;
      padToPageMultiple();
      render();
      toast("已清除全部記錄");
    });

    $("dupCancel").addEventListener("click", function () { closeDlg($("dupDlg")); dupLock = false; });
    $("dupOk").addEventListener("click", function () { closeDlg($("dupDlg")); dupLock = false; });

    $("confirmCancel").addEventListener("click", function () { finishConfirm(false); });
    $("confirmOk").addEventListener("click", function () { finishConfirm(true); });
    $("confirmDlg").addEventListener("cancel", function (ev) { ev.preventDefault(); finishConfirm(false); });

    $("btnInstall").addEventListener("click", function () {
      if (!state.deferredInstall) return;
      var ev = state.deferredInstall;
      state.deferredInstall = null;
      $("btnInstall").hidden = true;
      ev.prompt();
    });
    window.addEventListener("beforeinstallprompt", function (ev) {
      ev.preventDefault();
      state.deferredInstall = ev;
      $("btnInstall").hidden = false;
    });
  }

  function registerSW() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("./sw.js?v=" + APP_VER).catch(function () {});
  }

  function requestPersist() {
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      navigator.storage.persist().catch(function () {});
    }
  }

  function paintVersion() {
    var el = $("appVerMark");
    if (el) el.textContent = "v" + APP_VER;
  }

  async function init() {
    paintVersion();
    var prefs = loadPrefs();
    state.lastEstate = prefs.lastEstate || "";
    bind();
    renderNumpadKeys();
    try {
      await openDb();
      await loadRows();
    } catch (err) {
      padToPageMultiple();
      render();
      toast("無法開啟本機資料庫");
    }
    registerSW();
    requestPersist();
    window.addEventListener("pagehide", function () { flushSaves(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushSaves(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
