import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ───────── Firebase 설정 (헌혈폼과 동일 프로젝트, 별도 노드 사용) ───────── */
const firebaseConfig = {
  apiKey: "AIzaSyBpFEPL0IwuBzck9eOvinD5TjDMyjHNGF0",
  authDomain: "pcdcform1.firebaseapp.com",
  databaseURL: "https://pcdcform1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pcdcform1",
  storageBucket: "pcdcform1.firebasestorage.app",
  messagingSenderId: "955693703369",
  appId: "1:955693703369:web:7d110be6d3dfa78b6b6d18",
  measurementId: "G-SZ61VT73SS"
};
const ROOT = "fast2026";           // ← 금식기도 전용 데이터 노드
const CONFIGURED = !firebaseConfig.apiKey.startsWith("YOUR");
const ADMIN_PW = "dream2026";
const DEFAULT_CAP = 5;             // 타임별 기본 마감인원
const MAX_CAP = 10;                // 관리자가 올릴 수 있는 최대

/* ── 기도 기간: 2026/7/1 ~ 7/15 ── */
const YEAR = 2026, MONTH = 7;      // 7월
const START_DAY = 1, END_DAY = 15;
const DOW = ["일","월","화","수","목","금","토"];
const DAYS = (()=>{
  const arr=[];
  for(let d=START_DAY; d<=END_DAY; d++){
    const dt = new Date(YEAR, MONTH-1, d);
    arr.push({ dom:d, key:String(MONTH).padStart(2,"0")+String(d).padStart(2,"0"),
               dow:DOW[dt.getDay()], dowIdx:dt.getDay(), md:`${MONTH}/${d}` });
  }
  return arr;
})();
const TIMES = [
  { k:"m", label:"아침", icon:"🌅" },
  { k:"l", label:"점심", icon:"☀️" },
  { k:"d", label:"저녁", icon:"🌙" }
];
function slotKey(dayKey, timeK){ return dayKey + "_" + timeK; }

/* ── 상태 ── */
let db, slotsRef;
let slots = {};   // { "0701_m": { cap, count, entries:{fbKey:{name,createdAt}} } }
let view = "form";
let saving = false;
let submitted = null;
let form = { name:"", phone:"", day:"", time:"" };
let errors = {};
let copyDay = DAYS[0].key;
let scheduleMode = "cal";   // "cal"=달력 / "list"=일자별

/* ── 신청 변경/취소 상태 ── */
let manageName = "";        // 조회한 이름
let managePhone = "";       // 조회한 휴대폰 뒤 4자리
let manageSearched = false; // 조회 버튼을 눌렀는지
let manageEdit = null;      // 변경 중인 신청 { slotKey, fbKey, name, dayKey, timeK }
let editPick = { day:"", time:"" };  // 변경할 새 날짜/시간
let manageErr = "";

function slotCap(sk){ const s=slots[sk]; return (s&&s.cap)?s.cap:DEFAULT_CAP; }
function slotEntries(sk){ const s=slots[sk]; return (s&&s.entries)?s.entries:{}; }
function slotNames(sk){ return Object.values(slotEntries(sk)).map(e=>e.name); }
function slotCount(sk){ return slotNames(sk).length; }
function isFull(sk){ return slotCount(sk) >= slotCap(sk); }

/* ───────── 렌더 ───────── */
function render(){
  const app = document.getElementById("app");
  if(!CONFIGURED){ app.innerHTML = "Firebase 설정이 필요합니다."; return; }
  if(view==="form")     app.innerHTML = renderHeader() + renderTabs("form") + renderForm();
  if(view==="schedule") app.innerHTML = renderHeader() + renderTabs("schedule") + renderSchedule();
  if(view==="manage")   app.innerHTML = renderHeader() + renderManage();
  if(view==="success")  app.innerHTML = renderHeader() + renderSuccess();
  if(view==="admin")    app.innerHTML = renderAdmin();
  bindEvents();
}

function renderHeader(){
  return `
<div class="header">
  <div class="cross-wrap">
    <svg width="58" height="58" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="dreamBg" cx="50%" cy="36%" r="68%">
          <stop offset="0%" stop-color="#6aa6ff"/>
          <stop offset="55%" stop-color="#2d6cdf"/>
          <stop offset="100%" stop-color="#1a4ea3"/>
        </radialGradient>
        <linearGradient id="dreamCross" x1="32" y1="13" x2="32" y2="51" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#d4e4ff"/>
        </linearGradient>
        <filter id="dreamGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.6"/>
        </filter>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#dreamBg)"/>
      <circle cx="32" cy="32" r="30" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1.4"/>
      <g stroke="#ffffff" stroke-opacity="0.16" stroke-width="2.2" stroke-linecap="round">
        <line x1="32" y1="7"  x2="32" y2="13"/>
        <line x1="32" y1="51" x2="32" y2="57"/>
        <line x1="7"  y1="32" x2="13" y2="32"/>
        <line x1="51" y1="32" x2="57" y2="32"/>
      </g>
      <g filter="url(#dreamGlow)" opacity="0.45">
        <rect x="28.5" y="15" width="8" height="36" rx="3" fill="#0c2f6b"/>
        <rect x="15" y="28.5" width="36" height="8" rx="3" fill="#0c2f6b"/>
      </g>
      <rect x="28" y="14" width="8" height="36" rx="3" fill="url(#dreamCross)"/>
      <rect x="14" y="28" width="36" height="8" rx="3" fill="url(#dreamCross)"/>
      <rect x="29.4" y="15.5" width="2.2" height="14" rx="1.1" fill="#ffffff" opacity="0.55"/>
    </svg>
  </div>
  <div class="form-title">국내단기선교 릴레이 금식기도</div>
  <div class="form-desc">선교를 앞두고 7/1(수)~7/15(수) 릴레이 금식기도로<br>
  함께 준비합니다.<br>
  선교 일정 : 7/16~19 (3박 4일)</div>
  <div class="notice-box">
    <div class="ni"><span class="mk">※</span><span>매일 <b>아침·점심·저녁</b> 시간대에 참여합니다.</span></div>
    <div class="ni"><span class="mk">※</span><span><b>동일 시간대 ${DEFAULT_CAP}명 이내</b>로, 모든 성도님이 한 번씩 참여하실 수 있도록 부탁드립니다.</span></div>
    <div class="ni"><span class="mk">※</span><span>신청 후에는 아래 <b>‘전체 일정표’</b>에서 확인할 수 있습니다.</span></div>
  </div>
</div>`;
}

