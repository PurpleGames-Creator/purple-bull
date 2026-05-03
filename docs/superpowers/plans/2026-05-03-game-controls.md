# ゲーム制御機能（1.5倍速 + 一時停止）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** フィールド長押しで1.5倍速、一時停止ボタン（立体デザイン）を追加し、ゲーム中の時間制御を実装する

**Architecture:** 
- 一時停止機能：ゲームループで `isPaused` フラグをチェック、フラグに応じて update を実行/スキップ
- 1.5倍速機能：フィールド長押し検出（0.5秒）→ `isSpeedBoost` フラグ → update 内で `effectiveTick` を計算して速度調整
- 効果音：既存の効果音システムを活用して「カチっ」という音を再生

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript, Canvas API

---

## ファイル構成

| ファイル | 責務 |
|---------|-----|
| `index.html` | ゲーム画面のマークアップ（一時停止ボタン要素追加） |
| `styles.css` | 一時停止ボタンの立体デザイン |
| `game.js` | ゲーム状態管理（isPaused, isSpeedBoost）と制御メソッド、倍速対応のロジック |
| `main.js` | イベントリスナー（ボタンクリック、長押し検出）、効果音再生 |

---

## Task 1: 一時停止ボタンの HTML 追加

**Files:**
- Modify: `index.html:68-71`

- [ ] **Step 1: game-header に pause-button 要素を追加**

現在のヘッダー（68-71行）：
```html
<header class="game-header">
  <span id="score-value" class="game-score-value">0</span>
  <button id="quit-button" class="quit-button" type="button" aria-label="ゲームを終了">✕</button>
</header>
```

以下に変更：
```html
<header class="game-header">
  <span id="score-value" class="game-score-value">0</span>
  <button id="pause-button" class="pause-button" type="button" aria-label="ゲームを一時停止">▶ ||</button>
  <button id="quit-button" class="quit-button" type="button" aria-label="ゲームを終了">✕</button>
</header>
```

- [ ] **Step 2: ブラウザで確認（ボタンが表示されるか）**

Purple Bull のゲーム画面を開いて、スコアとフィールドの間に「▶ ||」というテキストが表示されていることを確認してください。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add pause button to game header"
```

---

## Task 2: 一時停止ボタンの CSS スタイル（立体デザイン）

**Files:**
- Modify: `styles.css`（`.game-header` の直後に新規セクション追加）

- [ ] **Step 1: styles.css の最後に pause-button スタイルを追加**

現在の `.game-header` セクションを確認した後、その直下に以下を追加：

```css
.pause-button {
  /* レイアウト */
  padding: 12px 24px;
  margin: 8px auto;
  display: block;
  
  /* 基本スタイル */
  background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.2rem;
  font-weight: bold;
  
  /* 立体効果 */
  box-shadow: 
    0 4px 15px rgba(139, 92, 246, 0.4),
    inset 0 -2px 4px rgba(0, 0, 0, 0.2),
    inset 0 2px 4px rgba(255, 255, 255, 0.2);
  
  /* トランジション */
  transition: all 0.2s ease;
}

.pause-button:hover {
  box-shadow: 
    0 6px 20px rgba(139, 92, 246, 0.6),
    inset 0 -2px 4px rgba(0, 0, 0, 0.2),
    inset 0 2px 4px rgba(255, 255, 255, 0.2);
}

.pause-button:active {
  transform: translateY(2px);
  box-shadow: 
    0 2px 8px rgba(139, 92, 246, 0.4),
    inset 0 -1px 2px rgba(0, 0, 0, 0.2),
    inset 0 1px 2px rgba(255, 255, 255, 0.2);
}

.pause-button.paused {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 
    0 4px 15px rgba(217, 119, 6, 0.4),
    inset 0 -2px 4px rgba(0, 0, 0, 0.2),
    inset 0 2px 4px rgba(255, 255, 255, 0.2);
}
```

- [ ] **Step 2: ブラウザで確認（ボタンの見た目）**

Purple Bull のゲーム画面を開いて、ボタンが紫色の立体的なデザインで表示されていることを確認してください。ボタンにマウスをホバーすると、シャドウが強くなることを確認してください。

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: add 3D pause button styling"
```

