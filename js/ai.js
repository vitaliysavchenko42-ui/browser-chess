/* Компьютерный противник: минимакс с альфа-бета отсечением.
   Уровни: 1 — новичок (шумная оценка, маленькая глубина),
           2 — средний (глубина 2),
           3 — сильный (глубина до 3–4 с ограничением времени). */

(function () {
  'use strict';

  var C = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : window.Chess;

  // Таблицы позиционной ценности (с точки зрения белых, индекс 0 = a8)
  var PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20
    ],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0
    ],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20
    ],
    k: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20
    ]
  };

  // Оценка позиции с точки зрения белых (в сантипешках)
  function evaluate(s) {
    var score = 0;
    for (var i = 0; i < 64; i++) {
      var p = s.board[i];
      if (!p) continue;
      var v = C.VAL[p.t] + PST[p.t][i];
      score += p.c === 'w' ? v : -v;
    }
    return score;
  }

  // С точки зрения стороны, которая делает ход
  function evalFor(s) {
    return s.turn === 'w' ? evaluate(s) : -evaluate(s);
  }

  function moveScore(m) {
    var s = 0;
    if (m.capture) s += 10 * C.VAL[m.capture.t] - C.VAL[m.piece.t];
    if (m.promo) s += C.VAL[m.promo];
    return s;
  }

  function orderMoves(moves) {
    return moves.slice().sort(function (a, b) { return moveScore(b) - moveScore(a); });
  }

  var NODES = 0;
  var DEADLINE = 0;
  var OUT_OF_TIME = {};

  function search(s, depth, alpha, beta) {
    NODES++;
    if ((NODES & 1023) === 0 && Date.now() > DEADLINE) throw OUT_OF_TIME;
    var moves = C.generateMoves(s);
    if (moves.length === 0) {
      return C.inCheck(s, s.turn) ? -99999 : 0; // мат или пат
    }
    if (s.halfmove >= 100) return 0;
    if (depth === 0) return evalFor(s);
    moves = orderMoves(moves);
    var best = -Infinity;
    for (var m of moves) {
      var v = -search(C.makeMove(s, m), depth - 1, -beta, -alpha);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Выбор хода. level: 1..3. Возвращает ход из списка legal (или null).
  function chooseMove(state, legalMoves, level) {
    if (!legalMoves || !legalMoves.length) return null;
    if (legalMoves.length === 1) return legalMoves[0];

    if (level === 1) {
      // Новичок: случайный ход из трети лучших по оценке глубины 1
      var scored = legalMoves.map(function (m) {
        var a = C.makeMove(state, m);
        return { m: m, v: evalFor(a) };
      }).sort(function (x, y) { return y.v - x.v; });
      var pool = scored.slice(0, Math.max(3, Math.ceil(scored.length / 3)));
      return pool[Math.floor(Math.random() * pool.length)].m;
    }

    var maxDepth = level === 2 ? 2 : 3;
    var timeLimit = level === 3 ? 1400 : 700;
    NODES = 0;
    DEADLINE = Date.now() + timeLimit;

    var ordered = orderMoves(legalMoves);
    var best = ordered[0];

    try {
      for (var depth = 1; depth <= maxDepth; depth++) {
        var alpha = -Infinity, localBest = null, localScore = -Infinity;
        for (var m of ordered) {
          var v = -search(C.makeMove(state, m), depth - 1, -Infinity, -alpha);
          if (v > localScore) { localScore = v; localBest = m; }
          if (v > alpha) alpha = v;
        }
        if (localBest) best = localBest;
        ordered = orderMoves(legalMoves);
      }
    } catch (e) {
      if (e !== OUT_OF_TIME) throw e;
      // время истекло — берём лучший ход последнего полностью пройденного слоя
    }
    return best;
  }

  var api = { chooseMove: chooseMove, evaluate: evaluate };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (typeof window !== 'undefined') window.ChessAI = api;
})();