function renderTabs(active){
  return `
<div class="tabs">
  <button class="tab${active==="form"?" on":""}" data-tab="form">✍️ 금식 신청</button>
  <button class="tab${active==="schedule"?" on":""}" data-tab="schedule">📅 전체 일정표</button>
</div>`;
}

function renderForm(){
  const e = errors;
  const dayBtns = DAYS.map(d=>{
    const on = form.day===d.key;
    const dowCls = d.dowIdx===0?"sun":d.dowIdx===6?"sat":"";
    return `<button class="day-btn${on?" on":""}" data-day="${d.key}">
      <div class="day-dom">${d.dom}</div>
      <div class="day-dow ${dowCls}">${d.dow}</div>
    </button>`;
  }).join("");

  let timeBlock;
  if(!form.day){
    timeBlock = `<div class="pick-hint">먼저 날짜를 선택해 주세요.</div>`;
  } else {
    timeBlock = `<div class="time-grid">` + TIMES.map(t=>{
      const sk = slotKey(form.day, t.k);
      const cnt = slotCount(sk), cap = slotCap(sk), full = isFull(sk), on = form.time===t.k;
      return `<button class="time-btn${full?" full":""}${on?" on":""}" data-time="${t.k}" ${full?"disabled":""}>
        <div class="time-icon">${t.icon}</div>
        <div class="time-name">${t.label}</div>
        ${full ? `<div class="time-closed">마감 ${cnt}/${cap}</div>`
               : `<div class="time-remain">잔여 ${cap-cnt}명</div>`}
      </button>`;
    }).join("") + `</div>`;
  }

  const selDay = DAYS.find(d=>d.key===form.day);
  const selBadge = (form.day && form.time)
    ? `<span class="selected-badge">${selDay.md}(${selDay.dow}) ${TIMES.find(t=>t.k===form.time).label} 선택됨</span>` : "";

  return `
<div class="card">
  <div class="field">
    <div class="label">이름 <span class="req">*</span></div>
    <input id="f-name" class="input${e.name?" err":""}" value="${form.name}" placeholder="성함을 입력해 주세요" maxlength="20"/>
    ${e.name?`<div class="err-msg">${e.name}</div>`:""}
  </div>
  <div class="field">
    <div class="label">휴대폰 번호 뒤 4자리 <span class="req">*</span></div>
    <input id="f-phone" class="input${e.phone?" err":""}" value="${form.phone}" placeholder="예) 1234"
      inputmode="numeric" maxlength="4"/>
    <div style="font-size:12px;color:#98a2b3;margin-top:5px;">신청 변경·취소 시 본인 확인에 사용됩니다.</div>
    ${e.phone?`<div class="err-msg">${e.phone}</div>`:""}
  </div>
</div>

<div class="card">
  <div class="section-label">금식 날짜 <span class="req">*</span></div>
  <div class="day-grid">${dayBtns}</div>
  ${e.day?`<div class="err-msg" style="margin-top:7px;">${e.day}</div>`:""}
</div>

<div class="card">
  <div class="section-label">금식 시간대 <span class="req">*</span> ${selBadge}</div>
  ${timeBlock}
  ${e.time?`<div class="err-msg" style="margin-top:7px;">${e.time}</div>`:""}
</div>

${e.submit?`<div class="err-banner">${e.submit}</div>`:""}

<button class="submit-btn" id="btn-submit" ${saving?"disabled":""}>
  🙏 ${saving?"저장 중...":"금식기도 신청하기"}
</button>

<div class="admin-link-wrap" style="margin-top:1.1rem;">
  <button class="admin-link" id="go-manage" style="color:#2d6cdf;">📝 이미 신청하셨나요? 신청 날짜 변경 / 취소</button>
</div>

<div class="admin-link-wrap" style="margin-top:.7rem;"><button class="admin-link" id="go-admin">관리자 페이지</button></div>`;
}

function renderSuccess(){
  const e = submitted;
  const changed = !!(e && e.changed);
  return `
<div class="success-wrap">
  <div class="success-icon">${changed?"🔄":"🙏"}</div>
  <div class="success-title">${changed?"신청 일정이 변경되었습니다.":"금식기도 신청이 완료되었습니다."}</div>
  <div class="success-desc">${changed?"변경된 일정으로 함께 기도해 주세요.":"선교를 위한 거룩한 헌신에 함께해 주셔서 감사합니다."}</div>
  ${e?`<div class="receipt">
    <strong>이름</strong> : ${e.name}<br>
    <strong>${changed?"변경된 날짜":"날짜"}</strong> : ${e.md} (${e.dow})<br>
    <strong>시간대</strong> : ${e.timeLabel}
  </div>`:""}
  <button class="reset-btn" id="btn-reset">처음으로</button>
  <div class="admin-link-wrap"><button class="admin-link" id="go-schedule2" style="color:#2d6cdf;">전체 일정표 보기</button></div>
</div>`;
}

/* ── 공개 일정표 (달력 + 일자별) ── */
function renderSchedule(){
  const toggle = `
<div class="view-toggle">
  <button data-smode="cal"${scheduleMode==="cal"?" on":""}>📅 달력 보기</button>
  <button data-smode="list"${scheduleMode==="list"?" on":""}>📋 일자별 보기</button>
</div>`;

  const body = scheduleMode==="list" ? renderScheduleList() : renderScheduleCal();

  return `
<div class="card">
  <div class="cal-title">2026년 7월 국내단기선교<br>릴레이 금식기도 일정표</div>
  <div class="cal-sub">7/1(수) ~ 7/15(수) · 한 타임 ${DEFAULT_CAP}명 이내</div>
  ${toggle}
  ${body}
  <div class="legend">✓ = 정원 마감 · 빈칸(-)은 아직 신청자가 없는 시간대입니다.</div>
  <div class="no-print" style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
    <button id="btn-pdf" style="padding:9px 18px;background:#c0392b;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">📄 일정표 PDF 저장</button>
    <button id="btn-print" style="padding:9px 18px;background:#475467;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">🖨️ 인쇄 미리보기</button>
  </div>
  <div class="no-print" style="font-size:11.5px;color:#98a2b3;margin-top:8px;text-align:center;line-height:1.6;">
    <b>PDF 저장</b>은 휴대폰에서도 바로 동작합니다. (A4 가로 한 장)<br>
    인쇄 미리보기는 별도 창에서 인쇄·PDF 저장이 가능합니다.
  </div>
</div>`;
}

