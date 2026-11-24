/* HA Monthly Audit — offline field records (original app). */
(function () {
  "use strict";

  var DB_NAME = "ha-monthly-audit";
  var DB_VERSION = 1;
  var STORE = "records";
  var PREFS_KEY = "ha-monthly-audit-prefs";
  var SPLIT_MQ = window.matchMedia("(min-width: 700px)");

  function $(id) { return document.getElementById(id); }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function formatDateHeading(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var weeks = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    return m[1] + "年" + Number(m[2]) + "月" + Number(m[3]) + "日 " + weeks[d.getDay()];
  }

  function formatDateTimeHK(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
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
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    var buf = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
    else for (var i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(buf, function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function norm(s) { return String(s || "").trim(); }

  function normTree(s) { return norm(s).replace(/\s+/g, "").toUpperCase(); }

  function estateMeta(name) {
    for (var i = 0; i < ESTATES.length; i++) {
      if (ESTATES[i].name === name) return ESTATES[i];
    }
    return { name: name, assignee: null };
  }

  function assigneeOf(name) {
    return estateMeta(name).assignee || "";
  }

  function parseDefects(text) {
    return String(text || "")
      .split(/\s*;\s*|\s*／\s*|\s*\/\s*|\n+/)
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }

  function joinDefects(arr) {
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
    return out.join("; ");
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
    setTimeout(function () {
      a.remove();
      URL.revokeObjectURL(url);
    }, 2000);
  }

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
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
      var tx = db.transaction(STORE, "readonly");
      var req = tx.objectStore(STORE).getAll();
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
    records: [],
    view: "add",
    editId: null,
    estate: "",
    estateAssigneeFilter: "",
    pendingDup: null,
    confirmResolver: null,
    deferredInstall: null
  };

  var toastTimer = 0;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function isSplit() { return SPLIT_MQ.matches; }

  function openDlg(el) {
    if (typeof el.showModal === "function") {
      if (!el.open) el.showModal();
    } else {
      el.setAttribute("open", "");
    }
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

  function setEstate(name) {
    state.estate = name || "";
    var label = $("estateLabel");
    var who = $("estateWho");
    if (!state.estate) {
      label.textContent = "揀選屋邨";
      label.classList.add("placeholder");
      who.hidden = true;
      who.textContent = "";
      return;
    }
    label.textContent = state.estate;
    label.classList.remove("placeholder");
    var a = assigneeOf(state.estate);
    if (a) {
      who.hidden = false;
      who.textContent = a;
    } else {
      who.hidden = true;
      who.textContent = "";
    }
    var prefs = loadPrefs();
    prefs.lastEstate = state.estate;
    savePrefs(prefs);
  }

  function selectedDefects() {
    return parseDefects($("defectInput").value);
  }

  function defectSelected(name) {
    var cur = selectedDefects();
    var lower = name.toLowerCase();
    for (var i = 0; i < cur.length; i++) {
      if (cur[i].toLowerCase() === lower) return true;
    }
    return false;
  }

  function syncChips() {
    var buttons = document.querySelectorAll("#defectChips button.chip");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("on", defectSelected(buttons[i].getAttribute("data-defect")));
    }
    var choices = document.querySelectorAll("#defectChoices button");
    for (var j = 0; j < choices.length; j++) {
      choices[j].classList.toggle("on", defectSelected(choices[j].getAttribute("data-defect")));
    }
  }

  function toggleDefect(name) {
    var cur = selectedDefects();
    var lower = name.toLowerCase();
    var found = -1;
    for (var i = 0; i < cur.length; i++) {
      if (cur[i].toLowerCase() === lower) { found = i; break; }
    }
    if (found >= 0) cur.splice(found, 1);
    else cur.push(name);
    $("defectInput").value = joinDefects(cur);
    syncChips();
  }

  function renderChips() {
    var box = $("defectChips");
    box.textContent = "";
    DEFECT_CHIPS.forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.setAttribute("data-defect", name);
      b.textContent = name;
      b.addEventListener("click", function () { toggleDefect(name); });
      box.appendChild(b);
    });
    syncChips();
  }

  function renderEstateList() {
    var q = norm($("estateSearch").value).toLowerCase();
    var asg = state.estateAssigneeFilter;
    var list = $("estateList");
    list.textContent = "";
    var n = 0;
    var exact = false;
    ESTATES.forEach(function (e) {
      if (asg && e.assignee !== asg) return;
      if (q) {
        var hay = (e.name + " " + (e.assignee || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return;
      }
      if (e.name === q || e.name.toLowerCase() === q) exact = true;
      n += 1;
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      if (e.name === state.estate) b.className = "on";
      var span = document.createElement("span");
      span.textContent = e.name;
      b.appendChild(span);
      if (e.assignee) {
        var w = document.createElement("span");
        w.className = "who";
        w.textContent = e.assignee;
        b.appendChild(w);
      }
      b.addEventListener("click", function () {
        setEstate(e.name);
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
        setEstate(typed);
        closeDlg($("estateDlg"));
      });
      li2.appendChild(b2);
      list.appendChild(li2);
    }
    $("estatePickCount").textContent = n + " / " + ESTATES.length + " 個屋邨";
  }

  function renderDefectChoices() {
    var q = norm($("defectSearch").value).toLowerCase();
    var box = $("defectChoices");
    box.textContent = "";
    var n = 0;
    DEFECTS.forEach(function (name) {
      if (q && name.toLowerCase().indexOf(q) === -1) return;
      n += 1;
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-defect", name);
      b.textContent = name;
      if (defectSelected(name)) b.className = "on";
      b.addEventListener("click", function () { toggleDefect(name); });
      li.appendChild(b);
      box.appendChild(li);
    });
    if (!n) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = q ? "清單冇呢項，撳呢度加入「" + norm($("defectSearch").value) + "」" : "冇結果";
      b.disabled = !q;
      if (q) {
        b.addEventListener("click", function () {
          toggleDefect(norm($("defectSearch").value));
          $("defectSearch").value = "";
          renderDefectChoices();
        });
      }
      li.appendChild(b);
      box.appendChild(li);
    }
  }

  function setView(name) {
    state.view = name;
    var split = isSplit();
    $("viewAdd").hidden = !split && name !== "add";
    $("viewRecords").hidden = !split && name !== "records";
    $("tabAdd").classList.toggle("on", name === "add");
    $("tabRecords").classList.toggle("on", name === "records");
    $("tabAdd").setAttribute("aria-selected", name === "add" ? "true" : "false");
    $("tabRecords").setAttribute("aria-selected", name === "records" ? "true" : "false");
  }

  function treeSortKey(s) {
    var t = normTree(s);
    var m = /^(.*?)(\d+)$/.exec(t);
    if (m) return [m[1], Number(m[2])];
    return [t, 0];
  }

  function compareTree(a, b) {
    var ka = treeSortKey(a);
    var kb = treeSortKey(b);
    if (ka[0] < kb[0]) return -1;
    if (ka[0] > kb[0]) return 1;
    return ka[1] - kb[1];
  }

  function filteredRecords() {
    var date = $("filterDate").value;
    var estateQ = norm($("filterEstate").value).toLowerCase();
    var asg = $("filterAssignee").value;
    return state.records.filter(function (r) {
      if (date && r.date !== date) return false;
      if (estateQ && String(r.estate || "").toLowerCase().indexOf(estateQ) === -1) return false;
      if (asg) {
        var a = assigneeOf(r.estate) || "none";
        if (asg === "none") {
          if (a !== "none") return false;
        } else if (a !== asg) return false;
      }
      return true;
    });
  }

  function renderRecords() {
    $("countBadge").textContent = state.records.length + " 項";
    var list = $("recordsList");
    var rows = filteredRecords().slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.estate !== b.estate) return a.estate < b.estate ? -1 : 1;
      return compareTree(a.treeNo, b.treeNo);
    });
    var total = state.records.length;
    $("filterSummary").textContent = rows.length === total
      ? "共 " + total + " 項"
      : "顯示 " + rows.length + " / 共 " + total + " 項";

    if (!rows.length) {
      list.innerHTML = isSplit()
      ? '<div class="empty">未有記錄。請喺左邊表單儲存第一條，或改吓篩選條件。</div>'
      : '<div class="empty">未有記錄。喺「新增」頁面儲存第一條，或改吓篩選條件。</div>';
      return;
    }

    var groups = [];
    var map = {};
    rows.forEach(function (r) {
      if (!map[r.date]) {
        map[r.date] = { date: r.date, items: [] };
        groups.push(map[r.date]);
      }
      map[r.date].items.push(r);
    });

    list.textContent = "";
    groups.forEach(function (g) {
      var sec = document.createElement("section");
      sec.className = "date-group";
      var head = document.createElement("div");
      head.className = "date-head";
      var h2 = document.createElement("h2");
      h2.textContent = formatDateHeading(g.date);
      var n = document.createElement("span");
      n.className = "n";
      n.textContent = g.items.length + " 項";
      head.appendChild(h2);
      head.appendChild(n);
      sec.appendChild(head);
      g.items.forEach(function (r) {
        sec.appendChild(renderCard(r));
      });
      list.appendChild(sec);
    });
  }

  function renderCard(r) {
    var el = document.createElement("article");
    el.className = "rec";
    el.setAttribute("data-id", r.id);
    var top = document.createElement("div");
    top.className = "top";
    var left = document.createElement("div");
    var name = document.createElement("span");
    name.className = "estate-name";
    name.textContent = r.estate;
    left.appendChild(name);
    var a = assigneeOf(r.estate);
    if (a) {
      var who = document.createElement("span");
      who.className = "who";
      who.textContent = a;
      left.appendChild(who);
    }
    var tree = document.createElement("div");
    tree.className = "tree";
    tree.textContent = r.treeNo;
    top.appendChild(left);
    top.appendChild(tree);
    el.appendChild(top);
    var def = document.createElement("div");
    def.className = "defect";
    def.textContent = r.defect || "（未填 defect）";
    el.appendChild(def);
    var actions = document.createElement("div");
    actions.className = "actions";
    var edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "更改";
    edit.addEventListener("click", function () { startEdit(r.id); });
    var del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "刪除";
    del.addEventListener("click", function () { askDelete(r.id); });
    actions.appendChild(edit);
    actions.appendChild(del);
    el.appendChild(actions);
    return el;
  }

  function fillFormFrom(rec) {
    setEstate(rec.estate);
    $("dateInput").value = rec.date;
    $("treeInput").value = rec.treeNo;
    $("defectInput").value = rec.defect;
    syncChips();
  }

  function resetFormAfterSave() {
    state.editId = null;
    $("btnSave").textContent = "儲存記錄";
    $("editActions").hidden = true;
    $("formHint").textContent = "儲存後會保留屋邨同日期，方便繼續錄下一棵樹。";
    $("treeInput").value = "";
    $("defectInput").value = "";
    syncChips();
  }

  function startEdit(id) {
    var rec = state.records.filter(function (r) { return r.id === id; })[0];
    if (!rec) return;
    state.editId = id;
    fillFormFrom(rec);
    $("btnSave").textContent = "儲存更改";
    $("editActions").hidden = false;
    $("formHint").textContent = "正在更改呢條記錄。";
    setView("add");
    $("treeInput").focus();
    if (!isSplit()) window.scrollTo(0, 0);
  }

  function cancelEdit() {
    state.editId = null;
    $("btnSave").textContent = "儲存記錄";
    $("editActions").hidden = true;
    $("formHint").textContent = "儲存後會保留屋邨同日期，方便繼續錄下一棵樹。";
    $("treeInput").value = "";
    $("defectInput").value = "";
    syncChips();
  }

  function findDuplicate(estate, date, treeNo, exceptId) {
    var key = normTree(treeNo);
    for (var i = 0; i < state.records.length; i++) {
      var r = state.records[i];
      if (exceptId && r.id === exceptId) continue;
      if (r.estate === estate && r.date === date && normTree(r.treeNo) === key) return r;
    }
    return null;
  }

  function readForm() {
    return {
      estate: state.estate,
      date: $("dateInput").value,
      treeNo: norm($("treeInput").value),
      defect: norm($("defectInput").value)
    };
  }

  async function refresh() {
    state.records = await allRecords();
    renderRecords();
  }

  async function commitRecord(data, existing) {
    var now = new Date().toISOString();
    var rec;
    if (existing) {
      rec = {
        id: existing.id,
        estate: data.estate,
        date: data.date,
        treeNo: data.treeNo,
        defect: data.defect,
        createdAt: existing.createdAt || now,
        updatedAt: now
      };
    } else if (state.editId) {
      var cur = state.records.filter(function (r) { return r.id === state.editId; })[0];
      rec = {
        id: state.editId,
        estate: data.estate,
        date: data.date,
        treeNo: data.treeNo,
        defect: data.defect,
        createdAt: cur && cur.createdAt ? cur.createdAt : now,
        updatedAt: now
      };
    } else {
      rec = {
        id: uid(),
        estate: data.estate,
        date: data.date,
        treeNo: data.treeNo,
        defect: data.defect,
        createdAt: now,
        updatedAt: now
      };
    }
    await putRecord(rec);
    await refresh();
    var wasEdit = !!state.editId && (!existing || existing.id === state.editId);
    resetFormAfterSave();
    $("dateInput").value = data.date;
    setEstate(data.estate);
    toast((wasEdit || existing) ? "已更新：" + rec.estate + " " + rec.treeNo : "已儲存：" + rec.estate + " " + rec.treeNo);
    $("treeInput").focus();
  }

  async function handleSave(evt) {
    if (evt) evt.preventDefault();
    var data = readForm();
    if (!data.estate) {
      toast("請先揀選屋邨");
      openEstatePicker();
      return;
    }
    if (!data.date) {
      toast("請填日期");
      $("dateInput").focus();
      return;
    }
    if (!data.treeNo) {
      toast("請填樹號碼");
      $("treeInput").focus();
      return;
    }
    if (!data.defect) {
      var okEmpty = await confirmDialog("未填 Defect", "未填 defect，確定仍然儲存？", "仍然儲存", false);
      if (!okEmpty) return;
    }
    var dup = findDuplicate(data.estate, data.date, data.treeNo, state.editId);
    if (dup) {
      state.pendingDup = { data: data, existing: dup };
      $("dupMsg").textContent = data.date + "　" + data.estate + "　" + data.treeNo + " 已有記錄。";
      $("dupOld").textContent = "現有 defect：" + (dup.defect || "（空）");
      openDlg($("dupDlg"));
      return;
    }
    await commitRecord(data, state.editId ? state.records.filter(function (r) { return r.id === state.editId; })[0] : null);
  }

  async function askDelete(id) {
    var rec = state.records.filter(function (r) { return r.id === id; })[0];
    if (!rec) return;
    var ok = await confirmDialog(
      "刪除記錄",
      "確定刪除 " + rec.estate + " " + rec.treeNo + " 呢條記錄？刪除後唔可復原。",
      "刪除",
      true
    );
    if (!ok) return;
    await deleteRecord(id);
    if (state.editId === id) cancelEdit();
    await refresh();
    toast("已刪除：" + rec.estate + " " + rec.treeNo);
  }

  function exportFilename(kind, rows) {
    var today = todayISO();
    if (kind === "all") return "HA-Monthly-Audit-" + today + ".xlsx";
    var date = $("filterDate").value;
    var estateQ = norm($("filterEstate").value);
    var asg = $("filterAssignee").value;
    var bits = ["HA-Monthly-Audit"];
    if (date) bits.push(date);
    if (estateQ) bits.push(estateQ);
    if (asg && asg !== "none") bits.push(asg);
    if (asg === "none") bits.push("未指定");
    if (bits.length === 1) bits.push(today, "篩選");
    if (!date && !estateQ && !asg) bits = ["HA-Monthly-Audit", today, "篩選"];
    return bits.join("-") + ".xlsx";
  }

  function exportXlsx(records, filename) {
    if (typeof XLSX === "undefined") {
      toast("Excel 元件未能載入");
      return;
    }
    var rows = records.map(function (r) {
      return {
        "屋邨": r.estate,
        "日期": r.date,
        "樹號碼": r.treeNo,
        "Defect": r.defect,
        "負責人": assigneeOf(r.estate),
        "建立時間": formatDateTimeHK(r.createdAt),
        "更新時間": formatDateTimeHK(r.updatedAt)
      };
    });
    if (!rows.length) {
      rows = [{ "屋邨": "", "日期": "", "樹號碼": "", "Defect": "", "負責人": "", "建立時間": "", "更新時間": "" }];
    }
    var ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 48 },
      { wch: 10 }, { wch: 20 }, { wch: 20 }
    ];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "記錄");
    var out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(
      new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      filename
    );
    toast("已匯出 " + (records.length || 0) + " 項");
  }

  function backupJson() {
    var payload = {
      app: "ha-monthly-audit",
      version: 1,
      exportedAt: new Date().toISOString(),
      records: state.records
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, "HA-Monthly-Audit-backup-" + todayISO() + ".json");
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
    if (!incoming.length) {
      toast("備份檔冇記錄");
      return;
    }
    if (mode === "replace") {
      await clearAllRecords();
    }
    var now = new Date().toISOString();
    var existing = await allRecords();
    var byKey = {};
    existing.forEach(function (r) {
      byKey[r.estate + "|" + r.date + "|" + normTree(r.treeNo)] = r;
    });
    var byId = {};
    existing.forEach(function (r) { byId[r.id] = r; });
    var n = 0;
    for (var i = 0; i < incoming.length; i++) {
      var src = incoming[i] || {};
      var rec = {
        id: src.id && !byId[src.id] ? src.id : (mode === "replace" && src.id ? src.id : uid()),
        estate: norm(src.estate),
        date: norm(src.date),
        treeNo: norm(src.treeNo),
        defect: norm(src.defect),
        createdAt: src.createdAt || now,
        updatedAt: src.updatedAt || now
      };
      if (!rec.estate || !rec.date || !rec.treeNo) continue;
      if (mode === "merge") {
        var key = rec.estate + "|" + rec.date + "|" + normTree(rec.treeNo);
        if (byKey[key]) {
          rec.id = byKey[key].id;
          rec.createdAt = byKey[key].createdAt || rec.createdAt;
          rec.updatedAt = now;
        } else if (src.id && byId[src.id]) {
          rec.id = src.id;
        }
      }
      await putRecord(rec);
      n += 1;
    }
    await refresh();
    toast("已還原 " + n + " 項（" + (mode === "replace" ? "取代" : "合併") + "）");
  }

  function openEstatePicker() {
    $("estateSearch").value = "";
    renderEstateList();
    openDlg($("estateDlg"));
    setTimeout(function () { $("estateSearch").focus(); }, 50);
  }

  function applyPrefix(prefix) {
    var input = $("treeInput");
    var v = norm(input.value).replace(/^(AT|TG|T)/i, "");
    input.value = prefix + v;
    input.focus();
  }

  function bind() {
    $("tabAdd").addEventListener("click", function () { setView("add"); });
    $("tabRecords").addEventListener("click", function () { setView("records"); renderRecords(); });

    $("estateBtn").addEventListener("click", openEstatePicker);
    $("estateDlgClose").addEventListener("click", function () { closeDlg($("estateDlg")); });
    $("estateSearch").addEventListener("input", renderEstateList);

    var chips = $("estateAssigneeChips").querySelectorAll("button");
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener("click", function (ev) {
        var btn = ev.currentTarget;
        state.estateAssigneeFilter = btn.getAttribute("data-assignee") || "";
        for (var j = 0; j < chips.length; j++) chips[j].classList.toggle("on", chips[j] === btn);
        renderEstateList();
      });
    }

    $("btnToday").addEventListener("click", function () {
      $("dateInput").value = todayISO();
    });

    var prefixes = document.querySelectorAll(".prefix-bar [data-prefix]");
    for (var p = 0; p < prefixes.length; p++) {
      prefixes[p].addEventListener("click", function (ev) {
        applyPrefix(ev.currentTarget.getAttribute("data-prefix"));
      });
    }

    $("defectInput").addEventListener("input", syncChips);
    $("btnAllDefects").addEventListener("click", function () {
      $("defectSearch").value = "";
      renderDefectChoices();
      openDlg($("defectDlg"));
      setTimeout(function () { $("defectSearch").focus(); }, 50);
    });
    $("defectDlgClose").addEventListener("click", function () { closeDlg($("defectDlg")); });
    $("defectSearch").addEventListener("input", renderDefectChoices);

    $("entryForm").addEventListener("submit", handleSave);
    $("btnCancelEdit").addEventListener("click", cancelEdit);
    $("btnDeleteEdit").addEventListener("click", function () {
      if (state.editId) askDelete(state.editId);
    });

    $("filterDate").addEventListener("change", renderRecords);
    $("filterEstate").addEventListener("input", renderRecords);
    $("filterAssignee").addEventListener("change", renderRecords);
    $("btnClearFilters").addEventListener("click", function () {
      $("filterDate").value = "";
      $("filterEstate").value = "";
      $("filterAssignee").value = "";
      renderRecords();
    });

    $("btnExportFiltered").addEventListener("click", function () {
      var rows = filteredRecords();
      if (!rows.length) { toast("目前篩選冇記錄可匯出"); return; }
      exportXlsx(rows, exportFilename("filtered", rows));
    });
    $("btnExportAll").addEventListener("click", function () {
      if (!state.records.length) { toast("未有記錄可匯出"); return; }
      exportXlsx(state.records, exportFilename("all"));
    });

    $("btnMore").addEventListener("click", function () { openDlg($("moreDlg")); });
    $("moreClose").addEventListener("click", function () { closeDlg($("moreDlg")); });
    $("btnBackup").addEventListener("click", function () {
      if (!state.records.length) { toast("未有記錄可備份"); return; }
      backupJson();
    });
    $("btnRestore").addEventListener("click", function () { $("restoreFile").click(); });
    var pendingRestoreFile = null;
    $("restoreFile").addEventListener("change", function () {
      var file = $("restoreFile").files && $("restoreFile").files[0];
      $("restoreFile").value = "";
      if (!file) return;
      pendingRestoreFile = file;
      closeDlg($("moreDlg"));
      openDlg($("restoreDlg"));
    });
    $("restoreCancel").addEventListener("click", function () {
      pendingRestoreFile = null;
      closeDlg($("restoreDlg"));
    });
    $("restoreMerge").addEventListener("click", async function () {
      var file = pendingRestoreFile;
      pendingRestoreFile = null;
      closeDlg($("restoreDlg"));
      if (file) await restoreJson(file, "merge");
    });
    $("restoreReplace").addEventListener("click", async function () {
      var file = pendingRestoreFile;
      closeDlg($("restoreDlg"));
      var ok = await confirmDialog(
        "全部取代？",
        "現有記錄會被刪除，再用備份檔取代。確定繼續？",
        "全部取代",
        true
      );
      if (!ok) { pendingRestoreFile = null; return; }
      pendingRestoreFile = null;
      if (file) await restoreJson(file, "replace");
    });

    $("btnClearAll").addEventListener("click", async function () {
      closeDlg($("moreDlg"));
      if (!state.records.length) { toast("未有記錄"); return; }
      var ok = await confirmDialog(
        "清除全部記錄",
        "確定刪除全部 " + state.records.length + " 條記錄？刪除後唔可復原，請確定已匯出或備份。",
        "全部刪除",
        true
      );
      if (!ok) return;
      await clearAllRecords();
      cancelEdit();
      await refresh();
      toast("已清除全部記錄");
    });

    $("dupCancel").addEventListener("click", function () {
      state.pendingDup = null;
      closeDlg($("dupDlg"));
    });
    $("dupReplace").addEventListener("click", async function () {
      var p = state.pendingDup;
      state.pendingDup = null;
      closeDlg($("dupDlg"));
      if (p) await commitRecord(p.data, p.existing);
    });
    $("dupMerge").addEventListener("click", async function () {
      var p = state.pendingDup;
      state.pendingDup = null;
      closeDlg($("dupDlg"));
      if (!p) return;
      p.data.defect = joinDefects(parseDefects(p.existing.defect).concat(parseDefects(p.data.defect)));
      await commitRecord(p.data, p.existing);
    });

    $("confirmCancel").addEventListener("click", function () { finishConfirm(false); });
    $("confirmOk").addEventListener("click", function () { finishConfirm(true); });

    document.querySelectorAll("dialog").forEach(function (dlg) {
      dlg.addEventListener("cancel", function (ev) {
        if (dlg.id === "confirmDlg") {
          ev.preventDefault();
          finishConfirm(false);
        }
        if (dlg.id === "dupDlg") state.pendingDup = null;
      });
    });

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

    if (typeof SPLIT_MQ.addEventListener === "function") {
      SPLIT_MQ.addEventListener("change", function () { setView(state.view); });
    } else if (typeof SPLIT_MQ.addListener === "function") {
      SPLIT_MQ.addListener(function () { setView(state.view); });
    }
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }

  function requestPersist() {
    if (!navigator.storage || typeof navigator.storage.persist !== "function") return;
    navigator.storage.persist().catch(function () {});
  }

  async function init() {
    renderChips();
    bind();
    $("dateInput").value = todayISO();
    var prefs = loadPrefs();
    if (prefs.lastEstate) setEstate(prefs.lastEstate);
    setView("add");
    try {
      await openDb();
      await refresh();
    } catch (err) {
      toast("無法開啟本機資料庫");
    }
    registerSW();
    requestPersist();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
