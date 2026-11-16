/* Игровой интерфейс v2: карта уровней, SVG-фигуры, анимация хода, прогресс. */

(function () {
  'use strict';

  var C = window.Chess;
  var AI = window.ChessAI;

  /* Векторные фигуры (собственный набор): основная заливка задаётся цветом,
     детали с классом cut подсвечиваются контрастно через CSS. */
  var SVG_BODY = {
    p: '<circle cx="22.5" cy="12.5" r="4.6"/><path d="M18 17.5 h9 l2.6 9.5 h-14.2 z"/><path d="M12.5 29.5 h20 v3.5 h-4 v2.5 h-12 v-2.5 h-4 z"/>',
    r: '<path d="M10 10.5 h4.5 v4 h5.5 v-4 h5 v4 h5.5 v-4 H35 v8.5 h-3.2 l1.6 13 h3.6 v5.5 H8.6 v-5.5 h3.6 l1.6 -13 H10 z"/>',
    b: '<circle cx="22.5" cy="7.2" r="2.1"/><path d="M22.5 10.2 c4.6 0 7.4 3.2 7.4 7 0 3.4 -2.4 5.2 -2.4 5.2 l3.6 9.1 h-17.2 l3.6 -9.1 s-2.4 -1.8 -2.4 -5.2 c0 -3.8 2.8 -7 7.4 -7 z"/><path d="M12 32 h21 v3.2 h-3.5 v2.5 h-14 v-2.5 H12 z"/>',
    n: '<path d="M14 38 h18.5 v-3.2 l-4.2 -1.8 c2.6 -5.6 3.6 -9.8 1.4 -15.2 C27.5 12.6 23.6 10.6 20.4 10.3 l1.3 -3.4 -3.6 1.1 -1.7 -2.7 -2.6 4.9 C9 11.5 6.3 15.7 5.6 20.4 l2.9 -0.4 3.2 -3.2 c0.7 4.6 -0.6 8.2 -3.4 12.4 l-0.6 2.4 c-0.5 2.2 1.2 4.2 3.4 4.2 z"/>',
    q: '<circle cx="9" cy="10.5" r="2.1"/><circle cx="15.7" cy="7.6" r="2.1"/><circle cx="22.5" cy="6.4" r="2.1"/><circle cx="29.3" cy="7.6" r="2.1"/><circle cx="36" cy="10.5" r="2.1"/><path d="M9 12.5 l4.6 10.5 h17.8 L36 12.5 l-4.8 8.4 -1.9 -9.5 -3.2 8.6 -3.6 -9.7 -3.6 9.7 -3.2 -8.6 -1.9 9.5 z"/><path d="M13 24.5 h19 l2.2 5 h-23.4 z"/><path d="M10.6 32.5 h23.8 v3.2 h-4 v2.5 h-15.8 v-2.5 h-4 z"/>',
    k: '<path d="M20.8 1.5 h3.4 v4 h4 v3.4 h-4 v4 h-3.4 v-4 h-4 v-3.4 h4 z"/><path d="M13.8 19 c-0.6 -4.8 3.4 -8.6 8.7 -8.6 s9.3 3.8 8.7 8.6 l1.3 5.5 h-20 z"/><path d="M11.5 26 h22 l1.8 6 h-25.6 z"/><path d="M9.5 34.5 h26 v3 h-4 v2.5 h-18 v-2.5 h-4 z"/>'
  };
  // детали: прорезь слона, глаз коня — класс cut
  var SVG_DETAIL = {
    b: '<path class="cut" d="M18.6 15 h3.2 l-1.2 9 h-1.6 z"/>',
    n: '<circle class="cut" cx="20.5" cy="15.5" r="1.3"/>'
  };

  var FILL = { w: '#fdfdf7', b: '#1d1d1f' };
  var STROKE = { w: '#4a4a4a', b: '#0a0a0a' };

  var PROMO_ORDER = ['q', 'r', 'b', 'n'];
  var PROMO_NAMES = { q: 'ферзь', r: 'ладья', b: 'слон', n: 'конь' };

  // ---------- Уровни ----------
  var LEVELS = [
    { name: 'Новичок',              desc: 'Первые шаги',           depth: 1, time: 300,  jitter: 130 },
    { name: 'Юный игрок',           desc: 'Смотрит на один ход вперёд', depth: 1, time: 300, jitter: 70 },
    { name: 'Разрядник',            desc: 'Думает над ошибками',   depth: 1, time: 400,  jitter: 20 },
    { name: 'Клубный игрок',        desc: 'Видит два хода',        depth: 2, time: 500,  jitter: 0 },
    { name: 'Кандидат в мастера',   desc: 'Бережёт фигуры',        depth: 2, time: 700,  jitter: 0 },
    { name: 'КМС',                  desc: 'Считает три хода',      depth: 3, time: 800,  jitter: 0 },
    { name: 'Мастер',               desc: 'Ищет лучшие планы',     depth: 3, time: 1200, jitter: 0 },
    { name: 'Международник',        desc: 'Сильный противник',     depth: 3, time: 1600, jitter: 0 },
    { name: 'Гроссмейстер',         desc: 'Коварные ловушки',      depth: 4, time: 2000, jitter: 0 },
    { name: 'Чемпион',              desc: 'Максимальная сила',     depth: 5, time: 2600, jitter: 0 }
  ];
  var TOTAL_LEVELS = LEVELS.length;

  // ---------- DOM ----------
  var mapScreen = document.getElementById('map-screen');
  var gameScreen = document.getElementById('game-screen');
  var mapEl = document.getElementById('map');
  var progressLabel = document.getElementById('progress-label');
  var humanGameBtn = document.getElementById('human-game');
  var backBtn = document.getElementById('back-to-map');
  var levelTitle = document.getElementById('level-title');
  var boardEl = document.getElementById('board');
  var statusEl = document.getElementById('status');
  var historyEl = document.getElementById('history');
  var promoEl = document.getElementById('promotion');
  var resultEl = document.getElementById('result');
  var resultText = document.getElementById('result-text');
  var resultNote = document.getElementById('result-note');
  var toMapBtn = document.getElementById('to-map-btn');
  var newGameEl = document.getElementById('new-game');
  var undoEl = document.getElementById('undo');

  // ---------- Состояние ----------
  var state = null;
  var moveHistory = [];   // {move, san, fenBefore}
  var positionKeys = [];  // ключи позиций для повторений
  var selected = null;
  var pendingPromo = null;
  var thinking = false;
  var over = null;        // {kind:'win'|'lose'|'draw', text}
  var pendingAI = null;   // отложенный ход ИИ (id таймера)

  var session = { mode: 'ai', level: 1 }; // текущая партия
  var progress = { unlocked: 1, completed: [] }; // кампания

  var animPairs = null;   // фигуры, которые надо анимировать при следующем рендере

  // ---------- Хранилище ----------
  var SAVE_KEY = 'browser-chess-v2';
  var PROGRESS_KEY = 'browser-chess-progress';

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        fen: C.toFEN(state),
        history: moveHistory.map(function (h) {
          return { san: h.san, from: h.move.from, to: h.move.to, fenBefore: h.fenBefore };
        }),
        keys: positionKeys,
        session: session
      }));
    } catch (e) { /* приватный режим — без сохранения */ }
  }

  function restoreGame() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || !d.fen) return false;
      state = C.parseFEN(d.fen);
      positionKeys = d.keys || [C.positionKey(state)];
      moveHistory = (d.history || []).map(function (h) {
        return { san: h.san, move: { from: h.from, to: h.to }, fenBefore: h.fenBefore };
      });
      session = d.session || { mode: 'ai', level: 1 };
      if (session.mode !== 'human' && (session.level < 1 || session.level > TOTAL_LEVELS)) session.level = 1;
      return true;
    } catch (e) { return false; }
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.unlocked) progress = { unlocked: d.unlocked, completed: d.completed || [] };
      }
    } catch (e) { /* нет сохранения — кампания с начала */ }
  }

  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) {}
  }

  function completedCount() {
    return progress.completed.filter(Boolean).length;
  }

  // ---------- SVG-фигуры ----------
  function pieceSVG(t, c) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 45 45');
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('fill', FILL[c]);
    g.setAttribute('stroke', STROKE[c]);
    g.setAttribute('stroke-width', '1.5');
    g.setAttribute('stroke-linejoin', 'round');
    g.setAttribute('stroke-linecap', 'round');
    // основной контур
    var tmp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tmp.innerHTML = SVG_BODY[t];
    for (var i = 0; i < tmp.children.length; i++) {
      g.appendChild(tmp.children[i].cloneNode(true));
    }
    // детали (прорезь слона, глаз коня)
    if (SVG_DETAIL[t]) {
      var d = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      d.innerHTML = SVG_DETAIL[t];
      for (var j = 0; j < d.children.length; j++) {
        g.appendChild(d.children[j].cloneNode(true));
      }
    }
    svg.appendChild(g);
    return svg;
  }

  // ---------- Экраны ----------
  function showMap() {
    gameScreen.classList.add('hidden');
    mapScreen.classList.remove('hidden');
    renderMap();
  }

  function showGame() {
    mapScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    levelTitle.textContent = session.mode === 'human' ? 'Игра вдвоём' :
      'Уровень ' + session.level + ' · ' + LEVELS[session.level - 1].name;
  }

  function renderMap() {
    progressLabel.textContent = 'Пройдено ' + completedCount() + ' из ' + TOTAL_LEVELS;
    mapEl.innerHTML = '';
    LEVELS.forEach(function (lv, idx) {
      var num = idx + 1;
      var unlocked = num <= progress.unlocked;
      var done = !!progress.completed[idx];
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'level-card' + (unlocked ? '' : ' locked') + (done ? ' done' : '');
      card.dataset.level = String(num);
      var numEl = document.createElement('div');
      numEl.className = 'num';
      numEl.textContent = unlocked ? String(num) : '\u26AA';
      card.appendChild(numEl);
      var nameEl = document.createElement('div');
      nameEl.className = 'name';
      nameEl.textContent = lv.name;
      card.appendChild(nameEl);
      var descEl = document.createElement('div');
      descEl.className = 'desc';
      descEl.textContent = unlocked ? lv.desc : 'Пройдите предыдущий уровень';
      card.appendChild(descEl);
      var mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = done ? 'Пройден' : (unlocked ? 'Играть' : 'Закрыт');
      card.appendChild(mark);
      card.addEventListener('click', function () {
        if (!unlocked) return;
        startLevel(num);
      });
      mapEl.appendChild(card);
    });
  }

  function startLevel(level) {
    session = { mode: 'ai', level: level };
    newGame();
    showGame();
  }

  function startHuman() {
    session = { mode: 'human', level: 0 };
    newGame();
    showGame();
  }

  // ---------- Доска ----------
  function buildBoard() {
    boardEl.innerHTML = '';
    for (var i = 0; i < 64; i++) {
      var cell = document.createElement('div');
      cell.className = 'square ' + (((C.rank(i) + C.file(i)) % 2 === 0) ? 'light' : 'dark');
      cell.dataset.sq = String(i);
      var r = C.rank(i), f = C.file(i);
      if (r === 7) {
        var cf = document.createElement('span');
        cf.className = 'coord file';
        cf.textContent = 'abcdefgh'.charAt(f);
        cell.appendChild(cf);
      }
      if (f === 0) {
        var cr = document.createElement('span');
        cr.className = 'coord rank';
        cr.textContent = String(8 - r);
        cell.appendChild(cr);
      }
      boardEl.appendChild(cell);
    }
    boardEl.addEventListener('click', onBoardClick);
  }

  function setPiece(cell, p) {
    var pieceEl = cell.querySelector('.piece');
    if (p) {
      if (pieceEl) {
        if (pieceEl.dataset.t === p.t && pieceEl.dataset.c === p.c) return; // без пересоздания
        pieceEl.remove();
      }
      pieceEl = document.createElement('div');
      pieceEl.className = 'piece ' + p.c;
      pieceEl.dataset.t = p.t;
      pieceEl.dataset.c = p.c;
      pieceEl.appendChild(pieceSVG(p.t, p.c));
      cell.appendChild(pieceEl);
    } else if (pieceEl) {
      pieceEl.remove();
    }
  }

  // Анимировать перемещение фигуры между клетками
  function animatePieces(pairs) {
    var cellW = boardEl.offsetWidth / 8;
    var cellH = boardEl.offsetHeight / 8;
    for (var pr of pairs) {
      var cell = boardEl.children[pr.to];
      var pieceEl = cell.querySelector('.piece');
      if (!pieceEl) continue;
      var dx = (C.file(pr.from) - C.file(pr.to)) * cellW;
      var dy = (C.rank(pr.from) - C.rank(pr.to)) * cellH;
      if (pieceEl.animate) {
        pieceEl.animate(
          [
            { transform: 'translate(' + dx + 'px,' + dy + 'px)' },
            { transform: 'translate(0,0)' }
          ],
          { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' }
        );
      }
    }
  }

  function render() {
    var lastFrom = moveHistory.length ? moveHistory[moveHistory.length - 1].move.from : -1;
    var lastTo = moveHistory.length ? moveHistory[moveHistory.length - 1].move.to : -1;
    var kingSq = C.findKing(state, state.turn);
    var checked = !over && C.inCheck(state, state.turn);

    for (var i = 0; i < 64; i++) {
      var cell = boardEl.children[i];
      var p = state.board[i];

      var dot = cell.querySelector('.dot');
      if (dot) dot.remove();
      var ring = cell.querySelector('.cap-ring');
      if (ring) ring.remove();

      setPiece(cell, p);

      cell.classList.toggle('selected', selected === i);
      cell.classList.toggle('last-from', i === lastFrom);
      cell.classList.toggle('last-to', i === lastTo);
      cell.classList.toggle('check-glow', checked && p && p.t === 'k' && i === kingSq);
    }

    if (animPairs) {
      animatePieces(animPairs);
      animPairs = null;
    }
  }

  function renderHistory() {
    historyEl.innerHTML = '';
    for (var i = 0; i < moveHistory.length; i += 2) {
      var li = document.createElement('li');
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = (i / 2 + 1) + '.';
      li.appendChild(num);
      var w = document.createElement('span');
      w.className = 'w' + (i === moveHistory.length - 1 ? ' latest' : '');
      w.textContent = moveHistory[i].san;
      li.appendChild(w);
      var b = document.createElement('span');
      if (moveHistory[i + 1]) {
        b.className = 'b' + (i + 1 === moveHistory.length - 1 ? ' latest' : '');
        b.textContent = moveHistory[i + 1].san;
        li.appendChild(b);
      }
      historyEl.appendChild(li);
    }
    if (moveHistory.length) historyEl.scrollTop = historyEl.scrollHeight;
  }

  // ---------- Статус и результат ----------
  function refreshStatus() {
    var st = C.gameStatus(state, positionKeys);
    statusEl.classList.remove('check', 'over');
    over = null;
    resultEl.classList.add('hidden');

    function setOver(kind, text, note) {
      over = { kind: kind, text: text };
      statusEl.textContent = text;
      statusEl.classList.add('over');
      showResult(kind, text, note);
    }

    if (st === 'mate') {
      if (state.turn === 'b') {
        // матовали чёрных — победа игрока (в режиме с компьютером)
        setOver('win', 'Победа! Мат чёрным', levelVictoryNote());
        if (session.mode === 'ai') completeLevel(session.level);
      } else {
        setOver('lose', 'Мат. Компьютер победил', 'Попробуйте снова — новый ход будет другим.');
      }
    } else if (st === 'stalemate') {
      setOver('draw', 'Ничья — пат', 'У соперника нет ходов, но и шаха нет.');
    } else if (st === 'draw-50') {
      setOver('draw', 'Ничья — правило 50 ходов', '');
    } else if (st === 'draw-repetition') {
      setOver('draw', 'Ничья — троекратное повторение', '');
    } else if (st === 'draw-material') {
      setOver('draw', 'Ничья — недостаток материала', '');
    } else {
      var side = state.turn === 'w' ? 'Ход белых' : 'Ход чёрных';
      if (st === 'check') {
        side += ' — шах!';
        statusEl.classList.add('check');
      }
      statusEl.textContent = side;
    }
    render();
    renderHistory();
    saveGame();
  }

  function levelVictoryNote() {
    if (session.mode !== 'ai') return '';
    if (session.level >= TOTAL_LEVELS) return 'Это был последний уровень — вы прошли всю кампанию!';
    return 'Уровень ' + (session.level + 1) + ' «' + LEVELS[session.level].name + '» открыт на карте.';
  }

  function completeLevel(level) {
    if (!level || progress.completed[level - 1]) return;
    progress.completed[level - 1] = true;
    if (progress.unlocked < Math.min(level + 1, TOTAL_LEVELS + 1)) {
      progress.unlocked = Math.min(level + 1, TOTAL_LEVELS + 1);
    }
    saveProgress();
    renderMap();
  }

  function showResult(kind, text, note) {
    resultText.textContent = text;
    resultText.className = 'result-text ' + kind;
    resultNote.textContent = note || '';
    resultEl.classList.remove('hidden');
  }

  // ---------- Ходы ----------
  function legalFrom(sqIdx) {
    return C.generateMoves(state).filter(function (m) { return m.from === sqIdx; });
  }

  function markTargets(moves) {
    for (var m of moves) {
      var cell = boardEl.children[m.to];
      if (m.capture || m.ep) {
        var r = document.createElement('span');
        r.className = 'cap-ring';
        cell.appendChild(r);
      } else {
        var d = document.createElement('span');
        d.className = 'dot';
        cell.appendChild(d);
      }
    }
  }

  function onBoardClick(ev) {
    if (thinking || over || pendingPromo) return;
    var cell = ev.target.closest('.square');
    if (!cell) return;
    var sqIdx = parseInt(cell.dataset.sq, 10);

    if (selected == null) {
      var p = state.board[sqIdx];
      if (p && p.c === state.turn) {
        var moves = legalFrom(sqIdx);
        if (!moves.length) return;
        selected = sqIdx;
        render();
        markTargets(moves);
      }
      return;
    }

    if (sqIdx === selected) {
      selected = null;
      render();
      return;
    }

    var candidates = C.generateMoves(state).filter(function (m) {
      return m.from === selected && m.to === sqIdx;
    });

    if (!candidates.length) {
      var p2 = state.board[sqIdx];
      if (p2 && p2.c === state.turn) {
        var mv = legalFrom(sqIdx);
        if (mv.length) {
          selected = sqIdx;
          render();
          markTargets(mv);
          return;
        }
      }
      selected = null;
      render();
      return;
    }

    if (candidates.length > 1) {
      pendingPromo = { candidates: candidates };
      showPromotion(state.turn);
      return;
    }

    applyMove(candidates[0], true);
  }

  function showPromotion(color) {
    promoEl.innerHTML = '';
    PROMO_ORDER.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.title = PROMO_NAMES[t];
      btn.appendChild(pieceSVG(t, color));
      btn.addEventListener('click', function () {
        var move = pendingPromo.candidates.find(function (m) { return m.promo === t; });
        pendingPromo = null;
        promoEl.classList.add('hidden');
        promoEl.innerHTML = '';
        applyMove(move, true);
      });
      promoEl.appendChild(btn);
    });
    promoEl.classList.remove('hidden');
  }

  function recordMove(move) {
    var fenBefore = C.toFEN(state);
    var san = C.toSAN(state, move);
    positionKeys.push(C.positionKey(C.makeMove(state, move)));
    moveHistory.push({ move: move, san: san, fenBefore: fenBefore });
    state = C.makeMove(state, move);
  }

  function applyMove(move, animate) {
    animPairs = animate ? pairsFor(move) : null;
    recordMove(move);
    selected = null;
    refreshStatus();
    maybeAiMove();
  }

  // Пары «откуда — куда» для анимации (главная фигура + ладья при рокировке)
  function pairsFor(move) {
    var pairs = [{ from: move.from, to: move.to }];
    if (move.castle) {
      var home = move.piece.c === 'w' ? 7 : 0;
      if (move.castle === 'K') pairs.push({ from: C.sq(home, 7), to: C.sq(home, 5) });
      else pairs.push({ from: C.sq(home, 0), to: C.sq(home, 3) });
    }
    return pairs;
  }

  function undoMove() {
    if (!moveHistory.length || thinking || pendingPromo) return;
    if (pendingAI) { clearTimeout(pendingAI); pendingAI = null; thinking = false; }

    var steps = 1;
    if (session.mode === 'ai' && moveHistory.length >= 2 && state.turn === 'b') steps = 2;

    var fenBefore = moveHistory.length > steps
      ? moveHistory[moveHistory.length - 1 - steps].fenBefore
      : C.FEN_START;

    for (var i = 0; i < steps; i++) {
      moveHistory.pop();
      positionKeys.pop();
    }
    state = C.parseFEN(fenBefore);
    selected = null;
    over = null;
    refreshStatus();
  }

  // ---------- Компьютерный противник ----------
  function maybeAiMove() {
    if (over || thinking) return;
    if (session.mode !== 'ai' || state.turn !== 'b') return;
    thinking = true;
    statusEl.textContent = 'Компьютер думает…';
    pendingAI = setTimeout(function () {
      pendingAI = null;
      try {
        var legal = C.generateMoves(state);
        var lv = LEVELS[session.level - 1];
        var move = AI.chooseMove(state, legal, { depth: lv.depth, time: lv.time, jitter: lv.jitter });
        if (move) {
          animPairs = pairsFor(move);
          recordMove(move);
        }
      } finally {
        thinking = false;
        refreshStatus();
      }
    }, 220); // небольшая пауза, чтобы ход соперника был виден
  }

  // ---------- Управление ----------
  humanGameBtn.addEventListener('click', startHuman);
  backBtn.addEventListener('click', function () {
    if (pendingAI) { clearTimeout(pendingAI); pendingAI = null; thinking = false; }
    showMap();
  });
  toMapBtn.addEventListener('click', showMap);
  newGameEl.addEventListener('click', function () {
    if (session.mode === 'ai') startLevel(session.level);
    else startHuman();
  });
  undoEl.addEventListener('click', undoMove);

  function newGame() {
    state = C.initialState();
    moveHistory = [];
    positionKeys = [C.positionKey(state)];
    selected = null;
    pendingPromo = null;
    over = null;
    thinking = false;
    if (pendingAI) { clearTimeout(pendingAI); pendingAI = null; }
    resultEl.classList.add('hidden');
    refreshStatus();
    maybeAiMove();
  }

  // Инициализация
  buildBoard();
  loadProgress();
  if (restoreGame()) {
    showGame();
    refreshStatus();
    maybeAiMove();
  } else {
    showMap();
  }
})();