/* ── 달력 보기 ── */
function renderScheduleCal(){
  const firstDow = new Date(YEAR, MONTH-1, START_DAY).getDay();
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push(null);
  DAYS.forEach(d=>cells.push(d));
  while(cells.length % 7 !== 0) cells.push(null);

  let rows = "";
  for(let r=0; r<cells.length/7; r++){
    let tds = "";
    for(let c=0;c<7;c++){
      const d = cells[r*7+c];
      if(!d){ tds += `<td class="empty"></td>`; continue; }
      const dowCls = d.dowIdx===0?"sun":d.dowIdx===6?"sat":"";
      const slotLines = TIMES.map(t=>{
        const sk = slotKey(d.key, t.k);
        const names = slotNames(sk), cap = slotCap(sk), full = names.length>=cap;
        const namesHtml = names.length
          ? `<div class="cal-names">${names.map((n,i)=>`<span class="cal-name">${n}${i<names.length-1?",":""}</span>`).join(" ")}</div>`
          : `<div class="cal-empty-names">-</div>`;
        return `<div class="cal-slot"><span class="tlab${full?" full":""}">${t.label}${full?" ✓":` (${names.length}/${cap})`}</span>${namesHtml}</div>`;
      }).join("");
      tds += `<td><div class="cal-daynum ${dowCls}">${d.dom}</div>${slotLines}</td>`;
    }
    rows += `<tr>${tds}</tr>`;
  }

  return `
  <div class="cal-scroll">
    <table class="cal">
      <thead><tr>
        <th class="sun">일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th class="sat">토</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/* ── 일자별 보기 ── */
function renderScheduleList(){
  return DAYS.map(d=>{
    const dowCls = d.dowIdx===0?"sun":d.dowIdx===6?"sat":"";
    const rows = TIMES.map(t=>{
      const sk = slotKey(d.key, t.k);
      const names = slotNames(sk), cap = slotCap(sk), full = names.length>=cap;
      const namesHtml = names.length
        ? `<div class="tnames">${names.join(", ")}</div>`
        : `<div class="tnames empty">아직 신청자가 없습니다</div>`;
      return `<div class="day-row">
        <div class="ticon">${t.icon}</div>
        <div class="tinfo">
          <span class="tname${full?" full":""}">${t.label}${full?" ✓ 마감":""}</span><span class="tcount">${names.length}/${cap}</span>
          ${namesHtml}
        </div>
      </div>`;
    }).join("");
    return `<div class="day-card">
      <div class="day-card-head"><span class="dnum ${dowCls}">${d.md}</span><span class="dlabel">${d.dow}요일</span></div>
      ${rows}
    </div>`;
  }).join("");
}

/* ── 앱 내 브라우저(카카오톡/네이버 등) 감지 ── */
function isInAppBrowser(){
  const ua = navigator.userAgent || "";
  if(/KAKAOTALK|NAVER|Instagram|FB_IAB|FBAN|FBAV|Line\/|Daum|everytime|wadiz/i.test(ua)) return true;
  // 안드로이드 인앱 웹뷰(; wv) 표식
  if(/Android/i.test(ua) && /; wv\)/i.test(ua)) return true;
  return false;
}

/* ── 앱 내 브라우저 안내(외부 브라우저로 열기 + 주소 복사) ── */
function guideExternalBrowser(what){
  const url = location.href;
  let m = document.getElementById("ext-guide");
  if(!m){
    m = document.createElement("div");
    m.id = "ext-guide";
    m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;";
    document.body.appendChild(m);
  }
  m.innerHTML = `<div style="background:#fff;border-radius:14px;padding:1.5rem 1.4rem;max-width:340px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);">
    <div style="font-size:30px;margin-bottom:8px;">📱</div>
    <div style="font-size:16px;font-weight:700;margin-bottom:8px;line-height:1.4;">앱 안의 브라우저에서는<br>${what||"저장"}이 제한됩니다</div>
    <div style="font-size:13px;color:#667085;line-height:1.7;margin-bottom:13px;">
      카카오톡·네이버 등 <b>앱 안에서 열린 화면</b>에서는 파일 저장·인쇄가 막혀 있습니다.<br>
      아래 주소를 복사해 <b>크롬(Chrome)</b>이나 <b>사파리(Safari)</b>에서 열어 주세요.
    </div>
    <div style="font-size:12px;background:#f5f7fa;border:1px solid #e7edf3;border-radius:8px;padding:8px;word-break:break-all;color:#475467;margin-bottom:12px;">${url}</div>
    <button id="eg-copy" style="width:100%;padding:11px;background:#2d6cdf;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px;">🔗 주소 복사하기</button>
    <button id="eg-close" style="width:100%;padding:9px;background:#f5f5f5;border:none;border-radius:9px;font-size:13px;cursor:pointer;color:#888;font-family:inherit;">닫기</button>
  </div>`;
  m.style.display = "flex";
  m.querySelector("#eg-copy").onclick = async ()=>{
    try{ await navigator.clipboard.writeText(url); alert("주소가 복사되었습니다.\n크롬 / 사파리 주소창에 붙여넣어 열어 주세요."); }
    catch(_){ const ta=document.createElement("textarea"); ta.value=url; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); alert("주소가 복사되었습니다."); }
  };
  m.querySelector("#eg-close").onclick = ()=>{ m.style.display="none"; };
  m.onclick = e=>{ if(e.target===m) m.style.display="none"; };
}

/* ── 인쇄 미리보기 (현재 화면 오버레이) ── */
function openPrintPreview(){
  let ov = document.getElementById("print-overlay");
  if(!ov){
    ov = document.createElement("div");
    ov.id = "print-overlay";
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div class="po-bar no-print">
      <button class="po-print">🖨️ 인쇄 / PDF 저장</button>
      <button class="po-close">닫기</button>
      <span>용지 <b>A4 · 가로</b> 권장. 버튼이 안 되면 브라우저 메뉴(공유 → 인쇄)를 이용하세요.</span>
    </div>
    <div class="po-sheet">
      <h1>2026년 7월 국내단기선교<br>릴레이 금식기도 일정표</h1>
      <div class="po-sub">7/1(수) ~ 7/15(수) · 한 타임 ${DEFAULT_CAP}명 이내</div>
      ${renderScheduleCal()}
    </div>`;
  document.body.classList.add("po-open");
  ov.style.display = "block";
  ov.scrollTop = 0;
  ov.querySelector(".po-close").onclick = ()=>{ ov.style.display="none"; document.body.classList.remove("po-open"); };
  ov.querySelector(".po-print").onclick = ()=>{
    if(isInAppBrowser()){ guideExternalBrowser("인쇄"); return; }
    window.print();
  };
}

