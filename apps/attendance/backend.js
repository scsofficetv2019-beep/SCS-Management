/* =====================================================================
 *  SCS Employee Attendance — Supabase backend
 *  আগের Code.gs এর ফাংশনগুলো একই নামে। পার্থক্য:
 *   - পুরো লিস্ট মুছে নতুন করে লেখার বদলে শুধু যা বদলেছে সেটুকু সেভ হয়
 *     (তাই অ্যাক্টিভিটি লগে ঠিক কোন রেকর্ড কে বদলেছে তা থাকে)
 *   - "Live export" এখন গুগল শিটে নয়, শেয়ার্ড টেবিল att_monthly_summary তে যায়,
 *     যেটা Monthly Report অ্যাপ সরাসরি পড়ে।
 * ===================================================================== */
(function () {
  'use strict';
  var sb = function () { return SCS.sb; };
  var q = function (p) { return SCS.q(p); };
  var SHARED_URL = 'supabase://att_monthly_summary';

  function isAdmin() { return SCS.role === 'admin'; }
  function needAdmin() {
    if (!isAdmin()) throw new Error(SCS.t('Admin access for Attendance is required.', 'এই কাজের জন্য Attendance-এ Admin অ্যাক্সেস লাগবে।'));
    if (!SCS.adminUnlocked) throw new Error(SCS.t('Enter the admin PIN first.', 'আগে অ্যাডমিন পিন দিন।'));
  }

  function sanitize(name, empId) {
    var nn = String(name || '').trim(), id = String(empId || '').trim();
    if (/^[A-Z0-9_-]{1,10}$/i.test(nn) && /[ঀ-৿\s]/.test(id) && id.length > nn.length) return { name: id, empId: nn };
    return { name: nn, empId: id };
  }

  /* ---------- mapping ---------- */
  function empFromDb(e) {
    return { id: e.id, empId: e.emp_id, name: e.name, designation: e.designation || '-', department: e.department || '', mobile: e.mobile || '', photoUrl: e.photo_url || '', sortOrder: e.sort_order, created: e.created_at };
  }
  function empToDb(e, i) {
    var c = sanitize(e.name, e.empId);
    return {
      id: String(e.id || ('emp-' + (i + 1))), emp_id: c.empId || String(e.empId || ('SCS-' + (101 + i))), name: c.name || String(e.name || ('Employee ' + (i + 1))),
      designation: String(e.designation || ''), department: String(e.department || ''), mobile: String(e.mobile || ''), photo_url: String(e.photoUrl || ''), sort_order: i + 1
    };
  }
  function recFromDb(r) {
    return { id: r.id, empId: r.emp_id, date: r.date, type: r.type, time: r.time, lat: r.lat || 0, lng: r.lng || 0, locationText: r.location_text || '', note: r.note || '', createdBy: r.created_by_label || 'user' };
  }
  function recToDb(r) {
    return {
      id: String(r.id), emp_id: String(r.empId || ''), date: String(r.date || ''), type: String(r.type || 'Clock IN'), time: String(r.time || ''),
      lat: Number(r.lat) || 0, lng: Number(r.lng) || 0, location_text: String(r.locationText || ''), note: String(r.note || ''), created_by_label: r.createdBy === 'admin' ? 'admin' : 'user'
    };
  }
  var REC_FIELDS = ['emp_id', 'date', 'type', 'time', 'lat', 'lng', 'location_text', 'note', 'created_by_label'];
  var EMP_FIELDS = ['emp_id', 'name', 'designation', 'department', 'mobile', 'photo_url', 'sort_order'];
  function same(a, b, fields) { return fields.every(function (f) { return String(a[f] == null ? '' : a[f]) === String(b[f] == null ? '' : b[f]); }); }

  function selectAll(table, order) {
    // Supabase এক কলে সর্বোচ্চ ১০০০ রো দেয় — তাই পেজ করে সব আনা
    var out = [], size = 1000;
    function page(from) {
      return q(sb().from(table).select('*').order(order || 'id').range(from, from + size - 1)).then(function (rows) {
        out = out.concat(rows);
        return rows.length === size ? page(from + size) : out;
      });
    }
    return page(0);
  }
  function inChunks(list, size, fn) {
    var chain = Promise.resolve();
    for (var i = 0; i < list.length; i += size) (function (part) { chain = chain.then(function () { return fn(part); }); })(list.slice(i, i + size));
    return chain;
  }

  /* ---------- settings ---------- */
  function readSettings() {
    return q(sb().from('att_settings').select('key, value')).then(function (rows) {
      var s = {}; rows.forEach(function (r) { s[r.key] = r.value; }); return s;
    });
  }
  function writeSetting(key, value) { return q(sb().from('att_settings').upsert({ key: key, value: value })); }

  /* ---------- monthly summary (same rules as the app's own summary) ---------- */
  function toMin(e) {
    if (!e || e === '-' || typeof e !== 'string') return 0;
    var s = e.trim();
    ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'].forEach(function (d, i) { s = s.split(d).join(String(i)); });
    var pm = /pm|পিএম/i.test(s), am = /am|এএম/i.test(s), m = s.match(/(\d{1,2}):(\d{1,2})/);
    if (!m) return 0;
    var h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if (isNaN(h) || isNaN(mi)) return 0;
    if (pm) { if (h < 12) h += 12; } else if (am && h === 12) h = 0;
    return h * 60 + mi;
  }
  function lateMin(time, inTime, max) {
    if (!time || time === '-' || !inTime || inTime === '-') return 0;
    var r = toMin(time) - toMin(inTime);
    return r > (parseInt(String(max || '0'), 10) || 0) ? r : 0;
  }
  function today() { return SCS.fmt(new Date(), 'yyyy-MM-dd'); }
  function computeSummary(monthKey, employees, records, office) {
    var p = monthKey.split('-'), y = parseInt(p[0], 10), mo = parseInt(p[1], 10) - 1, days = new Date(y, mo + 1, 0).getDate(), t = today();
    var dates = [];
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + ('0' + (mo + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
      dates.push({ ds: ds, fri: new Date(y, mo, d).getDay() === 5 });
    }
    var hol = office.holidays || [];
    return employees.map(function (e, i) {
      var pr = 0, ab = 0, la = 0, key = String(e.empId).trim().toLowerCase();
      dates.forEach(function (dt) {
        var isHol = dt.fri || hol.some(function (h) { h = String(h || '').trim(); return h && (h.indexOf(dt.ds) > -1); });
        var inRec = records.filter(function (r) { return String(r.empId).trim().toLowerCase() === key && r.date === dt.ds; }).filter(function (r) { return r.type === 'Clock IN'; })[0];
        if (inRec) { pr++; if (lateMin(inRec.time, office.officeInTime, office.maxLateMinutes) > 0) la++; }
        else if (dt.ds <= t && !isHol) ab++;
      });
      var tot = pr + ab, c = sanitize(e.name, e.empId);
      return { sl: i + 1, name: c.name || e.name, empId: c.empId || e.empId, designation: e.designation || '-', department: e.department || '', photoUrl: e.photoUrl || '', present: pr, absent: ab, late: la, attendanceRate: tot > 0 ? Math.round(pr / tot * 100) : 0 };
    });
  }
  function writeSummary(monthKey, rows) {
    var data = (rows || []).map(function (s, i) {
      var c = sanitize(s.name, s.empId);
      return {
        month_key: monthKey, emp_id: c.empId || String(s.empId || ('SCS-' + (101 + i))), sl_no: Number(s.sl) || i + 1, name: c.name || String(s.name || ''),
        designation: String(s.designation || '-'), department: String(s.department || ''), photo_url: /^data:/.test(s.photoUrl || '') ? '' : String(s.photoUrl || ''),
        present: Number(s.present) || 0, absent: Number(s.absent) || 0, late_days: Number(s.late) || 0,
        attendance_rate: (s.attendanceRate !== undefined ? String(s.attendanceRate).replace('%', '') : '0') + '%',
        updated_at: new Date().toISOString(), updated_by: SCS.me ? SCS.me.id : null
      };
    });
    var seen = {}; data = data.filter(function (r) { if (seen[r.emp_id]) return false; seen[r.emp_id] = 1; return true; });
    var keep = data.map(function (r) { return r.emp_id; });
    return (data.length ? q(sb().from('att_monthly_summary').upsert(data)) : Promise.resolve()).then(function () {
      var del = sb().from('att_monthly_summary').delete().eq('month_key', monthKey);
      if (keep.length) del = del.not('emp_id', 'in', '(' + keep.map(function (k) { return '"' + k.replace(/"/g, '') + '"'; }).join(',') + ')');
      return q(del);
    });
  }
  /** যেসব মাসের রেকর্ড বদলেছে সেগুলোর সামারি আবার হিসাব করে শেয়ার্ড টেবিলে লেখা */
  function refreshSummaries(months) {
    months = (months || []).filter(function (m, i, a) { return /^\d{4}-\d{2}$/.test(m) && a.indexOf(m) === i; });
    if (!months.length) return Promise.resolve();
    return Promise.all([selectAll('att_employees', 'sort_order'), readSettings()]).then(function (r) {
      var emps = r[0].filter(function (e) { return e.active !== false; }).map(empFromDb), s = r[1], office = officeFrom(s);
      return inChunks(months, 1, function (part) {
        var mk = part[0];
        return q(sb().from('att_records').select('emp_id, date, type, time').like('date', mk + '-%').limit(20000)).then(function (recs) {
          return writeSummary(mk, computeSummary(mk, emps, recs.map(recFromDb), office));
        });
      });
    }).catch(function (e) { console.warn('Summary refresh failed', e); });
  }
  function officeFrom(s) {
    var o = s.office || {};
    var hol = o.holidays;
    if (typeof hol === 'string') hol = hol ? hol.split(',') : [];
    return { officeInTime: o.officeInTime || '09:00', officeOutTime: o.officeOutTime || '17:00', maxLateMinutes: String(o.maxLateMinutes || '15'), holidays: Array.isArray(hol) ? hol : [] };
  }

  /* ================================================================ API */
  var B = {};

  B.getInitialData = function () {
    return Promise.all([selectAll('att_employees', 'sort_order'), selectAll('att_records', 'id'), readSettings()]).then(function (r) {
      var s = r[2], drive = s.drive || {}, live = s.liveExport || {};
      return {
        success: true,
        employees: r[0].filter(function (e) { return e.active !== false; }).map(empFromDb),
        attendance: r[1].map(recFromDb),
        officeSetup: officeFrom(s),
        driveSetup: { folderId: drive.folderId || '', folderUrl: drive.folderUrl || '' },
        // শেয়ার্ড টেবিলে অটো সিঙ্ক সবসময় চালু
        liveExportSetup: { sheetUrl: SHARED_URL, sheetId: 'att_monthly_summary', autoSync: live.autoSync !== false, lastStatus: 'idle' },
        liveExportSheetUrl: SHARED_URL
      };
    }).catch(function (e) { return { success: false, error: SCS.err(e) }; });
  };

  B.saveAttendanceRecord = function (record) {
    var row = recToDb(record || {});
    if (!row.id) row.id = 'att-' + Date.now() + '-' + SCS.shortId();
    return q(sb().from('att_records').insert(row)).then(function () {
      return refreshSummaries([row.date.slice(0, 7)]);
    }).then(function () { return { status: 'success' }; });
  };

  /** অ্যাডমিন প্যানেল পুরো লিস্ট পাঠায় — আমরা শুধু পার্থক্যটুকু সেভ করি */
  B.updateAttendanceList = function (records) {
    needAdmin();
    var incoming = (records || []).filter(function (r) { return r && r.id; }).map(recToDb);
    return selectAll('att_records', 'id').then(function (cur) {
      var curMap = {}, inMap = {}, ups = [], dels = [], months = {};
      cur.forEach(function (c) { curMap[c.id] = c; });
      incoming.forEach(function (r) {
        inMap[r.id] = 1;
        var c = curMap[r.id];
        if (!c || !same(c, r, REC_FIELDS)) { ups.push(r); months[r.date.slice(0, 7)] = 1; if (c) months[String(c.date).slice(0, 7)] = 1; }
      });
      cur.forEach(function (c) { if (!inMap[c.id]) { dels.push(c.id); months[String(c.date).slice(0, 7)] = 1; } });
      return inChunks(ups, 500, function (part) { return q(sb().from('att_records').upsert(part)); })
        .then(function () { return inChunks(dels, 200, function (part) { return q(sb().from('att_records').delete().in('id', part)); }); })
        .then(function () { return refreshSummaries(Object.keys(months)); });
    }).then(function () { return { status: 'success' }; });
  };

  /**
   * SCS Management অ্যাকাউন্ট থেকে আসা এমপ্লয়ি (user_id আছে): নাম, মোবাইল, ছবি ও Employee ID
   * সবসময় প্রোফাইল থেকে আসে — এখানে বদলানো যায় না, মুছাও যায় না (Admin Console এ অ্যাকাউন্ট বন্ধ করতে হয়)।
   * পদবি, বিভাগ ও ক্রম এখান থেকে বদলানো যায়।
   */
  B.updateEmployeeList = function (employees) {
    needAdmin();
    var incoming = (employees || []).map(empToDb);
    return selectAll('att_employees', 'sort_order').then(function (cur) {
      var curMap = {}, inMap = {}, ups = [], dels = [], kept = [];
      cur = cur.filter(function (c) { return c.active !== false; });
      cur.forEach(function (c) { curMap[c.id] = c; });
      incoming.forEach(function (e) {
        inMap[e.id] = 1;
        var c = curMap[e.id];
        if (c && c.user_id) { e.name = c.name; e.mobile = c.mobile; e.photo_url = c.photo_url; e.emp_id = c.emp_id; }
        if (!c || !same(c, e, EMP_FIELDS)) ups.push(e);
      });
      cur.forEach(function (c) { if (!inMap[c.id]) { if (c.user_id) kept.push(c.name); else dels.push(c.id); } });
      if (kept.length && SCS.toast) SCS.toast(SCS.t(kept.join(', ') + ' has an SCS account and was not deleted. Disable the account in Admin Console instead.', kept.join(', ') + ' এর SCS অ্যাকাউন্ট আছে, তাই মুছা হয়নি। Admin Console থেকে অ্যাকাউন্ট বন্ধ করুন।'));
      return inChunks(ups, 200, function (part) { return q(sb().from('att_employees').upsert(part)); })
        .then(function () { return inChunks(dels, 200, function (part) { return q(sb().from('att_employees').delete().in('id', part)); }); })
        .then(function () { return refreshSummaries([today().slice(0, 7)]); });
    }).then(function () { return { status: 'success' }; });
  };

  B.updateOfficeSettings = function (officeSetup) {
    needAdmin();
    var o = officeSetup || {};
    return writeSetting('office', {
      officeInTime: o.officeInTime || '09:00', officeOutTime: o.officeOutTime || '17:00', maxLateMinutes: String(o.maxLateMinutes || '15'),
      holidays: Array.isArray(o.holidays) ? o.holidays : (o.holidays ? String(o.holidays).split(',') : [])
    }).then(function () { return refreshSummaries([today().slice(0, 7)]); }).then(function () { return { status: 'success' }; });
  };

  B.updateDriveSettings = function (driveSetup) {
    needAdmin();
    var d = driveSetup || {};
    return writeSetting('drive', { folderId: d.folderId || '', folderUrl: d.folderUrl || '' }).then(function () { return { status: 'success' }; });
  };

  B.updateLiveExportSetup = function (liveExportSetup) {
    needAdmin();
    var l = liveExportSetup || {};
    return writeSetting('liveExport', { autoSync: l.autoSync !== false }).then(function () { return { status: 'success' }; });
  };

  /** অ্যাপ নিজে হিসাব করা মাসিক সামারি পাঠায় -> শেয়ার্ড টেবিলে (Monthly Report পড়বে) */
  B.exportLiveSummaryToSheet = function (sheetUrl, monthStr, summaryData) {
    var mk = /^\d{4}-\d{2}$/.test(String(monthStr || '')) ? String(monthStr) : today().slice(0, 7);
    var p = (Array.isArray(summaryData) && summaryData.length) ? writeSummary(mk, summaryData) : refreshSummaries([mk]);
    return p.then(function () {
      var label = new Date(mk + '-01T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
      return { success: true, sheetName: 'att_monthly_summary', sheetUrl: SHARED_URL, month: label, lastUpdated: SCS.fmt(new Date(), 'yyyy-MM-dd HH:mm'), rowCount: (summaryData || []).length };
    }).catch(function (e) { return { success: false, error: SCS.err(e) }; });
  };

  /** সব মাসের সামারি নতুন করে তৈরি (ডাটা ইমপোর্টের পর) */
  B.rebuildAllSummaries = function () {
    return selectAll('att_records', 'id').then(function (recs) {
      var months = recs.map(function (r) { return String(r.date).slice(0, 7); });
      return refreshSummaries(months).then(function () { return months.filter(function (m, i, a) { return /^\d{4}-\d{2}$/.test(m) && a.indexOf(m) === i; }).length; });
    });
  };

  window.SCS_BACKEND = B;
})();
