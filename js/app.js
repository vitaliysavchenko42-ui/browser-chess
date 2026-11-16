/* Игровой интерфейс: доска, подсветка, панель, история, сохранение. */

(function () {
  'use strict';

  var C = window.Chess;
  var AI = window.ChessAI;

  var GLYPH = {
    pw: '\u2659', nw: '\u2658', bw: '\u2657', rw: '\u2656', qw: '\u2655', kw: '\u2654',
    pb: '\u265F', nb: '\u265E', bb: '\u265D', rb: '\u265C', qb: '\u265B', kb: '\u265A'
  };
  var PROMO_NAMES = { q: 'ферзь', r: 'ладья', b: 'слон', n: 'конь' };

  var boardEl = document.getElementById('board');
  var statusEl = document.getElementById('status');
  var historyEl = document.getElementById('history');
  var promoEl = document.getElementById('promotion');
  var modeEl = document.getElementById('mode');
  var levelEl = document.getElementById('level');
  var newGameEl = document.getElementById('new-game');
  var undoEl = document.getElementById('undo');

  var state = null;          // текущая позиция
  var moveHistory = [];      // {move, san, fenBefore} — снимок позиции ДО хода
  var positionKeys = [];     // ключи позиций для определения повторений
  var selected = null;       // выбранная клетка
  var pendingPromo = null;   // ход с превращением, ожидающий выбора фигуры
  var thinking = false;      // ИИ занят
  var over = null;           // строка результата, если партия окончена

  // ---------- Сохранение ----------
  var SAVE_KEY = 'browser-chess-v1';

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        fen: C.toFEN(state),
        history: moveHistory.map(function (h) {
          return { san: h.san, from: h.move.from, to: h.move.to, fenBefore: h.fenBefore };
        }),
        keys: positionKeys,
        mode: modeEl.value,
        level: levelEl.value
      }));
    } catch (e) { /* приватный режим — играем без сохранения */ }
  }

  function restore() {
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
      modeEl.value = d.mode || 'human';
      levelEl.disabled = modeEl.value !== 'ai';
      levelEl.value = d.level || '2';
      return true;
    } catch (e) { return false; }
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

      var pieceEl = cell.querySelector('.piece');
      var need = p ? GLYPH[p.t + p.c] : null;
      if (need) {
        if (!pieceEl || pieceEl.textContent !== need) {
          if (pieceEl) pieceEl.remove();
          pieceEl = document.createElement('div');
          pieceEl.className = 'piece ' + p.c;
          pieceEl.textContent = need;
          cell.appendChild(pieceEl);
        }
      } else if (pieceEl) {
        pieceEl.remove();
      }

      cell.classList.toggle('selected', selected === i);
      cell.classList.toggle('last-from', i === lastFrom);
      cell.classList.toggle('last-to', i === lastTo);
      cell.classList.toggle('check-glow', checked && p && p.t === 'k' && i === kingSq);
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

  // ---------- Статус ----------
  function refreshStatus() {
    var st = C.gameStatus(state, positionKeys);
    statusEl.classList.remove('check', 'over');
    over = null;

    if (st === 'mate') {
      var winner = state.turn === 'w' ? 'Чёрные' : 'Белые';
      over = winner + ' победили — мат';
      statusEl.textContent = over;
      statusEl.classList.add('over');
    } else if (st === 'stalemate') {
      over = 'Ничья — пат';
      statusEl.textContent = over;
      statusEl.classList.add('over');
    } else if (st === 'draw-50') {
      over = 'Ничья — правило 50 ходов';
      statusEl.textContent = over;
      statusEl.classList.add('over');
    } else if (st === 'draw-repetition') {
      over = 'Ничья — троекратное повторение';
      statusEl.textContent = over;
      statusEl.classList.add('over');
    } else if (st === 'draw-material') {
      over = 'Ничья — недостаток материала';
      statusEl.textContent = over;
      statusEl.classList.add('over');
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
    save();
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

    applyMove(candidates[0]);
  }

  function showPromotion(color) {
    promoEl.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = GLYPH[t + color];
      btn.title = PROMO_NAMES[t];
      btn.addEventListener('click', function () {
        var move = pendingPromo.candidates.find(function (m) { return m.promo === t; });
        pendingPromo = null;
        promoEl.classList.add('hidden');
        promoEl.innerHTML = '';
        applyMove(move);
      });
      promoEl.appendChild(btn);
    });
    promoEl.classList.remove('hidden');
  }

  function applyMove(move) {
    var fenBefore = C.toFEN(state);
    var san = C.toSAN(state, move);
    positionKeys.push(C.positionKey(C.makeMove(state, move)));
    moveHistory.push({ move: move, san: san, fenBefore: fenBefore });
    state = C.makeMove(state, move);
    selected = null;
    refreshStatus();
    maybeAiMove();
  }

  function undoMove() {
    if (!moveHistory.length || thinking || pendingPromo) return;
    var steps = 1;
    // против компьютера откатываем пару ходов, чтобы снова ходить белыми
    if (modeEl.value === 'ai' && moveHistory.length >= 2 && state.turn === 'b') steps = 2;

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
    if (modeEl.value !== 'ai' || state.turn !== 'b') return;
    thinking = true;
    statusEl.textContent = 'Компьютер думает…';
    setTimeout(function () {
      try {
        var legal = C.generateMoves(state);
        var move = AI.chooseMove(state, legal, parseInt(levelEl.value, 10));
        if (move) {
          var fenBefore = C.toFEN(state);
          var san = C.toSAN(state, move);
          positionKeys.push(C.positionKey(C.makeMove(state, move)));
          moveHistory.push({ move: move, san: san, fenBefore: fenBefore });
          state = C.makeMove(state, move);
        }
      } finally {
        thinking = false;
        refreshStatus();
      }
    }, 60);
  }

  // ---------- Управление ----------
  modeEl.addEventListener('change', function () {
    levelEl.disabled = modeEl.value !== 'ai';
    newGame();
  });

  levelEl.addEventListener('change', function () {
    if (modeEl.value === 'ai') maybeAiMove();
  });

  newGameEl.addEventListener('click', function () { newGame(); });
  undoEl.addEventListener('click', undoMove);

  function newGame() {
    state = C.initialState();
    moveHistory = [];
    positionKeys = [C.positionKey(state)];
    selected = null;
    pendingPromo = null;
    over = null;
    thinking = false;
    refreshStatus();
    maybeAiMove();
  }

  // Инициализация
  buildBoard();
  if (restore()) {
    refreshStatus();
    maybeAiMove();
  } else {
    newGame();
  }
})();