/* ───────── 신청 변경 / 취소 ───────── */
function findEntries(name, phone4){
  const qn = name.trim(), qp = phone4.trim();
  const out = [];
  if(!qn || !qp) return out;
  DAYS.forEach(d=>TIMES.forEach(t=>{
    const sk = slotKey(d.key, t.k);
    Object.entries(slotEntries(sk)).forEach(([fbKey,e])=>{
      if(!e.name || e.name.trim()!==qn) return;
      // 뒤 4자리 일치(과거에 번호 없이 신청된 데이터는 이름만으로 허용)
      if(e.phone4 && e.phone4!==qp) return;
      out.push({ slotKey:sk, fbKey, name:e.name, dayKey:d.key, timeK:t.k });
    });
  }));
  return out;
}

function renderManage(){
  if(manageEdit) return renderManageEdit();

  const found = manageSearched ? findEntries(manageName, managePhone) : null;
  let results = "";
  if(found !== null){
    if(!found.length){
      results = `<div class="card"><div class="pick-hint" style="padding:18px;">'${manageName.trim()}' 님으로 일치하는 신청 내역이 없습니다.<br>이름과 휴대폰 번호 뒤 4자리를 신청 때와 동일하게 입력했는지 확인해 주세요.</div></div>`;
    } else {
      results = `<div style="font-size:13px;color:#667085;margin:2px 2px 10px;">총 <b>${found.length}건</b>의 신청이 있습니다. 변경하거나 취소할 신청을 선택해 주세요.</div>`
        + found.map(en=>{
          const d = DAYS.find(x=>x.key===en.dayKey);
          const tl = TIMES.find(t=>t.k===en.timeK);
          const dowCol = d.dowIdx===0?"#e0533d":d.dowIdx===6?"#3d72e0":"#1a1a1a";
          return `<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div>
              <div style="font-size:15px;font-weight:700;color:${dowCol};">${tl.icon} ${d.md}(${d.dow}) ${tl.label}</div>
              <div style="font-size:12.5px;color:#98a2b3;margin-top:2px;">신청자 ${en.name}</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="me-edit" data-sk="${en.slotKey}" data-key="${en.fbKey}" data-name="${en.name}" data-day="${en.dayKey}" data-time="${en.timeK}"
                style="padding:8px 12px;background:#2d6cdf;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">날짜 변경</button>
              <button class="me-cancel" data-sk="${en.slotKey}" data-key="${en.fbKey}" data-name="${en.name}" data-day="${en.dayKey}" data-time="${en.timeK}"
                style="padding:8px 12px;background:#fff;color:#d92d20;border:1px solid #f3b6b0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">신청 취소</button>
            </div>
          </div>`;
        }).join("");
    }
  }

  return `
<div class="card">
  <div class="field">
    <div class="label">이름</div>
    <input id="me-name" class="input" value="${manageName}" placeholder="신청 때 입력한 성함" maxlength="20"/>
  </div>
  <div class="field" style="margin-bottom:0;">
    <div class="label">휴대폰 번호 뒤 4자리</div>
    <div style="display:flex;gap:7px;">
      <input id="me-phone" class="input" value="${managePhone}" placeholder="예) 1234" inputmode="numeric" maxlength="4" style="flex:1;"/>
      <button id="me-search" class="reset-btn" style="white-space:nowrap;padding:11px 20px;">조회</button>
    </div>
    <div style="font-size:12px;color:#98a2b3;margin-top:7px;">신청할 때 입력한 이름과 휴대폰 뒤 4자리로 본인 확인합니다.</div>
  </div>
</div>
${results}
<div class="admin-link-wrap"><button class="admin-link" id="go-form3" style="color:#2d6cdf;">← 신청 폼으로 돌아가기</button></div>`;
}

function renderManageEdit(){
  const cur = manageEdit;
  const curD = DAYS.find(d=>d.key===cur.dayKey);
  const curT = TIMES.find(t=>t.k===cur.timeK);

  const dayBtns = DAYS.map(d=>{
    const on = editPick.day===d.key;
    const dowCls = d.dowIdx===0?"sun":d.dowIdx===6?"sat":"";
    return `<button class="day-btn${on?" on":""}" data-day="${d.key}">
      <div class="day-dom">${d.dom}</div>
      <div class="day-dow ${dowCls}">${d.dow}</div>
    </button>`;
  }).join("");

  let timeBlock;
  if(!editPick.day){
    timeBlock = `<div class="pick-hint">먼저 날짜를 선택해 주세요.</div>`;
  } else {
    timeBlock = `<div class="time-grid">` + TIMES.map(t=>{
      const sk = slotKey(editPick.day, t.k);
      const isCurrent = (sk===cur.slotKey);
      const cnt = slotCount(sk), cap = slotCap(sk);
      const full = (cnt>=cap) && !isCurrent;
      const on = editPick.time===t.k;
      return `<button class="time-btn${full?" full":""}${on?" on":""}" data-time="${t.k}" ${full?"disabled":""}>
        <div class="time-icon">${t.icon}</div>
        <div class="time-name">${t.label}</div>
        ${full ? `<div class="time-closed">마감 ${cnt}/${cap}</div>`
               : `<div class="time-remain">잔여 ${Math.max(0,cap-cnt)}명${isCurrent?" (현재)":""}</div>`}
      </button>`;
    }).join("") + `</div>`;
  }

  return `
<div class="card">
  <div style="font-size:14px;font-weight:700;margin-bottom:6px;">🔄 신청 변경</div>
  <div style="font-size:13px;color:#667085;line-height:1.6;">
    <b>${cur.name}</b> 님의 현재 신청<br>
    현재 일정 : <b style="color:#2d6cdf;">${curD.md}(${curD.dow}) ${curT.label}</b>
  </div>
</div>

<div class="card">
  <div class="section-label">변경할 날짜</div>
  <div class="day-grid">${dayBtns}</div>
</div>

<div class="card">
  <div class="section-label">변경할 시간대</div>
  ${timeBlock}
  ${manageErr?`<div class="err-msg" style="margin-top:7px;">${manageErr}</div>`:""}
</div>

<button class="submit-btn" id="me-save" ${saving?"disabled":""}>
  ✅ ${saving?"변경 중...":"이 일정으로 변경하기"}
</button>

<div class="admin-link-wrap"><button class="admin-link" id="me-back" style="color:#2d6cdf;">← 취소하고 목록으로</button></div>`;
}

