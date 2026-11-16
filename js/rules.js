/* Шахматный движок: правила игры без привязки к интерфейсу.
   Глобальный объект Chess (работает и в браузере, и в node). */

(function () {
  'use strict';

  var PIECES = ['p', 'n', 'b', 'r', 'q', 'k'];
  var VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

  // индекс 0 = a8 (левый верхний угол), белые идут вверх
  function sq(r, f) { return r * 8 + f; }
  function rank(i) { return i >> 3; }   // 0..7 сверху вниз
  function file(i) { return i & 7; }    // 0..7 слева направо
  function algebra(i) {
    return 'abcdefgh'.charAt(file(i)) + (8 - rank(i));
  }
  function fromAlgebra(s) {
    var f = 'abcdefgh'.indexOf(s.charAt(0));
    var r = 8 - parseInt(s.charAt(1), 10);
    return sq(r, f);
  }

  function other(c) { return c === 'w' ? 'b' : 'w'; }

  var FEN_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  function emptyState() {
    return {
      board: new Array(64).fill(null), // {t:'p', c:'w'} | null
      turn: 'w',
      castling: { wK: false, wQ: false, bK: false, bQ: false },
      ep: null,       // индекс клетки за пешкой при двойном ходе
      halfmove: 0,
      fullmove: 1
    };
  }

  function parseFEN(fen) {
    var parts = fen.trim().split(/\s+/);
    var s = emptyState();
    var rows = parts[0].split('/');
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var ch of rows[r]) {
        if (/\d/.test(ch)) { f += parseInt(ch, 10); continue; }
        var t = ch.toLowerCase();
        s.board[sq(r, f)] = { t: t, c: ch === ch.toUpperCase() ? 'w' : 'b' };
        f++;
      }
    }
    s.turn = parts[1] || 'w';
    var cr = parts[2] || '-';
    if (cr.indexOf('K') >= 0) s.castling.wK = true;
    if (cr.indexOf('Q') >= 0) s.castling.wQ = true;
    if (cr.indexOf('k') >= 0) s.castling.bK = true;
    if (cr.indexOf('q') >= 0) s.castling.bQ = true;
    s.ep = (parts[3] && parts[3] !== '-') ? fromAlgebra(parts[3]) : null;
    s.halfmove = parseInt(parts[4] || '0', 10);
    s.fullmove = parseInt(parts[5] || '1', 10);
    return s;
  }

  function toFEN(s) {
    var out = [];
    for (var r = 0; r < 8; r++) {
      var row = '', empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = s.board[sq(r, f)];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p.c === 'w' ? p.t.toUpperCase() : p.t;
      }
      if (empty) row += empty;
      out.push(row);
    }
    var cr = '';
    if (s.castling.wK) cr += 'K';
    if (s.castling.wQ) cr += 'Q';
    if (s.castling.bK) cr += 'k';
    if (s.castling.bQ) cr += 'q';
    if (!cr) cr = '-';
    return out.join('/') + ' ' + s.turn + ' ' + cr + ' ' +
      (s.ep == null ? '-' : algebra(s.ep)) + ' ' + s.halfmove + ' ' + s.fullmove;
  }

  // Ключ позиции (без счётчиков) — для троекратного повторения
  function positionKey(s) {
    return toFEN(s).split(' ').slice(0, 4).join(' ');
  }

  function initialState() { return parseFEN(FEN_START); }

  function findKing(s, color) {
    for (var i = 0; i < 64; i++) {
      var p = s.board[i];
      if (p && p.t === 'k' && p.c === color) return i;
    }
    return -1;
  }

  // Бьётся ли клетка sq стороной byColor (без учёта прав рокировки)
  function isAttacked(s, target, byColor) {
    var b = s.board;
    var r = rank(target), f = file(target);

    // пешки
    var pr = byColor === 'w' ? r + 1 : r - 1; // атакующий стоит ниже для белых
    if (pr >= 0 && pr < 8) {
      if (f > 0) {
        var p = b[sq(pr, f - 1)];
        if (p && p.c === byColor && p.t === 'p') return true;
      }
      if (f < 7) {
        var p2 = b[sq(pr, f + 1)];
        if (p2 && p2.c === byColor && p2.t === 'p') return true;
      }
    }
    // кони
    var KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    for (var i = 0; i < 8; i++) {
      var rr = r + KN[i][0], ff = f + KN[i][1];
      if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
      var p3 = b[sq(rr, ff)];
      if (p3 && p3.c === byColor && p3.t === 'n') return true;
    }
    // король
    for (var dr = -1; dr <= 1; dr++) for (var df = -1; df <= 1; df++) {
      if (!dr && !df) continue;
      var r2 = r + dr, f2 = f + df;
      if (r2 < 0 || r2 > 7 || f2 < 0 || f2 > 7) continue;
      var p4 = b[sq(r2, f2)];
      if (p4 && p4.c === byColor && p4.t === 'k') return true;
    }
    // слоны/ферзи по диагоналям, ладьи/ферзи по линиям
    var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (var d = 0; d < 4; d++) {
      var rr2 = r, ff2 = f;
      for (;;) {
        rr2 += DIAG[d][0]; ff2 += DIAG[d][1];
        if (rr2 < 0 || rr2 > 7 || ff2 < 0 || ff2 > 7) break;
        var p5 = b[sq(rr2, ff2)];
        if (p5) {
          if (p5.c === byColor && (p5.t === 'b' || p5.t === 'q')) return true;
          break;
        }
      }
    }
    var ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (var o = 0; o < 4; o++) {
      var rr3 = r, ff3 = f;
      for (;;) {
        rr3 += ORTH[o][0]; ff3 += ORTH[o][1];
        if (rr3 < 0 || rr3 > 7 || ff3 < 0 || ff3 > 7) break;
        var p6 = b[sq(rr3, ff3)];
        if (p6) {
          if (p6.c === byColor && (p6.t === 'r' || p6.t === 'q')) return true;
          break;
        }
      }
    }
    return false;
  }

  function inCheck(s, color) {
    var k = findKing(s, color);
    return k >= 0 && isAttacked(s, k, other(color));
  }

  // Все псевдолегальные ходы фигуры на клетке from (без проверки шаха)
  function pseudoMoves(s, from) {
    var b = s.board, p = b[from];
    if (!p) return [];
    var moves = [];
    var c = p.c, t = p.t;
    var r = rank(from), f = file(from);

    function push(to, extra) {
      moves.push(Object.assign({ from: from, to: to, piece: p, capture: b[to] }, extra || {}));
    }

    if (t === 'p') {
      var dir = c === 'w' ? -1 : 1;
      var startR = c === 'w' ? 6 : 1;
      var promoR = c === 'w' ? 0 : 7;
      var one = sq(r + dir, f);
      if (r + dir >= 0 && r + dir < 8 && !b[one]) {
        if (r + dir === promoR) {
          ['q', 'r', 'b', 'n'].forEach(function (pt) { push(one, { promo: pt }); });
        } else {
          push(one);
          var two = sq(r + 2 * dir, f);
          if (r === startR && !b[two]) push(two, { double: true });
        }
      }
      for (var df = -1; df <= 1; df += 2) {
        var ff = f + df, rr = r + dir;
        if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
        var to = sq(rr, ff);
        var target = b[to];
        if (target && target.c !== c) {
          if (rr === promoR) {
            ['q', 'r', 'b', 'n'].forEach(function (pt) { push(to, { promo: pt }); });
          } else push(to);
        } else if (!target && s.ep === to) {
          push(to, { ep: true });
        }
      }
      return moves;
    }

    if (t === 'n') {
      var KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (var i = 0; i < 8; i++) {
        var rr4 = r + KN[i][0], ff4 = f + KN[i][1];
        if (rr4 < 0 || rr4 > 7 || ff4 < 0 || ff4 > 7) continue;
        var to4 = sq(rr4, ff4);
        if (!b[to4] || b[to4].c !== c) push(to4);
      }
      return moves;
    }

    if (t === 'k') {
      for (var dr = -1; dr <= 1; dr++) for (var df2 = -1; df2 <= 1; df2++) {
        if (!dr && !df2) continue;
        var rr5 = r + dr, ff5 = f + df2;
        if (rr5 < 0 || rr5 > 7 || ff5 < 0 || ff5 > 7) continue;
        var to5 = sq(rr5, ff5);
        if (!b[to5] || b[to5].c !== c) push(to5);
      }
      // рокировка
      var home = c === 'w' ? 7 : 0;
      var canK = c === 'w' ? s.castling.wK : s.castling.bK;
      var canQ = c === 'w' ? s.castling.wQ : s.castling.bQ;
      var enemy = other(c);
      if (from === sq(home, 4)) {
        if (canK && !b[sq(home, 5)] && !b[sq(home, 6)] &&
            !isAttacked(s, sq(home, 4), enemy) &&
            !isAttacked(s, sq(home, 5), enemy) &&
            !isAttacked(s, sq(home, 6), enemy)) {
          push(sq(home, 6), { castle: 'K' });
        }
        if (canQ && !b[sq(home, 1)] && !b[sq(home, 2)] && !b[sq(home, 3)] &&
            !isAttacked(s, sq(home, 4), enemy) &&
            !isAttacked(s, sq(home, 3), enemy) &&
            !isAttacked(s, sq(home, 2), enemy)) {
          push(sq(home, 2), { castle: 'Q' });
        }
      }
      return moves;
    }

    var rays;
    if (t === 'b') rays = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    else if (t === 'r') rays = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    else rays = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];

    for (var d = 0; d < rays.length; d++) {
      var rr6 = r, ff6 = f;
      for (;;) {
        rr6 += rays[d][0]; ff6 += rays[d][1];
        if (rr6 < 0 || rr6 > 7 || ff6 < 0 || ff6 > 7) break;
        var to6 = sq(rr6, ff6);
        if (!b[to6]) { push(to6); continue; }
        if (b[to6].c !== c) push(to6);
        break;
      }
    }
    return moves;
  }

  // Легальные ходы стороны s.turn
  function generateMoves(s) {
    var all = [];
    for (var i = 0; i < 64; i++) {
      var p = s.board[i];
      if (p && p.c === s.turn) {
        var ps = pseudoMoves(s, i);
        for (var m of ps) {
          var after = makeMove(s, m);
          if (!inCheck(after, p.c)) all.push(m);
        }
      }
    }
    return all;
  }

  function makeMove(s, m) {
    var n = {
      board: s.board.slice(),
      turn: other(s.turn),
      castling: {
        wK: s.castling.wK, wQ: s.castling.wQ,
        bK: s.castling.bK, bQ: s.castling.bQ
      },
      ep: null,
      halfmove: s.halfmove + 1,
      fullmove: s.fullmove
    };
    if (s.turn === 'b') n.fullmove++;

    var p = n.board[m.from];
    var isPawn = p.t === 'p';

    n.board[m.from] = null;
    if (m.ep) {
      // снятая пешка стоит рядом с целевой клеткой
      var capSq = sq(rank(m.from), file(m.to));
      n.board[capSq] = null;
      n.halfmove = 0;
    } else if (m.capture) {
      n.halfmove = 0;
    }

    var placed = m.promo ? { t: m.promo, c: p.c } : p;
    n.board[m.to] = placed;

    if (m.castle) {
      var home = p.c === 'w' ? 7 : 0;
      if (m.castle === 'K') { n.board[sq(home, 5)] = n.board[sq(home, 7)]; n.board[sq(home, 7)] = null; }
      else { n.board[sq(home, 3)] = n.board[sq(home, 0)]; n.board[sq(home, 0)] = null; }
    }

    // права рокировки
    function drop(color, side) {
      if (color === 'w') { if (side === 'K') n.castling.wK = false; else n.castling.wQ = false; }
      else { if (side === 'K') n.castling.bK = false; else n.castling.bQ = false; }
    }
    if (p.t === 'k') { drop(p.c, 'K'); drop(p.c, 'Q'); }
    if (p.t === 'r') {
      if (m.from === sq(p.c === 'w' ? 7 : 0, 0)) drop(p.c, 'Q');
      if (m.from === sq(p.c === 'w' ? 7 : 0, 7)) drop(p.c, 'K');
    }
    if (m.capture && m.capture.t === 'r') {
      if (m.to === sq(m.capture.c === 'w' ? 7 : 0, 0)) drop(m.capture.c, 'Q');
      if (m.to === sq(m.capture.c === 'w' ? 7 : 0, 7)) drop(m.capture.c, 'K');
    }

    if (m.double) n.ep = sq((rank(m.from) + rank(m.to)) / 2, file(m.from));
    if (isPawn) n.halfmove = 0;

    return n;
  }

  // Статус партии: 'playing' | 'check' | 'mate' | 'stalemate' |
  // 'draw-50' | 'draw-repetition' | 'draw-material'
  function gameStatus(s, positionHistory) {
    var moves = generateMoves(s);
    if (moves.length === 0) {
      if (inCheck(s, s.turn)) return 'mate';
      return 'stalemate';
    }
    if (s.halfmove >= 100) return 'draw-50';
    if (positionHistory) {
      var key = positionKey(s);
      var count = 0;
      for (var k of positionHistory) if (k === key) count++;
      if (count >= 3) return 'draw-repetition';
    }
    // недостаток материала: только короли, либо король+конь/слон против короля
    var pieces = [];
    for (var i = 0; i < 64; i++) {
      var p = s.board[i];
      if (p && p.t !== 'k') pieces.push(p.t);
    }
    if (pieces.length === 0) return 'draw-material';
    if (pieces.length === 1 && (pieces[0] === 'n' || pieces[0] === 'b')) return 'draw-material';
    return moves.length ? (inCheck(s, s.turn) ? 'check' : 'playing') : 'stalemate';
  }

  // Сокращённая алгебраическая нотация.
  // prev — состояние до хода; after — необязательное состояние после хода.
  function toSAN(prev, m, after) {
    if (!after) after = makeMove(prev, m);
    if (m.castle) {
      var base = m.castle === 'K' ? 'O-O' : 'O-O-O';
      return base + suffix(after);
    }
    var p = m.piece;
    var letter = p.t === 'p' ? '' : p.t.toUpperCase();
    var isCap = !!m.capture || !!m.ep;
    // уточнение исходной клетки при неоднозначности
    var disamb = '';
    if (p.t !== 'k' && p.t !== 'p') {
      var same = [];
      for (var i = 0; i < 64; i++) {
        if (i === m.from) continue;
        var q = prev.board[i];
        if (q && q.c === p.c && q.t === p.t) {
          var test = { from: i, to: m.to, piece: q, capture: prev.board[m.to] };
          var after2 = makeMove(prev, test);
          if (!inCheck(after2, p.c)) same.push(i);
        }
      }
      if (same.length) {
        var sameFile = same.some(function (x) { return file(x) === file(m.from); });
        var sameRank = same.some(function (x) { return rank(x) === rank(m.from); });
        if (!sameFile) disamb = 'abcdefgh'.charAt(file(m.from));
        else if (!sameRank) disamb = String(8 - rank(m.from));
        else disamb = algebra(m.from);
      }
    }
    if (p.t === 'p' && isCap) disamb = 'abcdefgh'.charAt(file(m.from));

    var s = letter + disamb + (isCap ? 'x' : '') + algebra(m.to);
    if (m.promo) s += '=' + m.promo.toUpperCase();
    if (m.ep) s += ' e.p.';
    return s + suffix(after);
  }

  function suffix(after) {
    var st = gameStatus(after);
    if (st === 'mate') return inCheck(after, after.turn) ? '#' : '';
    if (st === 'check') return '+';
    return '';
  }

  var api = {
    FEN_START: FEN_START,
    PIECES: PIECES,
    VAL: VAL,
    sq: sq, rank: rank, file: file,
    algebra: algebra, fromAlgebra: fromAlgebra,
    other: other,
    parseFEN: parseFEN, toFEN: toFEN, positionKey: positionKey,
    initialState: initialState,
    findKing: findKing,
    isAttacked: isAttacked, inCheck: inCheck,
    pseudoMoves: pseudoMoves, generateMoves: generateMoves,
    makeMove: makeMove, gameStatus: gameStatus,
    toSAN: toSAN
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (typeof window !== 'undefined') window.Chess = api;
})();
