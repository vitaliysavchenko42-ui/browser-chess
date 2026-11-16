/* Автотесты движка: перфет-счёты по эталонным позициям + спецправила.
   Запуск: node js/rules.test.js  (без зависимостей) */
'use strict';
var Chess = require('./rules.js');
var assert = require('assert');

function perft(s, depth) {
  if (depth === 0) return 1;
  var n = 0;
  for (var m of Chess.generateMoves(s)) {
    n += perft(Chess.makeMove(s, m), depth - 1);
  }
  return n;
}

var cases = [
  // [название, FEN, [ожидания по глубинам 1..N]] — эталоны с chessprogramming.org/Perft_Results
  ['стартовая позиция', Chess.FEN_START, [20, 400, 8902, 197281]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['позиция 3 (пешки, e.p.)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['позиция 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['позиция 5 (promo)', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['позиция 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]]
];

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok  -', name); }
  catch (e) { failed++; console.log('FAIL-', name, '::', e.message); }
}

for (var c of cases) {
  (function (c) {
    var s = Chess.parseFEN(c[1]);
    for (var d = 0; d < c[2].length; d++) {
      (function (d) {
        test(c[0] + ' перфет ' + (d + 1) + ' = ' + c[2][d], function () {
          assert.strictEqual(perft(s, d + 1), c[2][d]);
        });
      })(d);
    }
  })(c);
}

// Рокировка: короткая
test('рокировка O-O выполняется', function () {
  var s = Chess.parseFEN('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  var m = Chess.generateMoves(s).find(function (x) { return x.castle === 'K'; });
  assert(m, 'ход O-O не найден');
  var after = Chess.makeMove(s, m);
  assert.strictEqual(Chess.toFEN(after).split(' ')[0], 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1');
  assert.strictEqual(after.castling.wK, false);
});

// Взятие на проходе
test('взятие на проходе снимает пешку соперника', function () {
  var s = Chess.parseFEN('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  var m = Chess.generateMoves(s).find(function (x) { return x.ep; });
  assert(m, 'ход e.p. не найден');
  var after = Chess.makeMove(s, m);
  assert.strictEqual(after.board[Chess.fromAlgebra('d5')], null);
  assert.strictEqual(Chess.algebra(m.to), 'd6');
});

// Превращение
test('превращение создаёт выбранную фигуру', function () {
  var s = Chess.parseFEN('8/P7/8/8/8/8/8/K6k w - - 0 1');
  var m = Chess.generateMoves(s).find(function (x) { return x.promo === 'n'; });
  assert(m, 'ход превращения в коня не найден');
  var after = Chess.makeMove(s, m);
  assert.strictEqual(after.board[Chess.fromAlgebra('a8')].t, 'n');
});

// Мат в 2: сиротский мат
test('определяется мат', function () {
  var s = Chess.parseFEN('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  assert.strictEqual(Chess.gameStatus(s), 'mate');
});

// Пат
test('определяется пат', function () {
  var s = Chess.parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.strictEqual(Chess.gameStatus(s), 'stalemate');
});

// Ничья: недостаток материала
test('недостаток материала — ничья', function () {
  var s = Chess.parseFEN('8/8/8/8/8/2k5/2n5/2K5 w - - 0 1');
  assert.strictEqual(Chess.gameStatus(s), 'draw-material');
});

// Ничья: 50 ходов (счётчик достигает 100)
test('правило 50 ходов', function () {
  var s = Chess.parseFEN('7k/8/8/8/8/8/8/K6R w - - 100 60');
  assert.strictEqual(Chess.gameStatus(s), 'draw-50');
  var s2 = Chess.parseFEN('7k/8/8/8/8/8/8/K6R w - - 99 60');
  assert.strictEqual(Chess.gameStatus(s2), 'playing');
});

test('SAN: простой ход и взятие', function () {
  var s = Chess.initialState();
  var e4 = Chess.generateMoves(s).find(function (m) { return Chess.algebra(m.from) === 'e2' && Chess.algebra(m.to) === 'e4'; });
  assert.strictEqual(Chess.toSAN(s, e4), 'e4');
  var after = Chess.makeMove(s, e4);
  var c5 = Chess.generateMoves(after).find(function (m) { return Chess.algebra(m.to) === 'c5'; });
  assert.strictEqual(Chess.toSAN(after, c5), 'c5');
});

test('SAN: взятие пешкой с указанием линии', function () {
  // 1.e4 d5 2.exd5 — реальный сценарий из стартовой позиции
  var s = Chess.initialState();
  var e4 = Chess.generateMoves(s).find(function (m) { return Chess.algebra(m.to) === 'e4'; });
  var a1 = Chess.makeMove(s, e4);
  var d5 = Chess.generateMoves(a1).find(function (m) { return Chess.algebra(m.to) === 'd5'; });
  var a2 = Chess.makeMove(a1, d5);
  var exd5 = Chess.generateMoves(a2).find(function (x) { return Chess.algebra(x.to) === 'd5'; });
  assert(exd5, 'ход exd5 не найден');
  assert.strictEqual(Chess.toSAN(a2, exd5), 'exd5');
});

// Ход, оставляющий короля под боем, невозможен
test('ход королём под бой запрещён', function () {
  var s = Chess.parseFEN('4k3/8/8/8/8/8/8/4K2r w - - 0 1');
  var moves = Chess.generateMoves(s);
  var kingMoves = moves.filter(function (m) { return m.piece.t === 'k'; })
    .map(function (m) { return Chess.algebra(m.to); }).sort();
  // король под шахом от ладьи h1: f1 и g1 биты, можно уйти только на 2-ю горизонталь
  assert.deepStrictEqual(kingMoves, ['d2', 'e2', 'f2']);
});

// Троекратное повторение
test('троекратное повторение — ничья', function () {
  var s = Chess.initialState();
  var keys = [Chess.positionKey(s)];
  function findMove(st, from, to) {
    return Chess.generateMoves(st).find(function (m) { return m.from === Chess.fromAlgebra(from) && m.to === Chess.fromAlgebra(to); });
  }
  var seq = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'],
             ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']];
  var st = s;
  for (var pair of seq) {
    st = Chess.makeMove(st, findMove(st, pair[0], pair[1]));
    keys.push(Chess.positionKey(st));
  }
  assert.strictEqual(Chess.gameStatus(st, keys), 'draw-repetition');
});

console.log('\nИтог: прошло ' + passed + ', упало ' + failed);
process.exit(failed ? 1 : 0);