/* ───────── 관리자 ───────── */
function renderAdmin(){
  let totalEntries=0, totalCap=0, fullSlots=0;
  DAYS.forEach(d=>TIMES.forEach(t=>{
    const sk=slotKey(d.key,t.k);
    totalEntries+=slotCount(sk); totalCap+=slotCap(sk); if(isFull(sk)) fullSlots++;
  }));
  const remain = totalCap-totalEntries;

  const dayCards = DAYS.map(d=>{
    const slots = TIMES.map(t=>{
      const sk=slotKey(d.key,t.k);
      const names=slotNames(sk), cap=slotCap(sk), entries=slotEntries(sk);
      const chips = Object.entries(entries).map(([fbKey,e])=>
        `<span class="adm-chip">${e.name}<button class="del-btn" data-sk="${sk}" data-key="${fbKey}">✕</button></span>`
      ).join("") || `<span style="color:#c4cbd6;font-size:12px;">없음</span>`;
      const full = names.length>=cap;
      return `<div class="adm-slot">
        <div class="adm-slot-top">
          <span class="adm-tname" style="color:${full?'#1d9d6f':'#5b6b85'};">${t.icon} ${t.label} ${names.length}/${cap}</span>
          <span class="adm-cap-wrap">
            <span style="font-size:10px;color:#98a2b3;">마감</span>
            <input type="number" class="cap-in" data-sk="${sk}" value="${cap}" min="1" max="${MAX_CAP}"/>
          </span>
        </div>
        <div class="adm-chips">${chips}</div>
      </div>`;
    }).join("");
    const dowCol = d.dowIdx===0?"#e0533d":d.dowIdx===6?"#3d72e0":"#1a1a1a";
    return `<div class="adm-day">
      <div class="adm-day-head" style="color:${dowCol};">${d.md} <span style="font-size:12px;font-weight:500;">(${d.dow})</span></div>
      <div class="adm-slots">${slots}</div>
    </div>`;
  }).join("");

  const copyOptions = DAYS.map(d=>`<option value="${d.key}"${copyDay===d.key?" selected":""}>${d.md} (${d.dow})</option>`).join("");

  return `
<div style="padding-bottom:2rem;">
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:1.25rem;">
    <div>
      <div style="font-size:17px;font-weight:700;">관리자 대시보드</div>
      <div style="font-size:13px;color:#98a2b3;margin-top:2px;">릴레이 금식기도 신청 현황</div>
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap;">
      <button id="btn-excel" style="padding:7px 12px;border:1px solid #1d6f42;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;font-family:inherit;color:#1d6f42;font-weight:500;">⬇ 엑셀</button>
      <button id="go-form" style="padding:7px 12px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;font-family:inherit;">신청 폼</button>
      <button id="go-schedule" style="padding:7px 12px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;font-family:inherit;">일정표</button>
      <button id="go-logout" style="padding:7px 12px;border:1px solid #ddd;border-radius:8px;background:#f5f5f5;font-size:13px;cursor:pointer;color:#999;font-family:inherit;">로그아웃</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:1.25rem;">
    <div style="background:#eaf1fb;border-radius:9px;padding:10px 13px;"><div style="font-size:12px;color:#185FA5;margin-bottom:3px;">총 신청</div><div style="font-size:24px;font-weight:700;color:#0C447C;">${totalEntries}</div></div>
    <div style="background:#eaf6ef;border-radius:9px;padding:10px 13px;"><div style="font-size:12px;color:#0F6E56;margin-bottom:3px;">전체 정원</div><div style="font-size:24px;font-weight:700;color:#085041;">${totalCap}</div></div>
    <div style="background:#FAEEDA;border-radius:9px;padding:10px 13px;"><div style="font-size:12px;color:#854F0B;margin-bottom:3px;">남은 자리</div><div style="font-size:24px;font-weight:700;color:#633806;">${remain}</div></div>
    <div style="background:#f3eafb;border-radius:9px;padding:10px 13px;"><div style="font-size:12px;color:#6b3aa0;margin-bottom:3px;">마감된 타임</div><div style="font-size:24px;font-weight:700;color:#4d2a73;">${fullSlots}/45</div></div>
  </div>

  <div class="card" style="margin-bottom:1.1rem;">
    <div style="font-size:13px;font-weight:600;margin-bottom:9px;">전체 마감인원 일괄 설정</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;">
      <span style="font-size:13px;color:#667085;">모든 타임 마감인원을</span>
      <input id="bulk-cap" type="number" value="${DEFAULT_CAP}" min="1" max="${MAX_CAP}"
        style="width:60px;padding:7px;border:1px solid #d7dde5;border-radius:8px;font-size:13px;text-align:center;font-family:inherit;"/>
      <span style="font-size:13px;color:#667085;">명으로</span>
      <button id="btn-bulk-cap" style="padding:7px 14px;background:#2d6cdf;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;font-weight:500;">일괄 적용</button>
    </div>
    <div style="font-size:12px;color:#98a2b3;margin-top:7px;">개별 타임은 아래 표의 마감 칸에서 바로 조정할 수 있습니다 (최대 ${MAX_CAP}명).</div>
  </div>

  <div class="card" style="margin-bottom:1.1rem;">
    <div style="font-size:13px;font-weight:600;margin-bottom:9px;">📋 단체방 공유용 텍스트 (일자별)</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;">
      <select id="copy-day" style="padding:7px 10px;border:1px solid #d7dde5;border-radius:8px;font-size:13px;font-family:inherit;">${copyOptions}</select>
      <button id="btn-copy-day" style="padding:7px 14px;background:#fee500;color:#3c1e1e;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;font-weight:600;">💬 카톡용 텍스트 복사</button>
    </div>
    <div id="copy-preview" style="white-space:pre-wrap;background:#f7f9fc;border:1px solid #e7edf3;border-radius:8px;padding:10px 12px;margin-top:9px;font-size:13px;color:#475467;line-height:1.7;"></div>
  </div>

  ${dayCards}
  <div style="font-size:12px;color:#98a2b3;margin-top:8px;">이름 옆 ✕ 를 누르면 해당 신청을 삭제합니다.</div>
</div>`;
}

/* ── 카톡용 텍스트 생성 ── */
function buildCopyText(dayKey){
  const d = DAYS.find(x=>x.key===dayKey);
  let txt = `🙏 [국내단기선교 금식기도]\n${d.md}(${d.dow}) 금식기도 명단\n`;
  TIMES.forEach(t=>{
    const sk=slotKey(dayKey,t.k);
    const names=slotNames(sk);
    txt += `\n${t.icon} ${t.label} : ${names.length?names.join(", "):"(신청 가능)"}`;
  });
  txt += `\n\n오늘도 선교를 위해 한 마음으로 기도해 주세요.`;
  return txt;
}

