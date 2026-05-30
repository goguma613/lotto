/* ======================================================
   효도 모드 로또 생성기 (어르신 맞춤형)
   ====================================================== */

   const CONFIG = { min: 1, max: 45, lsKey: 'lotto_silver_v1', drawsUrl: './data/draws.json' };

   // 상태 관리
   const state = {
       history: [],
       prefs: {
           avoidDup: true,
           fixed: [],
           excluded: [],
           seedMode: false,
           seed: 12345
       },
       rng: null,
       draws: [],       // 당첨번호 데이터 (회차 내림차순)
       drawsLoaded: false
   };

   // 요소 선택 편의 함수
   const $ = (sel) => document.querySelector(sel);

   // DOM 요소들
   const els = {
       setCount: $('#setCount'),
       btnMinus: $('.btn-step.minus'),
       btnPlus: $('.btn-step.plus'),
       checkBonus: $('#includeBonus'),
       btnDraw: $('#drawBtn'),
       btnReset: $('#resetBtn'),
       resultArea: $('#result'),

       // 하단 툴바
       btnCopy: $('#copyBtn'),
       btnSave: $('#saveBtn'),
       btnCheck: $('#checkBtn'),
       btnHistory: $('#historyToggleBtn'),

       // 히스토리 패널
       panelHistory: $('#historyPanel'),
       btnCloseHistory: $('#historyCloseBtn'),
       listHistory: $('#historyList'),
       btnClearHistory: $('#clearHistoryBtn'),

       // 당첨 확인 패널
       panelCheck: $('#checkPanel'),
       btnCloseCheck: $('#checkCloseBtn'),
       roundSelect: $('#roundSelect'),
       winNumbers: $('#winNumbers'),
       checkResults: $('#checkResults'),
       manualInputs: document.querySelectorAll('.manual-inputs .manual-num:not(.bonus)'),
       manualBonus: $('#manualBonus'),
       btnManualApply: $('#manualApplyBtn'),

       // 설정창
       chkAvoid: $('#chkAvoidHistory'),
       inpFixed: $('#inpFixed'),
       inpExcluded: $('#inpExcluded'),
       btnSeedToggle: $('#btnSeedToggle'),
       inpSeed: $('#inpSeed'),
       btnSavePrefs: $('#btnPrefsSave'),
       btnResetPrefs: $('#btnPrefsReset'),
   };

   document.addEventListener('DOMContentLoaded', () => {
       loadData();
       updateUIFromPrefs();
       bindEvents();
       if(state.prefs.seedMode) reseed(state.prefs.seed);

       // 이미지 저장 기능 준비
       if(!window.html2canvas) {
           const script = document.createElement('script');
           script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
           document.head.appendChild(script);
       }
   });

   function bindEvents() {
       // 1. 수량 조절 (1~10 제한)
       els.btnMinus.onclick = () => updateCount(-1);
       els.btnPlus.onclick = () => updateCount(1);

       // 2. 핵심 기능
       els.btnDraw.onclick = runDraw;
       els.btnReset.onclick = () => {
           if(confirm('화면의 번호를 모두 지울까요?')) {
               els.resultArea.innerHTML = '<div class="message">위 <strong>[번호 뽑기]</strong> 버튼을 눌러주세요</div>';
           }
       };

       // 3. 툴바 기능
       els.btnCopy.onclick = copyResult;
       els.btnSave.onclick = saveImage;
       els.btnCheck.onclick = openCheckPanel;
       els.btnHistory.onclick = () => {
           renderHistory();
           els.panelHistory.hidden = false;
       };
       els.btnCloseHistory.onclick = () => els.panelHistory.hidden = true;
       els.btnClearHistory.onclick = () => {
           if(confirm('기록을 정말 다 지우시겠습니까?')) {
               state.history = [];
               saveData();
               renderHistory();
               toast('기록이 삭제되었습니다.');
           }
       };

       // 4. 당첨 확인
       els.btnCloseCheck.onclick = () => els.panelCheck.hidden = true;
       els.roundSelect.onchange = () => renderSelectedRound();
       els.btnManualApply.onclick = applyManualNumbers;

       // 5. 설정 관련
       els.btnSeedToggle.onclick = () => {
           state.prefs.seedMode = !state.prefs.seedMode;
           updateUIFromPrefs();
       };
       els.btnSavePrefs.onclick = savePrefsFromUI;
       els.btnResetPrefs.onclick = resetPrefs;
   }

   // --- 로직 ---
   function updateCount(diff) {
       let cur = parseInt(els.setCount.value, 10) || 1;
       cur += diff;
       if (cur < 1) cur = 1;
       if (cur > 10) cur = 10;
       els.setCount.value = cur;
   }

   function getSecureRandom(min, max) {
       if (state.prefs.seedMode && state.rng) {
           return min + Math.floor(state.rng() * (max - min + 1));
       }
       const range = max - min + 1;
       const arr = new Uint32Array(1);
       let val;
       do {
           window.crypto.getRandomValues(arr);
           val = arr[0];
       } while (val >= Math.floor(0xFFFFFFFF / range) * range);
       return min + (val % range);
   }

   function seeder(a) {
       return function() {
           var t = a += 0x6D2B79F5;
           t = Math.imul(t ^ t >>> 15, t | 1);
           t ^= t + Math.imul(t ^ t >>> 7, t | 61);
           return ((t ^ t >>> 14) >>> 0) / 4294967296;
       }
   }
   function reseed(s) { state.rng = seeder(s); }

   // 한 게임의 고유 키 (정렬된 6개 번호)
   function setKey(mainArr) { return [...mainArr].sort((a,b)=>a-b).join('-'); }

   function drawOneMain() {
       const fixed = state.prefs.fixed || [];
       const excluded = state.prefs.excluded || [];
       let nums = new Set(fixed.filter(n => !excluded.includes(n)));

       let safety = 0;
       while(nums.size < 6 && safety++ < 500) {
           const n = getSecureRandom(CONFIG.min, CONFIG.max);
           if (!excluded.includes(n)) nums.add(n);
       }
       return [...nums].sort((a,b) => a-b).slice(0, 6);
   }

   function drawSet(withBonus, seenKeys) {
       const excluded = state.prefs.excluded || [];
       const avoid = state.prefs.avoidDup && seenKeys;

       let sorted = drawOneMain();
       // 이전에 나온 조합 피하기 (시드 모드일 때는 재현성을 위해 적용하지 않음)
       if (avoid && !state.prefs.seedMode) {
           let tries = 0;
           while (seenKeys.has(setKey(sorted)) && tries++ < 300) {
               sorted = drawOneMain();
           }
       }
       if (seenKeys) seenKeys.add(setKey(sorted));

       let bonus = null;
       if (withBonus) {
           let safety = 0;
           do {
               bonus = getSecureRandom(CONFIG.min, CONFIG.max);
           } while ((sorted.includes(bonus) || excluded.includes(bonus)) && safety++ < 100);
       }
       return { main: sorted, bonus };
   }

   function runDraw() {
       const count = parseInt(els.setCount.value, 10);
       const withBonus = els.checkBonus.checked;

       if(state.prefs.seedMode) reseed(state.prefs.seed);

       // 이전 기록의 조합들을 "이미 본 것"으로 등록 (중복 회피용)
       const seenKeys = new Set();
       state.history.forEach(h => (h.sets || []).forEach(s => seenKeys.add(setKey(s.main))));

       els.resultArea.innerHTML = '';
       const results = [];

       for(let i=0; i<count; i++) {
           const set = drawSet(withBonus, seenKeys);
           results.push(set);
           createResultRow(set, i);
       }

       addToHistory(results);

       setTimeout(() => {
          els.resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
       }, 100);
   }

   function createResultRow(set, index) {
       const row = document.createElement('div');
       row.className = 'lotto-set';
       row.setAttribute('aria-label', `${index+1}번째 게임 결과`);

       const container = document.createElement('div');
       container.className = 'ball-container';

       set.main.forEach((n) => container.appendChild(createBall(n)));

       if (set.bonus !== null) {
           container.appendChild(createBall(set.bonus, true));
       }

       row.appendChild(container);
       els.resultArea.appendChild(row);
   }

   function createBall(n, isBonus = false, isHit = false) {
       const b = document.createElement('div');
       b.className = `ball ${isBonus ? 'bonus' : ''} ${isHit ? 'hit' : ''}`.trim();
       b.textContent = n;

       // 색상 적용 (동행복권 공식 색 규칙)
       let colorVar = '--ball-1';
       if(n > 10) colorVar = '--ball-2';
       if(n > 20) colorVar = '--ball-3';
       if(n > 30) colorVar = '--ball-4';
       if(n > 40) colorVar = '--ball-5';

       b.style.backgroundColor = `var(${colorVar})`;
       return b;
   }

   /* ========== 당첨 확인 ========== */
   // 인터넷에서 자동 조회 (smok95/lotto 공개 데이터, raw.githubusercontent 는 CORS 허용)
   const REMOTE = {
       base: 'https://raw.githubusercontent.com/smok95/lotto/main/results/',
       baseRoundDate: Date.UTC(2002, 11, 7),   // 1회차 추첨일(토)
       week: 7 * 24 * 60 * 60 * 1000,
       recent: 6,                              // 드롭다운에 채울 최근 회차 수
       perRequestTimeout: 4000,                // 요청 1건 제한
       overallTimeout: 8000                    // 전체 로딩 상한 (멈춤 방지)
   };

   const validDraw = d => d && Array.isArray(d.numbers) && d.numbers.length === 6;
   const sortDesc = (a, b) => b.round - a.round;

   async function fetchRemoteRound(n) {
       const ctrl = new AbortController();
       const timer = setTimeout(() => ctrl.abort(), REMOTE.perRequestTimeout);
       try {
           const r = await fetch(REMOTE.base + n + '.json', { cache: 'no-store', signal: ctrl.signal });
           if (!r.ok) return null;
           const j = await r.json();
           if (!j || !Array.isArray(j.numbers) || j.numbers.length !== 6) return null;
           return { round: j.draw_no, date: (j.date || '').slice(0, 10), numbers: j.numbers, bonus: j.bonus_no };
       } catch (e) {
           return null;
       } finally {
           clearTimeout(timer);
       }
   }

   // 함께 배포된 번들 데이터 (오프라인/지연 시 기준선)
   async function loadLocalDraws() {
       try {
           const res = await fetch(CONFIG.drawsUrl, { cache: 'no-store' });
           if (res.ok) {
               const data = await res.json();
               if (Array.isArray(data)) return data.filter(validDraw).sort(sortDesc);
           }
       } catch (e) {}
       return [];
   }

   // 인터넷에서 최신 회차 자동 조회 (smok95/lotto, CORS 허용)
   async function loadRemoteDraws() {
       const guess = Math.floor((Date.now() - REMOTE.baseRoundDate) / REMOTE.week) + 1;
       let latest = null;
       for (let n = guess + 1; n > guess - 2 && !latest; n--) {
           latest = await fetchRemoteRound(n);
       }
       if (!latest) return [];
       const arr = [latest];
       for (let n = latest.round - 1; n > latest.round - REMOTE.recent && n >= 1; n--) {
           const d = await fetchRemoteRound(n);
           if (d) arr.push(d);
       }
       return arr.sort(sortDesc);
   }

   async function loadDraws() {
       // 1) 번들 데이터로 즉시 기준선 확보
       state.draws = await loadLocalDraws();
       // 2) 인터넷 최신으로 업그레이드 (성공 시에만 교체)
       const remote = await loadRemoteDraws();
       if (remote.length) state.draws = remote;
   }

   async function openCheckPanel() {
       els.panelCheck.hidden = false;

       // 처음 열 때 한 번만 불러오기 (전체 8초 상한 — 절대 멈추지 않음)
       if (!state.drawsLoaded) {
           els.roundSelect.innerHTML = '<option>불러오는 중…</option>';
           els.winNumbers.innerHTML = '<div class="message">최신 당첨번호를<br>불러오는 중…</div>';
           els.checkResults.innerHTML = '';
           await Promise.race([
               loadDraws(),
               new Promise(resolve => setTimeout(resolve, REMOTE.overallTimeout))
           ]);
           if (state.draws.length) state.drawsLoaded = true; // 데이터 확보됐을 때만 캐시
       }

       // 회차 드롭다운 채우기
       els.roundSelect.innerHTML = '';
       if (state.draws.length === 0) {
           const opt = document.createElement('option');
           opt.value = '';
           opt.textContent = '자동 조회 실패 — 직접 입력하세요';
           els.roundSelect.appendChild(opt);
       } else {
           state.draws.forEach((d, i) => {
               const opt = document.createElement('option');
               opt.value = String(i);
               opt.textContent = `${d.round}회 (${d.date || ''})`;
               els.roundSelect.appendChild(opt);
           });
       }
       els.roundSelect.selectedIndex = 0;
       renderSelectedRound();
   }

   function renderSelectedRound() {
       if (state.draws.length === 0) {
           els.winNumbers.innerHTML = '<div class="message">당첨번호를 불러오지 못했습니다.<br>아래에서 직접 입력해 확인하세요.</div>';
           els.checkResults.innerHTML = '';
           return;
       }
       const idx = parseInt(els.roundSelect.value, 10) || 0;
       const draw = state.draws[idx];
       renderWinNumbers(draw.numbers, draw.bonus, draw.round, draw.date);
       renderCheckResults(draw.numbers, draw.bonus);
   }

   function renderWinNumbers(main, bonus, round, date) {
       els.winNumbers.innerHTML = '';
       if (round) {
           const d = document.createElement('div');
           d.className = 'win-date';
           d.textContent = `${round}회 당첨번호 ${date ? '· ' + date : ''}`;
           els.winNumbers.appendChild(d);
       }
       const wrap = document.createElement('div');
       wrap.className = 'win-balls';
       main.forEach(n => wrap.appendChild(createBall(n)));
       if (bonus != null) {
           const plus = document.createElement('span');
           plus.className = 'win-plus';
           plus.textContent = '+';
           wrap.appendChild(plus);
           wrap.appendChild(createBall(bonus, true));
       }
       els.winNumbers.appendChild(wrap);
   }

   // 등수 계산
   function computeRank(myMain, winMain, winBonus) {
       const matchCount = myMain.filter(n => winMain.includes(n)).length;
       const hasBonus = winBonus != null && myMain.includes(winBonus);
       if (matchCount === 6) return { rank: 1, label: '1등 🎉', win: true };
       if (matchCount === 5 && hasBonus) return { rank: 2, label: '2등 🎉', win: true };
       if (matchCount === 5) return { rank: 3, label: '3등 🎉', win: true };
       if (matchCount === 4) return { rank: 4, label: '4등 🎉', win: true };
       if (matchCount === 3) return { rank: 5, label: '5등 🎉', win: true };
       return { rank: 0, label: '낙첨', win: false };
   }

   function renderCheckResults(winMain, winBonus) {
       els.checkResults.innerHTML = '';
       // 내가 뽑아둔 모든 게임을 펼치기 (최근 기록부터)
       const games = [];
       state.history.forEach(h => (h.sets || []).forEach(s => games.push({ set: s, date: h.date })));

       if (games.length === 0) {
           els.checkResults.innerHTML = '<div class="message">뽑아둔 번호가 없습니다.<br>먼저 번호를 뽑아주세요.</div>';
           return;
       }

       games.forEach((g, i) => {
           const r = computeRank(g.set.main, winMain, winBonus);
           const item = document.createElement('div');
           item.className = 'check-item';

           const head = document.createElement('div');
           head.className = 'check-item-head';
           head.innerHTML = `<span>${i+1}번째 게임 · ${g.date || ''}</span>`;
           const badge = document.createElement('span');
           badge.className = `rank-badge ${r.win ? 'rank-win' : 'rank-miss'}`;
           badge.textContent = r.label;
           head.appendChild(badge);
           item.appendChild(head);

           const balls = document.createElement('div');
           balls.className = 'ball-container';
           g.set.main.forEach(n => balls.appendChild(createBall(n, false, winMain.includes(n))));
           item.appendChild(balls);

           els.checkResults.appendChild(item);
       });
   }

   function applyManualNumbers() {
       const main = Array.from(els.manualInputs)
           .map(inp => parseInt(inp.value, 10))
           .filter(n => !isNaN(n) && n >= 1 && n <= 45);
       const uniq = [...new Set(main)];
       if (uniq.length !== 6) {
           return toast('1~45 사이 서로 다른<br>번호 6개를 입력하세요.');
       }
       const bonus = parseInt(els.manualBonus.value, 10);
       const bonusVal = (!isNaN(bonus) && bonus >= 1 && bonus <= 45) ? bonus : null;

       renderWinNumbers(uniq.sort((a,b)=>a-b), bonusVal, null, null);
       renderCheckResults(uniq, bonusVal);
       toast('입력한 번호로 확인했습니다.');
   }

   // --- 데이터 및 UI 유틸 ---
   function toast(msg) {
       const existing = document.querySelector('.toast');
       if(existing) existing.remove();

       const t = document.createElement('div');
       t.className = 'toast';
       t.innerHTML = msg; // 줄바꿈 등을 위해 HTML 허용
       document.body.appendChild(t);
       setTimeout(() => t.remove(), 2500);
   }

   function copyResult() {
       const sets = els.resultArea.querySelectorAll('.lotto-set');
       if(!sets.length) return toast('먼저 [번호 뽑기]를<br>눌러주세요.');

       let text = '';
       sets.forEach((row, i) => {
           const nums = Array.from(row.querySelectorAll('.ball')).map(b => b.textContent).join(', ');
           text += `${i+1}게임: ${nums}\n`;
       });

       navigator.clipboard.writeText(text)
           .then(() => toast('복사되었습니다!<br>카톡이나 문자에 붙여넣으세요.'))
           .catch(() => toast('복사에 실패했습니다.'));
   }

   async function saveImage() {
       const sets = els.resultArea.querySelectorAll('.lotto-set');
       if(!sets.length) return toast('저장할 번호가 없습니다.');

       try {
           const canvas = await html2canvas(document.querySelector('.card'), { scale: 1.5 });
           const link = document.createElement('a');
           link.download = `로또번호_${new Date().toLocaleTimeString().replace(/:/g,'')}.png`;
           link.href = canvas.toDataURL();
           link.click();
           toast('앨범(갤러리)에<br>저장되었습니다.');
       } catch(e) {
           toast('이미지 저장에 실패했습니다.');
       }
   }

   function addToHistory(sets) {
       const item = {
           date: new Date().toLocaleString(),
           sets: sets
       };
       state.history.unshift(item);
       if(state.history.length > 20) state.history.pop();
       saveData();
   }

   function renderHistory() {
       els.listHistory.innerHTML = '';
       if(state.history.length === 0) {
           els.listHistory.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">아직 기록이 없습니다.</div>';
           return;
       }
       state.history.forEach(h => {
           const div = document.createElement('div');
           div.className = 'history-item';
           const nums = h.sets.map((s, i) =>
               `<div>${i+1}. <strong>${s.main.join(', ')}</strong> ${s.bonus ? `<span style="color:red; font-size:0.9em">(+${s.bonus})</span>` : ''}</div>`
           ).join('');
           div.innerHTML = `<div style="color:#666; font-size:14px; margin-bottom:5px;">${h.date}</div>${nums}`;
           els.listHistory.appendChild(div);
       });
   }

   function loadData() {
       try {
           const loaded = JSON.parse(localStorage.getItem(CONFIG.lsKey));
           if (loaded) {
               if(loaded.history) state.history = loaded.history;
               if(loaded.prefs) state.prefs = { ...state.prefs, ...loaded.prefs };
           }
       } catch(e) {}
   }
   function saveData() {
       // 당첨번호 데이터(draws)는 저장할 필요 없으므로 제외
       const toSave = { history: state.history, prefs: state.prefs };
       localStorage.setItem(CONFIG.lsKey, JSON.stringify(toSave));
   }

   function updateUIFromPrefs() {
       els.chkAvoid.checked = state.prefs.avoidDup;
       els.inpFixed.value = state.prefs.fixed.join(', ');
       els.inpExcluded.value = state.prefs.excluded.join(', ');
       els.inpSeed.value = state.prefs.seed;
       els.inpSeed.disabled = !state.prefs.seedMode;
       els.btnSeedToggle.textContent = state.prefs.seedMode ? 'ON (켜짐)' : 'OFF (꺼짐)';
       els.btnSeedToggle.setAttribute('aria-pressed', state.prefs.seedMode);

       if(state.prefs.seedMode) {
           els.btnSeedToggle.style.background = 'var(--primary)';
           els.btnSeedToggle.style.color = '#fff';
       } else {
           els.btnSeedToggle.style.background = '#fff';
           els.btnSeedToggle.style.color = '#000';
       }
   }

   function savePrefsFromUI() {
       state.prefs.avoidDup = els.chkAvoid.checked;
       state.prefs.fixed = parseNums(els.inpFixed.value);
       state.prefs.excluded = parseNums(els.inpExcluded.value);
       state.prefs.seed = parseInt(els.inpSeed.value, 10) || 12345;
       saveData();
       updateUIFromPrefs();
       toast('설정이 저장되었습니다.');
   }
   function resetPrefs() {
       state.prefs = { avoidDup: true, fixed: [], excluded: [], seedMode: false, seed: 12345 };
       saveData();
       updateUIFromPrefs();
       toast('설정이 초기화되었습니다.');
   }
   function parseNums(str) {
       return str.split(/[^0-9]+/).map(s => parseInt(s.trim(),10)).filter(n => !isNaN(n) && n>=1 && n<=45);
   }