---

## Task 3: Game クラスに isPaused フラグと togglePause メソッド追加

**Files:**
- Modify: `game.js:30-40`（constructor 内）

- [ ] **Step 1: constructor に isPaused フラグを追加**

game.js の constructor 内（約30-40行目）に以下を追加：

```javascript
this.isPaused = false;  // 一時停止フラグ
```

正確な挿入位置は、他のフラグ（例：`this._snakeSet = null` など）の近くに配置してください。

- [ ] **Step 2: Game クラスに togglePause メソッドを追加**

Game クラスの適切な場所（例えば gameLoop メソッドの前）に以下を追加：

```javascript
togglePause() {
  this.isPaused = !this.isPaused;
}
```

- [ ] **Step 3: コンソール確認（フラグが存在するか）**

ブラウザのコンソールで以下を実行：
```javascript
console.log(typeof game.togglePause);  // "function" が出力されればOK
console.log(game.isPaused);  // false が出力されればOK
```

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add isPaused flag and togglePause method to Game class"
```

---

## Task 4: gameLoop を修正して isPaused フラグに対応

**Files:**
- Modify: `game.js`（gameLoop メソッド）

- [ ] **Step 1: 現在の gameLoop メソッドを確認**

game.js 内で `gameLoop = () => { ... }` の行を探してください。以下のような構造のはずです：

```javascript
gameLoop = () => {
  this.update();
  this.render();
  this.animationId = requestAnimationFrame(this.gameLoop);
};
```

- [ ] **Step 2: gameLoop を修正**

以下のように修正（`this.update()` の前に isPaused チェックを追加）：

```javascript
gameLoop = () => {
  if (!this.isPaused) {
    this.update();
  }
  this.render();
  this.animationId = requestAnimationFrame(this.gameLoop);
};
```

**重要**: `render()` は常に実行される（一時停止中も画面は表示される）。`update()` のみ一時停止フラグでスキップします。

- [ ] **Step 3: ゲーム画面でテスト（手動確認）**

ゲームを開始して、ゲームが実行されることを確認してください。（まだボタンの機能は実装していないので、ゲーム画面には特に変化はありません。）

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add isPaused check to gameLoop"
```

---

## Task 5: main.js に一時停止ボタンのイベントリスナー追加

**Files:**
- Modify: `main.js`（他のボタンイベントリスナーの近くに追加）

- [ ] **Step 1: 一時停止ボタンのリファレンスを取得**

main.js で、他のボタン（`startButton`, `quitButton` など）が定義されている場所の近くに以下を追加：

```javascript
const pauseButton = document.getElementById('pause-button');
```

- [ ] **Step 2: クリックイベントリスナーを追加**

以下のコードを適切な場所（例えば startButton のイベントリスナー定義の近く）に追加：

```javascript
pauseButton.addEventListener('click', () => {
  if (!game) return;  // ゲームが実行中でなければ何もしない
  
  game.togglePause();
  
  // UI 状態を切り替え
  if (game.isPaused) {
    pauseButton.classList.add('paused');
  } else {
    pauseButton.classList.remove('paused');
  }
});
```

- [ ] **Step 3: ゲーム画面でテスト（一時停止ボタン）**