/* ───────── 이벤트 ───────── */
function bindEvents(){
  const $ = id => document.getElementById(id);

  if(view==="form" || view==="schedule"){
    document.querySelectorAll(".tab").forEach(b=>{
      b.onclick = ()=>{ view = b.dataset.tab; render(); };
    });
  }

  if(view==="schedule"){
    document.querySelectorAll(".view-toggle button").forEach(b=>{
      b.onclick = ()=>{ scheduleMode = b.dataset.smode; render(); };
    });
    const pb = $("btn-print");
    if(pb) pb.onclick = openPrintPreview;
    const pdfb = $("btn-pdf");
    if(pdfb) pdfb.onclick = downloadSchedulePdf;
  }

  if(view==="manage"){
    if(manageEdit){
      document.querySelectorAll(".day-btn").forEach(b=>{
        b.onclick = ()=>{ editPick.day=b.dataset.day; editPick.time=""; manageErr=""; render(); };
      });
      document.querySelectorAll(".time-btn:not(.full)").forEach(b=>{
        b.onclick = ()=>{ editPick.time=b.dataset.time; manageErr=""; render(); };
      });
      $("me-save").onclick = handleMove;
      $("me-back").onclick = ()=>{ manageEdit=null; manageErr=""; render(); };
    } else {
      const nameInput = $("me-name"), phoneInput = $("me-phone");
      nameInput.oninput = e=>{ manageName=e.target.value; };
      phoneInput.oninput = e=>{
        const v=e.target.value.replace(/\D/g,"").slice(0,4);
        managePhone=v; e.target.value=v;
      };
      const doSearch = ()=>{ manageSearched=true; render(); };
      $("me-search").onclick = doSearch;
      nameInput.onkeydown = e=>{ if(e.key==="Enter") doSearch(); };
      phoneInput.onkeydown = e=>{ if(e.key==="Enter") doSearch(); };

      document.querySelectorAll(".me-edit").forEach(b=>{
        b.onclick = ()=>{
          manageEdit = { slotKey:b.dataset.sk, fbKey:b.dataset.key, name:b.dataset.name,
                         dayKey:b.dataset.day, timeK:b.dataset.time };
          editPick = { day:b.dataset.day, time:b.dataset.time };
          manageErr=""; render();
        };
      });
      document.querySelectorAll(".me-cancel").forEach(b=>{
        b.onclick = async ()=>{
          const d=DAYS.find(x=>x.key===b.dataset.day), tl=TIMES.find(t=>t.k===b.dataset.time);
          if(!confirm(`${b.dataset.name} 님의 ${d.md}(${d.dow}) ${tl.label} 신청을 취소(삭제)할까요?`)) return;
          await runTransaction(ref(db, ROOT+"/slots/"+b.dataset.sk), (s)=>{
            if(!s) return s;
            const ents = { ...(s.entries||{}) };
            delete ents[b.dataset.key];
            return { ...s, entries: ents, count: Object.keys(ents).length };
          });
        };
      });
      $("go-form3").onclick = ()=>{ view="form"; render(); };
    }
  }

  if(view==="form"){
    $("f-name").oninput = e=>{ form.name=e.target.value; delete errors.name; };
    $("f-phone").oninput = e=>{
      const v=e.target.value.replace(/\D/g,"").slice(0,4);
      form.phone=v; e.target.value=v; delete errors.phone;
    };
    document.querySelectorAll(".day-btn").forEach(b=>{
      b.onclick = ()=>{ form.day=b.dataset.day; form.time=""; delete errors.day; render(); };
    });
    document.querySelectorAll(".time-btn:not(.full)").forEach(b=>{
      b.onclick = ()=>{ form.time=b.dataset.time; delete errors.time; render(); };
    });
    $("btn-submit").onclick = handleSubmit;
    $("go-admin").onclick = showLoginModal;
    $("go-manage").onclick = ()=>{ manageSearched=false; manageEdit=null; manageErr=""; managePhone=""; view="manage"; render(); };
  }

  if(view==="success"){
    $("btn-reset").onclick = ()=>{ form={name:"",phone:"",day:"",time:""}; errors={}; submitted=null; view="form"; render(); };
    const gs = $("go-schedule2"); if(gs) gs.onclick = ()=>{ view="schedule"; render(); };
  }

  if(view==="admin"){
    $("go-form").onclick = ()=>{ view="form"; render(); };
    $("go-schedule").onclick = ()=>{ view="schedule"; render(); };
    $("go-logout").onclick = ()=>{ view="form"; render(); };
    $("btn-excel").onclick = downloadExcel;

    $("btn-bulk-cap").onclick = async ()=>{
      const v = Math.max(1, Math.min(MAX_CAP, parseInt($("bulk-cap").value)||DEFAULT_CAP));
      if(!confirm(`모든 타임의 마감인원을 ${v}명으로 설정할까요?\n(이미 신청 인원이 더 많은 타임은 그 인원까지 유지됩니다)`)) return;
      for(const d of DAYS) for(const t of TIMES){
        await setCap(slotKey(d.key,t.k), v);
      }
    };

    document.querySelectorAll(".cap-in").forEach(inp=>{
      inp.onchange = ()=>{
        let v = Math.max(1, Math.min(MAX_CAP, parseInt(inp.value)||DEFAULT_CAP));
        setCap(inp.dataset.sk, v);
      };
    });

    document.querySelectorAll(".del-btn").forEach(b=>{
      b.onclick = async ()=>{
        if(!confirm("이 신청을 삭제할까요?")) return;
        await runTransaction(ref(db, ROOT+"/slots/"+b.dataset.sk), (s)=>{
          if(!s) return s;
          const ents = { ...(s.entries||{}) };
          delete ents[b.dataset.key];
          return { ...s, entries: ents, count: Object.keys(ents).length };
        });
      };
    });

    const copySel = $("copy-day");
    const updatePreview = ()=>{ $("copy-preview").textContent = buildCopyText(copyDay); };
    updatePreview();
    copySel.onchange = ()=>{ copyDay = copySel.value; updatePreview(); };
    $("btn-copy-day").onclick = async ()=>{
      const txt = buildCopyText(copyDay);
      try{ await navigator.clipboard.writeText(txt); alert("복사되었습니다.\n카카오톡 단체방에 붙여넣기 하세요."); }
      catch(_){ /* fallback */
        const ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta); alert("복사되었습니다.");
      }
    };
  }
}

async function setCap(sk, cap){
  await runTransaction(ref(db, ROOT+"/slots/"+sk), (s)=>{
    const data = s || { count:0, entries:{} };
    return { ...data, cap, count: Object.keys(data.entries||{}).length };
  });
}

