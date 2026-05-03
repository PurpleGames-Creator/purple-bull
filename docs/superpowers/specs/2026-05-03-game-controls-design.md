# Purple Bull - ゲーム制御機能追加（1.5倍速 + 一時停止）

**日付**: 2026-05-03  
**プロジェクト**: Purple Bull  
**機能**: スピード制御（長押し1.5倍速） + 一時停止ボタン

---

## 概要

ゲーム画面に以下の2つの制御機能を追加します：
1. **1.5倍速機能**：フィールド内のどこかを0.5秒長押しすると、長押ししている間だけ1.5倍速でプレイできる
2. **一時停止ボタン**：スコアとフィールド間に立体的な一時停止ボタンを追加し、ゲームの一時停止/再開を可能にする

---

## 詳細設計

### 1. 一時停止ボタン（UI層）

**HTML の変更**

`index.html` の `game-header` 内に一時停止ボタンを追加：

```html
<header class="game-header">
  <span id="score-value" class="game-score-value">0</span>
  <button id="pause-button" class="pause-button" aria-label="ゲームを一時停止">
    ▶ ||
  </button>
  <button id="quit-button" class="quit-button">✕</button>
</header>
```

**CSS スタイル**

`styles.css` に以下のスタイルを追加：

```css
.pause-button {
  /* 配置と基本スタイル */
  position: relative;
  padding: 12px 24px;
  margin: 8px auto;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.2rem;
  font-weight: bold;
  transition: all 0.2s ease;
  
  /* 立体的なボタンデザイン */
  background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
  color: white;
  box-shadow: 
    0 4px 15px rgba(139, 92, 246, 0.4),
    inset 0 -2px 4px rgba(0, 0, 0, 0.2),
    inset 0 2px 4px rgba(255, 255, 255, 0.2);
  
  /* ホバー状態 */
  &:hover {
    box-shadow: 
      0 6px 20px rgba(139, 92, 246, 0.6),
      inset 0 -2px 4px rgba(0, 0, 0, 0.2),
      inset 0 2px 4px rgba(255, 255, 255, 0.2);
  }
  
  /* アクティブ状態（押下） */
  &:active {
    transform: translateY(2px);
    box-shadow: 
      0 2px 8px rgba(139, 92, 246, 0.4),
      inset 0 -1px 2px rgba(0, 0, 0, 0.2),
      inset 0 1px 2px rgba(255, 255, 255, 0.2);
  }
  
  /* 一時停止中の状態 */
  &.paused {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    box-shadow: 
      0 4px 15px rgba(217, 119, 6, 0.4),
      inset 0 -2px 4px rgba(0, 0, 0, 0.2),
      inset 0 2px 4px rgba(255, 255, 255, 0.2);
  }
}
```

---

### 2. 一時停止機能（ゲーム制御）

**game.js への変更**

Game クラスに以下を追加：

```javascript
class Game {
  constructor() {
    // ... 既存コード
    this.isPaused = false;  // 一時停止フラグ
  }
  
  // ゲームループ（既存の gameLoop を修正）
  gameLoop = () => {
    if (!this.isPaused) {
      this.update();
      this.render();
    } else {
      // 一時停止中は render のみ実行（画面は表示され続ける）
      this.render();
    }
    this.animationId = requestAnimationFrame(this.gameLoop);
  };
  
  // 一時停止/再開を切り替え
  togglePause() {
    this.isPaused = !this.isPaused;
  }
}
```

**main.js への変更**

一時停止ボタンのイベントリスナーを追加：

```javascript
const pauseButton = document.getElementById('pause-button');

pauseButton.addEventListener('click', () => {
  game.togglePause();
  
  // ボタンの状態を切り替え
  if (game.isPaused) {
    pauseButton.classList.add('paused');
  } else {
    pauseButton.classList.remove('paused');
  }
  
  // 効果音を再生
  playClickSound();  // 既存の効果音再生関数を使用
});
```

---

### 3. 1.5倍速機能（フィールド長押し）

**game.js への変更**