1. ゲームを開始
2. 一時停止ボタンをクリック → ゲーム画面がフリーズすることを確認
3. ボタンが橙色に切り替わることを確認
4. ボタンをもう一度クリック → ゲーム画面が再開されることを確認
5. ボタンが紫色に戻ることを確認

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "feat: add pause button click listener"
```

---

## Task 6: 効果音再生処理を追加

**Files:**
- Modify: `main.js`（pauseButton のイベントリスナー内）

- [ ] **Step 1: 効果音再生関数を確認**

main.js または game.js を検索して、既存の効果音再生機能を探します。通常は以下のいずれかがあります：
- `playMeatSound()` 関数
- `audioContext` を使用した音声生成

- [ ] **Step 2: pauseButton のイベントリスナーに効果音追加**

Task 5 で追加したイベントリスナーを修正し、`game.togglePause()` の後に効果音再生処理を追加：

```javascript
pauseButton.addEventListener('click', () => {
  if (!game) return;
  
  game.togglePause();
  
  // UI 状態を切り替え
  if (game.isPaused) {
    pauseButton.classList.add('paused');
  } else {
    pauseButton.classList.remove('paused');
  }
  
  // 効果音再生
  if (game.audioContext && game.audioContext.state === 'running') {
    // 既存の playMeatSound() と同じ方式で実装
    const now = game.audioContext.currentTime;
    const osc = game.audioContext.createOscillator();
    const gain = game.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(game.audioContext.destination);
    
    osc.frequency.value = 1000;  // 周波数
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc.start(now);
    osc.stop(now + 0.1);
  }
});
```

- [ ] **Step 3: ゲーム画面でテスト（効果音）**

1. ゲームを開始
2. 一時停止ボタンをクリック → 「カチっ」という音が聞こえることを確認
3. ボタンをもう一度クリック → 再度「カチっ」という音が聞こえることを確認

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "feat: add click sound effect to pause button"
```

---

## Task 7: Game クラスに isSpeedBoost フラグと setSpeedBoost メソッド追加

**Files:**
- Modify: `game.js:30-40`（constructor 内）

- [ ] **Step 1: constructor に isSpeedBoost フラグを追加**

Task 3 で追加した `this.isPaused = false;` の近くに以下を追加：

```javascript
this.isSpeedBoost = false;  // 倍速フラグ
```

- [ ] **Step 2: setSpeedBoost メソッドを追加**

Game クラスに以下を追加：

```javascript
setSpeedBoost(active) {
  this.isSpeedBoost = active;
}
```

- [ ] **Step 3: コンソール確認**

ブラウザのコンソール：
```javascript
console.log(game.isSpeedBoost);  // false が出力されればOK
game.setSpeedBoost(true);
console.log(game.isSpeedBoost);  // true が出力されればOK
```

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add isSpeedBoost flag and setSpeedBoost method"
```

---

## Task 8: game.js の update メソッドを修正して倍速対応

**Files:**
- Modify: `game.js`（update メソッド内）

- [ ] **Step 1: update メソッドの冒頭を確認**

game.js の update メソッドの開始部分を探してください。以下のような構造のはずです：

```javascript
update() {
  // フレーム更新判定
  if (this.frameCount % this.TICK === 0) {
    // スネーク移動ロジック
  }
  // ...
}
```

- [ ] **Step 2: update メソッドの冒頭に effectiveTick 計算を追加**

update メソッドの最初に以下を追加：

```javascript
update() {
  // 倍速時は TICK を 2/3 に調整
  const effectiveTick = this.isSpeedBoost ? Math.floor(this.TICK * 2 / 3) : this.TICK;
  
  // フレーム更新判定（既存コードは this.TICK → effectiveTick に変更）
  if (this.frameCount % effectiveTick === 0) {
    // スネーク移動ロジック...
  }
  // ...
}
```

**重要**: update メソッド内で `this.TICK` が複数出現する場合、**すべて** `effectiveTick` に置き換えてください。確認方法：

```bash
grep -n "this.TICK" game.js
```

を実行して、update メソッド内の `this.TICK` をすべて把握してください。

- [ ] **Step 3: 手動テスト（倍速ロジック確認）**

コンソール：
```javascript
console.log(game.TICK);  // 現在の TICK 値（例：3）
console.log(game.isSpeedBoost);  // false
game.setSpeedBoost(true);
console.log(game.isSpeedBoost);  // true
// この状態で update() 内では effectiveTick = Math.floor(3 * 2/3) = 2 になる
```

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add speed boost calculation to update method"
```

---

## Task 9: main.js に長押し検出ロジックを追加

**Files:**
- Modify: `main.js`

- [ ] **Step 1: 長押し検出用の変数を定義**

main.js のスクリプトの冒頭（他のグローバル変数定義の近く）に以下を追加：

```javascript
let longPressTimer = null;
let isLongPressing = false;
```

- [ ] **Step 2: touchstart イベントリスナーを追加**