/* ── 공통: 파일 저장(데스크톱) / 공유 시트(모바일) ── */
function isMobileDevice(){
  const coarse = window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
  return coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||"");
}
async function saveOrShareBlob(blob, filename){
  // 모바일: 네이티브 공유/저장 시트 (파일에 저장·공유 가능)
  if(isMobileDevice() && navigator.canShare){
    try{
      const file=new File([blob], filename, {type:blob.type});
      if(navigator.canShare({files:[file]})){
        await navigator.share({ files:[file], title:filename });
        return;
      }
    }catch(e){ if(e && e.name==="AbortError") return; /* 그 외엔 다운로드로 폴백 */ }
  }
  // 데스크톱 등: 일반 다운로드
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename; a.style.display="none";
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
}

/* ── 진행 표시 오버레이 ── */
function showBusy(msg){
  let o=document.getElementById("busy-overlay");
  if(!o){
    o=document.createElement("div");
    o.id="busy-overlay";
    o.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10000;display:flex;align-items:center;justify-content:center;";
    document.body.appendChild(o);
  }
  o.innerHTML=`<div style="background:#fff;border-radius:12px;padding:1.5rem 2rem;font-size:14px;color:#475467;box-shadow:0 12px 40px rgba(0,0,0,.25);">${msg||"처리 중..."}</div>`;
  o.style.display="flex";
}
function hideBusy(){ const o=document.getElementById("busy-overlay"); if(o) o.style.display="none"; }

/* ── 엑셀(CSV) 다운로드 ── */
async function downloadExcel(){
  if(isInAppBrowser()){ guideExternalBrowser("엑셀 저장"); return; }
  const BOM="﻿";
  const headers=["날짜","요일","시간대","이름","휴대폰뒤4자리","신청일시"];
  const rows=[];
  DAYS.forEach(d=>TIMES.forEach(t=>{
    const sk=slotKey(d.key,t.k);
    Object.values(slotEntries(sk)).forEach(e=>{
      rows.push([d.md, d.dow, t.label, e.name, e.phone4||"", e.createdAt||""]);
    });
  }));
  if(!rows.length){ alert("다운로드할 데이터가 없습니다."); return; }
  const csv=BOM+[headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  await saveOrShareBlob(blob, "릴레이금식기도_명단.csv");
}

/* ── 일정표 PDF 저장 (A4 가로 1장) ── */
async function downloadSchedulePdf(){
  if(isInAppBrowser()){ guideExternalBrowser("PDF 저장"); return; }
  showBusy("📄 PDF를 만드는 중입니다...");
  let stage=null;
  try{
    // 라이브러리는 클릭 시에만 CDN에서 로드 (평소 로딩 가볍게)
    const [h2cMod, jspdfMod] = await Promise.all([
      import("https://esm.sh/html2canvas@1.4.1"),
      import("https://esm.sh/jspdf@2.5.1")
    ]);
    const html2canvas = h2cMod.default;
    const jsPDF = jspdfMod.jsPDF;

    // 화면 밖에 인쇄용 노드를 만들어 캡처
    stage=document.createElement("div");
    stage.id="pdf-stage";
    stage.style.cssText="position:fixed;left:-10000px;top:0;width:1122px;background:#fff;padding:16px;";
    stage.innerHTML=`<style>${PDF_STAGE_CSS}</style>
      <h1>2026년 7월 국내단기선교 릴레이 금식기도 일정표</h1>
      <div class="sub">7/1(수) ~ 7/15(수) · 한 타임 ${DEFAULT_CAP}명 이내</div>
      ${renderScheduleCal()}`;
    document.body.appendChild(stage);

    const canvas=await html2canvas(stage, { scale:2, backgroundColor:"#ffffff", useCORS:true });
    document.body.removeChild(stage); stage=null;

    const pdf=new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
    const pageW=pdf.internal.pageSize.getWidth();   // 297
    const pageH=pdf.internal.pageSize.getHeight();  // 210
    const margin=5;
    const availW=pageW-margin*2, availH=pageH-margin*2;
    const ratio=Math.min(availW/canvas.width, availH/canvas.height);
    const w=canvas.width*ratio, h=canvas.height*ratio;
    const x=(pageW-w)/2, y=margin;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, w, h);

    const blob=pdf.output("blob");
    hideBusy();
    await saveOrShareBlob(blob, "릴레이금식기도_일정표.pdf");
  }catch(err){
    if(stage && stage.parentNode) stage.parentNode.removeChild(stage);
    hideBusy();
    alert("PDF 생성 중 오류가 발생했습니다.\n인터넷 연결을 확인한 뒤 다시 시도해 주세요.\n\n("+(err&&err.message?err.message:err)+")");
  }
}

/* PDF용 확대 스타일 (이름 크게) */
const PDF_STAGE_CSS = `
#pdf-stage{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#1a1a1a;}
#pdf-stage *{box-sizing:border-box;}
#pdf-stage h1{font-size:24px;font-weight:700;text-align:center;margin:0 0 5px;}
#pdf-stage .sub{text-align:center;font-size:14px;color:#888;margin-bottom:12px;}
#pdf-stage .cal-scroll{border:1px solid #999;border-radius:6px;overflow:hidden;}
#pdf-stage table.cal{border-collapse:collapse;width:100%;table-layout:fixed;}
#pdf-stage table.cal th{background:#5b6b85;color:#fff;font-size:16px;font-weight:700;padding:7px 0;text-align:center;}
#pdf-stage table.cal th.sun{color:#ffd0c8;}
#pdf-stage table.cal th.sat{color:#cfe0ff;}
#pdf-stage table.cal td{border:1px solid #999;vertical-align:top;height:120px;padding:0;}
#pdf-stage td.empty{background:#fafbfc;}
#pdf-stage .cal-daynum{font-size:17px;font-weight:700;padding:3px 7px 1px;}
#pdf-stage .cal-daynum.sun{color:#e0533d;}
#pdf-stage .cal-daynum.sat{color:#3d72e0;}
#pdf-stage .cal-slot{font-size:16px;line-height:1.3;padding:2px 7px 5px;border-top:1px dashed #ddd;}
#pdf-stage .cal-slot .tlab{display:block;font-size:12px;font-weight:700;color:#5b6b85;}
#pdf-stage .cal-slot .tlab.full{color:#1d9d6f;}
#pdf-stage .cal-names{color:#000;margin-top:1px;}
#pdf-stage .cal-name{display:inline-block;white-space:nowrap;font-size:18px;}
#pdf-stage .cal-empty-names{color:#bbb;}`;