```javascript
class Game {
  constructor() {
    // ... 既存コード
    this.isSpeedBoost = false;  // 倍速フラグ
  }
  
  update() {
    // 倍速時は TICK を 2/3 に調整（速度を1.5倍にする）
    const effectiveTick = this.isSpeedBoost ? Math.floor(this.TICK * 2 / 3) : this.TICK;
    
    // 既存の update ロジック内で TICK の代わりに effectiveTick を使用
    // フレーム更新の判定時に effectiveTick を参照
  }
  
  setSpeedBoost(active) {
    this.isSpeedBoost = active;
  }
}
```

**main.js への変更**

フィールド（canvas）の長押し検出：

```javascript
const gameCanvas = document.getElementById('game-field');
let longPressTimer = null;
let isLongPressing = false;

gameCanvas.addEventListener('touchstart', (e) => {
  if (!gameRunning) return;
  
  longPressTimer = setTimeout(() => {
    isLongPressing = true;
    game.setSpeedBoost(true);
  }, 500);  // 0.5秒
});

gameCanvas.addEventListener('touchend', () => {
  clearTimeout(longPressTimer);
  if (isLongPressing) {
    game.setSpeedBoost(false);
    isLongPressing = false;
  }
});

// マウスイベント（デスクトップ対応）
gameCanvas.addEventListener('mousedown', (e) => {
  if (!gameRunning) return;
  
  longPressTimer = setTimeout(() => {
    isLongPressing = true;
    game.setSpeedBoost(true);
  }, 500);
});

gameCanvas.addEventListener('mouseup', () => {
  clearTimeout(longPressTimer);
  if (isLongPressing) {
    game.setSpeedBoost(false);
    isLongPressing = false;
  }
});
```

---

### 4. 効果音（一時停止ボタン）

**main.js での効果音再生**

一時停止ボタンクリック時に「カチっ」という効果音を再生：

```javascript
pauseButton.addEventListener('click', () => {
  game.togglePause();
  
  // UI 状態更新
  if (game.isPaused) {
    pauseButton.classList.add('paused');
  } else {
    pauseButton.classList.remove('paused');
  }
  
  // 効果音再生（既存の _playMeatSound() と同じ仕組みを使用）
  playClickSound();  // または audioContext を使用
});
```

既存の効果音システム（`supabase-api.js` の `playMeatSound()` など）と同じアプローチで実装。
シンプルな「カチっ」という短い効果音を再生。

---

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|--------|
| `index.html` | `game-header` に `pause-button` 要素を追加 |
| `styles.css` | `.pause-button` のスタイル追加（立体デザイン、ホバー、アクティブ、paused状態） |
| `game.js` | `isPaused`, `isSpeedBoost` フラグを追加、`togglePause()`, `setSpeedBoost()` メソッド追加、`gameLoop` と `update` を修正 |
| `main.js` | 一時停止ボタンのイベントリスナー追加、フィールド長押し検出ロジック追加、効果音再生処理追加 |

---

## テスト計画

### 一時停止ボタン
- [ ] ボタンをクリックするとゲームが停止する
- [ ] 停止中にボタンをクリックするとゲームが再開する
- [ ] ボタンの `.paused` クラスが適切に切り替わる
- [ ] ボタンクリック時に「カチっ」という効果音が再生される

### 1.5倍速機能
- [ ] フィールド内をタッチして0.5秒経過後、ゲームが1.5倍速になる
- [ ] タッチを離すと通常速度に戻る
- [ ] 0.5秒以内にタッチを離すと倍速にならない
- [ ] 一時停止中は倍速が機能しない（update が実行されないため）
- [ ] マウス（デスクトップ）でも同じ動作が可能

---

## 実装上の注意点

1. **TICK の調整方法**：
   - 既存の `TICK` は複数の場所で参照されている
   - `update()` 内で `effectiveTick` を計算し、フレーム判定で使用

2. **一時停止の細部**：
   - 一時停止中も画面は描画され続ける（`render()` は実行される）
   - ゲームロジック（`update()`）のみ実行されない

3. **長押しとゲーム状態**：
   - ゲーム中でのみ長押し検出を有効にする
   - ゲームオーバー後は長押し機能を無効にする

4. **効果音**：
   - 既存の効果音システム（audio context）と同じ仕組みを使用
   - 短くて目立つ「カチっ」という音が理想的