canvas に対するイベントリスナーを探してください（hero-canvas のリスナーの近く）。game-field canvas に対して以下を追加：

```javascript
const gameCanvas = document.getElementById('game-field');

gameCanvas.addEventListener('touchstart', (e) => {
  // ゲーム実行中でない、または一時停止中は長押し検出しない
  if (!screenGame.classList.contains('screen--active') || !game || game.isPaused) return;
  
  longPressTimer = setTimeout(() => {
    isLongPressing = true;
    game.setSpeedBoost(true);
  }, 500);  // 0.5秒
});
```

- [ ] **Step 3: touchend イベントリスナーを追加**

同じ game-field canvas に対して以下を追加：

```javascript
gameCanvas.addEventListener('touchend', () => {
  clearTimeout(longPressTimer);
  if (isLongPressing) {
    game.setSpeedBoost(false);
    isLongPressing = false;
  }
});
```

- [ ] **Step 4: mousedown イベントリスナーを追加（デスクトップ対応）**

デスクトップでのテストを可能にするため、以下を追加：

```javascript
gameCanvas.addEventListener('mousedown', (e) => {
  // ゲーム実行中でない、または一時停止中は長押し検出しない
  if (!screenGame.classList.contains('screen--active') || !game || game.isPaused) return;
  
  longPressTimer = setTimeout(() => {
    isLongPressing = true;
    game.setSpeedBoost(true);
  }, 500);
});
```

- [ ] **Step 5: mouseup イベントリスナーを追加**

```javascript
gameCanvas.addEventListener('mouseup', () => {
  clearTimeout(longPressTimer);
  if (isLongPressing) {
    game.setSpeedBoost(false);
    isLongPressing = false;
  }
});
```

- [ ] **Step 6: ゲーム画面でテスト（長押し検出）**

1. ゲームを開始
2. フィールド内の任意の場所をマウスで長押し（0.5秒以上）→ ゲームが高速になることを確認
3. マウスを離す → 通常速度に戻ることを確認
4. 0.5秒未満のクリックをしても倍速にならないことを確認

- [ ] **Step 7: Commit**

```bash
git add main.js
git commit -m "feat: add long press detection for speed boost on game field"
```

---

## Task 10: 全機能テスト・動作確認

**Files:**
- Test: ゲーム画面全体

- [ ] **Step 1: 一時停止ボタンの機能テスト**

- ゲームを開始
- 一時停止ボタンをクリック → ゲームが停止
- ボタンが橙色に変わる
- 効果音が再生される
- もう一度クリック → ゲーム再開、ボタンが紫色に戻る

- [ ] **Step 2: 長押し倍速機能のテスト**

- ゲームを開始
- フィールドを長押し（0.5秒以上）
- スネークの動きが速くなることを確認
- 指を離す → 通常速度に戻る
- 0.5秒未満のタップでは倍速にならないことを確認

- [ ] **Step 3: 一時停止中の長押しテスト**

- ゲーム開始 → 一時停止
- 一時停止中にフィールドを長押し → 倍速にならないことを確認
- 再開 → 長押しして倍速が機能することを確認

- [ ] **Step 4: ゲームオーバーテスト**

- ゲームをプレイしてゲームオーバーになる
- ゲームオーバー後、一時停止ボタンが機能しないことを確認
- 「再挑戦」で新しいゲームが開始されることを確認

- [ ] **Step 5: 最終確認**

すべての機能が正常に動作することを確認したら、以下のコマンドを実行：

```bash
git log --oneline | head -10
```

最後の10個のコミットに Task 1-9 が含まれていることを確認してください。

- [ ] **Step 6: 最終 Commit（全機能確認完了）**

```bash
git add -A
git commit -m "test: verify all game control features work correctly"
```

---

## サマリー

✅ HTML：一時停止ボタン要素追加  
✅ CSS：立体的なボタンデザイン  
✅ JS (Game)：isPaused, isSpeedBoost フラグ、togglePause, setSpeedBoost メソッド  
✅ JS (Main)：ボタンクリック、長押し検出、効果音再生  
✅ テスト：全機能動作確認