/* ── 로그인 모달 ── */
function showLoginModal(){
  let modal=document.getElementById("login-overlay");
  if(!modal){
    modal=document.createElement("div");
    modal.id="login-overlay";
    modal.style.cssText="display:flex;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center;";
    modal.innerHTML=`
      <div style="background:#fff;border-radius:14px;padding:2rem 1.75rem;width:300px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="font-size:22px;margin-bottom:8px;">🔐</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:4px;">관리자 로그인</div>
        <div style="font-size:13px;color:#888;margin-bottom:1rem;">비밀번호를 입력해 주세요</div>
        <input id="ov-pw" type="password" placeholder="비밀번호"
          style="width:100%;padding:9px 12px;border:1.5px solid #d7dde5;border-radius:8px;font-size:15px;margin-bottom:8px;font-family:inherit;outline:none;"/>
        <div id="ov-err" style="font-size:12px;color:#d92d20;margin-bottom:8px;display:none;">비밀번호가 올바르지 않습니다.</div>
        <button id="ov-login" style="width:100%;padding:11px;background:#2d6cdf;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px;">로그인</button>
        <button id="ov-cancel" style="width:100%;padding:9px;background:#f5f5f5;border:none;border-radius:9px;font-size:13px;cursor:pointer;color:#888;font-family:inherit;">취소</button>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display="flex";
  const pw=document.getElementById("ov-pw"), err=document.getElementById("ov-err");
  pw.value=""; err.style.display="none"; setTimeout(()=>pw.focus(),50);
  function tryLogin(){
    if(pw.value===ADMIN_PW){ modal.style.display="none"; view="admin"; render(); }
    else { err.style.display="block"; pw.value=""; pw.focus(); }
  }
  document.getElementById("ov-login").onclick=tryLogin;
  document.getElementById("ov-cancel").onclick=()=>{ modal.style.display="none"; };
  pw.onkeydown=e=>{ if(e.key==="Enter") tryLogin(); };
  modal.onclick=e=>{ if(e.target===modal) modal.style.display="none"; };
}

/* ── 제출 ── */
async function handleSubmit(){
  const errs={};
  if(!form.name.trim()) errs.name="이름을 입력해 주세요.";
  if(!/^\d{4}$/.test(form.phone.trim())) errs.phone="휴대폰 번호 뒤 4자리(숫자)를 입력해 주세요.";
  if(!form.day) errs.day="금식 날짜를 선택해 주세요.";
  if(!form.time) errs.time="금식 시간대를 선택해 주세요.";
  if(Object.keys(errs).length){ errors=errs; render(); return; }

  saving=true; render();
  try{
    const sk=slotKey(form.day, form.time);
    const name=form.name.trim();
    const phone4=form.phone.trim();
    const newEntry={ name, phone4, createdAt:new Date().toLocaleString("ko-KR") };

    let txError=null;
    const txResult=await runTransaction(ref(db, ROOT+"/slots/"+sk), (s)=>{
      const data = s || { cap:DEFAULT_CAP, count:0, entries:{} };
      const cap = data.cap || DEFAULT_CAP;
      const ents = data.entries || {};
      if(Object.keys(ents).length >= cap){ txError="full"; return; }
      const fbKey="e"+Date.now()+Math.random().toString(36).slice(2,7);
      const next={ ...ents, [fbKey]:newEntry };
      return { cap, count:Object.keys(next).length, entries:next };
    });

    if(!txResult.committed){
      errors = txError==="full"
        ? { time:"방금 이 타임이 마감되었습니다. 다른 시간대를 선택해 주세요." }
        : { submit:"저장 중 오류가 발생했습니다. 다시 시도해 주세요." };
      saving=false; render(); return;
    }

    const d=DAYS.find(x=>x.key===form.day);
    submitted={ name, md:d.md, dow:d.dow, timeLabel:TIMES.find(t=>t.k===form.time).label };
    view="success";
  }catch(err){
    errors={submit:"저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."};
  }
  saving=false; render();
}

/* ── 신청 일정 변경(이동) ── */
async function handleMove(){
  if(!editPick.day || !editPick.time){ manageErr="변경할 날짜와 시간대를 모두 선택해 주세요."; render(); return; }
  const cur = manageEdit;
  const newSk = slotKey(editPick.day, editPick.time);
  if(newSk===cur.slotKey){ manageErr="현재와 동일한 일정입니다. 다른 날짜·시간대를 선택해 주세요."; render(); return; }

  saving=true; render();
  try{
    const entryData = slotEntries(cur.slotKey)[cur.fbKey]
      || { name:cur.name, createdAt:new Date().toLocaleString("ko-KR") };

    // 1) 새 타임에 추가 (정원 확인)
    let addErr=null;
    const addRes = await runTransaction(ref(db, ROOT+"/slots/"+newSk), (s)=>{
      const data = s || { cap:DEFAULT_CAP, count:0, entries:{} };
      const cap = data.cap || DEFAULT_CAP;
      const ents = data.entries || {};
      if(Object.keys(ents).length >= cap){ addErr="full"; return; }
      const newKey="e"+Date.now()+Math.random().toString(36).slice(2,7);
      const next={ ...ents, [newKey]:entryData };
      return { cap, count:Object.keys(next).length, entries:next };
    });

    if(!addRes.committed){
      manageErr = addErr==="full"
        ? "선택하신 시간대가 방금 마감되었습니다. 다른 시간대를 선택해 주세요."
        : "변경 중 오류가 발생했습니다. 다시 시도해 주세요.";
      saving=false; render(); return;
    }

    // 2) 기존 타임에서 제거
    await runTransaction(ref(db, ROOT+"/slots/"+cur.slotKey), (s)=>{
      if(!s) return s;
      const ents = { ...(s.entries||{}) };
      delete ents[cur.fbKey];
      return { ...s, entries: ents, count: Object.keys(ents).length };
    });

    const nd = DAYS.find(x=>x.key===editPick.day);
    submitted = { name:entryData.name, md:nd.md, dow:nd.dow,
                  timeLabel:TIMES.find(t=>t.k===editPick.time).label, changed:true };
    manageEdit=null; manageErr=""; view="success";
  }catch(err){
    manageErr="변경 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
  saving=false; render();
}

/* ── Firebase 초기화 ── */
if(CONFIGURED){
  const app=initializeApp(firebaseConfig);
  db=getDatabase(app);
  slotsRef=ref(db, ROOT+"/slots");
  onValue(slotsRef, snap=>{ slots = snap.val() || {}; render(); });
} else { render(); }
