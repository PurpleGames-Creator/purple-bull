class BullGame {
  constructor({ fieldEl, scoreEl, nickname }) {
    this.GRID  = 15;
    this.TICK  = 300;
    this.fieldEl  = fieldEl;
    this.scoreEl  = scoreEl;
    this.nickname = nickname;

    this.cells    = [];   // cells[row][col] = HTMLElement
    this.snake    = [];   // [{row, col}, ...] head は index 0
    this.dir      = { dr: 0, dc: 1 };
    this.nextDir  = { dr: 0, dc: 1 };
    this.moveDirHistory = [{ dr: 0, dc: 1 }];  // 移動方向の履歴（セグメント別のタイムラグ用）
    this.meat     = null; // {row, col}
    this.score    = 0;
    this.running  = false;
    this.timerId  = null;
    this.headEl   = null;
    this._bodyPool = [];
    this._firstRender = true;
    this.bgm = null;
    this.keyQueue = [];
  }

  start() {
    this._buildGrid();
    this._placeSnake();
    this._placeMeat();
    this._render();
    this.running = true;
    this.timerId = setInterval(() => this._tick(), this.TICK);

    if (!this.bgm) {
      this.bgm = new Audio('./bgm.mp3');
      this.bgm.loop = true;
      this.bgm.volume = 0.5;
    }
    this.bgm.currentTime = 0;
    this.bgm.play().catch(err => console.warn('Failed to play BGM:', err));
  }

  destroy() {
    clearInterval(this.timerId);
    this.running = false;

    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
    }
  }

  setDirection(dr, dc) {
    // 逆方向転換を無視（即死防止）
    if (dr === -this.nextDir.dr && dc === -this.nextDir.dc) return;

    // マスのど真ん中までは方向転換可能：2マス先が体と衝突するかをチェック
    const head = this.snake[0];
    const second = this.snake[1];
    if (second) {
      const nextHeadRow = head.row + this.nextDir.dr + dr;
      const nextHeadCol = head.col + this.nextDir.dc + dc;
      if (nextHeadRow === second.row && nextHeadCol === second.col) {
        return;
      }
    }

    // 方向転換時に音声を再生（nextDir と異なる場合のみ）
    if (dr !== this.nextDir.dr || dc !== this.nextDir.dc) {
      this._playSound('bashi.mp3');
    }

    this.dir = { dr, dc };      // 頭の向きを即座に更新
    this.nextDir = { dr, dc };  // 移動方向も更新
  }

  // ---- private ----

  _buildGrid() {
    this.fieldEl.innerHTML = '';
    this.cells = [];
    this._firstRender = true;
    const frag = document.createDocumentFragment();
    for (let r = 0; r < this.GRID; r++) {
      this.cells[r] = [];
      for (let c = 0; c < this.GRID; c++) {
        const el = document.createElement('div');
        el.className = 'cell ' + ((r + c) % 2 === 0 ? 'cell--grass' : 'cell--grass-b');
        this.cells[r][c] = el;
        frag.appendChild(el);
      }
    }
    this.fieldEl.appendChild(frag);

    this._bodyPool = [];

    this.headEl = document.createElement('div');
    this.headEl.className = 'snake-head';
    this.fieldEl.appendChild(this.headEl);
  }

  _placeSnake() {
    const mid = Math.floor(this.GRID / 2);
    this.snake   = [{ row: mid, col: mid }];
    this.dir     = { dr: 0, dc: 1 };
    this.nextDir = { dr: 0, dc: 1 };
    this.moveDirHistory = [{ dr: 0, dc: 1 }];
    this.score   = 0;
  }

  _placeMeat() {
    const snakeSet = new Set(this.snake.map(s => s.row * this.GRID + s.col));
    const empty = [];
    for (let r = 0; r < this.GRID; r++) {
      for (let c = 0; c < this.GRID; c++) {
        if (!snakeSet.has(r * this.GRID + c)) empty.push({ row: r, col: c });
      }
    }
    this.meat = empty[Math.floor(Math.random() * empty.length)] ?? null;
  }

  _render() {
    // 全セルをグラスに戻す
    for (let r = 0; r < this.GRID; r++) {
      for (let c = 0; c < this.GRID; c++) {
        const el = this.cells[r][c];
        el.className = 'cell ' + ((r + c) % 2 === 0 ? 'cell--grass' : 'cell--grass-b');
      }
    }

    // 肉
    if (this.meat) {
      this.cells[this.meat.row][this.meat.col].classList.add('cell--meat');
    }

    // 頭と体を絶対配置要素で描画
    this._moveHead();
    this._renderBody();
  }

  _renderBody() {
    for (let i = 1; i < this.snake.length; i++) {
      const { row, col } = this.snake[i];
      const cellEl = this.cells[row][col];
      const poolIdx = i - 1;
      const isNew = poolIdx >= this._bodyPool.length;

      if (isNew) {
        const el = document.createElement('div');
        el.className = 'snake-body';
        this.fieldEl.insertBefore(el, this.headEl);
        this._bodyPool.push(el);
      }

      const el = this._bodyPool[poolIdx];
      const needsInit = !el.dataset.placed;
      const bodyRotate = this._segmentRotateDeg(i);

      if (needsInit) {
        el.style.transition = 'none';
        el.style.width  = cellEl.offsetWidth  + 'px';
        el.style.height = cellEl.offsetHeight + 'px';
        el.dataset.placed = '1';
      }

      el.style.display = '';
      el.style.transform = `translate(${cellEl.offsetLeft}px, ${cellEl.offsetTop}px) rotate(${bodyRotate}deg)`;

      if (needsInit) {
        el.getBoundingClientRect(); // force reflow
        el.style.transition = '';
      }
    }

    for (let i = this.snake.length - 1; i < this._bodyPool.length; i++) {
      this._bodyPool[i].style.display = 'none';
    }
  }

  _segmentRotateDeg(i) {
    // セグメント i は iフレーム前の移動方向で描画
    const targetMoveDir = this.moveDirHistory[i - 1];
    if (!targetMoveDir) return 0;

    const { dr, dc } = targetMoveDir;
    if (dc === 1)  return 90;
    if (dc === -1) return 270;
    if (dr === 1)  return 180;
    return 0;
  }

  _moveHead() {
    const { row, col } = this.snake[0];
    const cellEl = this.cells[row][col];
    const h = this.headEl;
    const headRotate = this._headRotateDeg();

    if (this._firstRender) {
      h.style.transition = 'none';
      h.style.width  = cellEl.offsetWidth  + 'px';
      h.style.height = cellEl.offsetHeight + 'px';
      h.style.transform = `translate(${cellEl.offsetLeft}px, ${cellEl.offsetTop}px) rotate(${headRotate}deg)`;
      h.getBoundingClientRect(); // force reflow
      h.style.transition = '';
      this._firstRender = false;
    } else {
      h.style.transform = `translate(${cellEl.offsetLeft}px, ${cellEl.offsetTop}px) rotate(${headRotate}deg)`;
    }
  }

  _headRotateDeg() {
    const { dr, dc } = this.dir;
    if (dc === 1)  return 90;   // right
    if (dc === -1) return 270;  // left
    if (dr === 1)  return 180;  // down
    return 0;                   // up
  }

  _startGameOverWithSound(soundFile) {
    clearInterval(this.timerId);
    this.timerId = null;
    this.running = false;

    // 衝突音を再生
    this._playSound(soundFile);

    // 0.4秒後に ushi.mp3 を鳴らす
    setTimeout(() => {
      this._playSound('ushi.mp3');
    }, 400);

    // 頭を壁/自分の方向へ半セル分めり込ませる
    const cellEl = this.cells[this.snake[0].row][this.snake[0].col];
    const cellW = cellEl.offsetWidth;
    const cellH = cellEl.offsetHeight;
    const h = this.headEl;
    const curLeft = parseFloat(h.style.left) || cellEl.offsetLeft;
    const curTop  = parseFloat(h.style.top)  || cellEl.offsetTop;
    h.style.transition = 'left 0.12s ease-out, top 0.12s ease-out';
    h.style.left = (curLeft + this.dir.dc * cellW * 0.5) + 'px';
    h.style.top  = (curTop  + this.dir.dr * cellH * 0.5) + 'px';
    h.classList.add('snake-head--crash');

    setTimeout(() => this._gameOver(), 2000);
  }

  _tick() {
    if (this.keyQueue.length > 0) {
      const direction = this.keyQueue.shift();
      this.setDirection(direction.dr, direction.dc);
    }

    const moveDir = this.nextDir;
    const head = this.snake[0];
    const next = { row: head.row + moveDir.dr, col: head.col + moveDir.dc };

    // 壁衝突
    if (next.row < 0 || next.row >= this.GRID || next.col < 0 || next.col >= this.GRID) {
      this._startGameOverWithSound('kabe.mp3'); return;
    }

    // 自己衝突（テールは今フレームで抜けるので除外）
    const lastIdx = this.snake.length - 1;
    if (this.snake.some((s, i) => i !== lastIdx && s.row === next.row && s.col === next.col)) {
      this._startGameOverWithSound('dosu.mp3'); return;
    }

    const ate = this.meat && next.row === this.meat.row && next.col === this.meat.col;
    this.snake.unshift(next);
    if (ate) {
      this._playSound('paku.mp3');
      this.score++;
      if (this.scoreEl) this.scoreEl.textContent = this.score;

      if (this.TICK > 120) {
        this.TICK -= 3;
        clearInterval(this.timerId);
        this.timerId = setInterval(() => this._tick(), this.TICK);
      }

      this._placeMeat();
    } else {
      this.snake.pop();
    }

    this._render();

    // 移動方向の履歴に追加
    this.moveDirHistory.unshift(this.nextDir);
    if (this.moveDirHistory.length > this.GRID * this.GRID) {
      this.moveDirHistory.pop();
    }
  }

  _gameOver() {
    this.destroy();
    if (typeof window.handleBullGameOver === 'function') {
      window.handleBullGameOver({ nickname: this.nickname, score: this.score });
    }
  }

  _playSound(filename) {
    const audio = new Audio('./' + filename);
    audio.currentTime = 0;
    audio.volume = 0.5;
    audio.play().catch(err => console.warn('Failed to play sound:', err));
  }

}

window.BullGame = BullGame;
