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
    this.meat     = null; // {row, col}
    this.score    = 0;
    this.running  = false;
    this.timerId  = null;
  }

  start() {
    this._buildGrid();
    this._placeSnake();
    this._placeMeat();
    this._render();
    this.running = true;
    this.timerId = setInterval(() => this._tick(), this.TICK);
  }

  destroy() {
    clearInterval(this.timerId);
    this.running = false;
  }

  setDirection(dr, dc) {
    // 逆方向転換を無視（即死防止）
    if (dr === -this.dir.dr && dc === -this.dir.dc) return;
    this.nextDir = { dr, dc };
  }

  // ---- private ----

  _buildGrid() {
    this.fieldEl.innerHTML = '';
    this.cells = [];
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
  }

  _placeSnake() {
    const mid = Math.floor(this.GRID / 2);
    this.snake = [
      { row: mid, col: mid + 1 },
      { row: mid, col: mid },
      { row: mid, col: mid - 1 },
    ];
    this.dir     = { dr: 0, dc: 1 };
    this.nextDir = { dr: 0, dc: 1 };
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
        el.style.removeProperty('--head-rotate');
      }
    }

    // 肉
    if (this.meat) {
      this.cells[this.meat.row][this.meat.col].classList.add('cell--meat');
    }

    // 体（末尾から先頭の順で塗ることで頭が上に重なる）
    for (let i = this.snake.length - 1; i >= 0; i--) {
      const { row, col } = this.snake[i];
      const el = this.cells[row][col];
      if (i === 0) {
        el.classList.add('cell--head');
        el.style.setProperty('--head-rotate', this._headRotateDeg() + 'deg');
      } else {
        el.classList.add('cell--body');
      }
    }
  }

  _headRotateDeg() {
    const { dr, dc } = this.dir;
    if (dc === 1)  return 90;   // right
    if (dc === -1) return 270;  // left
    if (dr === 1)  return 180;  // down
    return 0;                   // up
  }

  _tick() {
    this.dir = this.nextDir;
    const head = this.snake[0];
    const next = { row: head.row + this.dir.dr, col: head.col + this.dir.dc };

    // 壁衝突
    if (next.row < 0 || next.row >= this.GRID || next.col < 0 || next.col >= this.GRID) {
      this._gameOver(); return;
    }

    // 自己衝突
    if (this.snake.some(s => s.row === next.row && s.col === next.col)) {
      this._gameOver(); return;
    }

    const ate = this.meat && next.row === this.meat.row && next.col === this.meat.col;
    this.snake.unshift(next);
    if (ate) {
      this.score++;
      if (this.scoreEl) this.scoreEl.textContent = this.score;
      this._placeMeat();
    } else {
      this.snake.pop();
    }

    this._render();
  }

  _gameOver() {
    this.destroy();
    if (typeof window.handleBullGameOver === 'function') {
      window.handleBullGameOver({ nickname: this.nickname, score: this.score });
    }
  }
}

window.BullGame = BullGame;
