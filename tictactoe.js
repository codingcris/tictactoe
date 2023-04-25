const EventEmitter = (function () {
  function EventEmitter() {
    this.listeners = {};
  }

  EventEmitter.prototype.on = function (event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => {
      this.off(event, callback);
    };
  };

  EventEmitter.prototype.off = function (event, callback) {
    if (!this.listeners[event]) return;

    this.listeners[event] = this.listeners[event].filter(
      (listener) => listener !== callback
    );
  };

  EventEmitter.prototype.emit = function (event, data) {
    if (!this.listeners[event]) return;

    this.listeners[event].forEach((callback) => callback(data));
  };

  return EventEmitter;
})();

var eventBus = new EventEmitter();

function Player(symbol, type, name = null) {
  const player = { symbol, type };
  if (!name) player.name = symbol;
  else player.name = name;
  return player;
}

function AIPlayer(symbol, type, gameBoard) {
  const player = Player(symbol, type, type + " bot");
  let gameListener;
  player.gameBoard = gameBoard;

  const winningLines = [
    [
      [0, 0],
      [0, 1],
      [0, 2],
    ], // rows
    [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ], // columns
    [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
    ],
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ], // first diagonal
    [
      [0, 2],
      [1, 1],
      [2, 0],
    ], // second diagonal
  ];

  player.initialize = function () {
    eventBus.on("newGame", unsubscribe);
    gameListener = eventBus.on("turnChange", this.makeMove.bind(this));
    this.board = this.gameBoard.getCells();
  };

  function unsubscribe(listener) {
    gameListener();
  }

  player.makeMove = function () {
    if (game.turn() === this.symbol) {
      let cell = null;

      switch (this.type) {
        case "easy":
          cell = this.strategies.easy();
          break;
        case "medium":
          cell = this.strategies.medium.call(this);
          break;
        case "hard":
          cell = this.strategies.hard.call(this);
      }

      eventBus.emit("playerSelects", { player: this.symbol, cellIndex: cell });
    }
  };

  player.strategies = {
    // chooses a random cell
    easy: function () {
      let openCells = gameBoard.openCells();
      let randomIndex = Math.floor(Math.random() * openCells.length);
      return openCells[randomIndex];
    },
    // chooses a cell that wins the game for the AI or if not found, a cell that blocks the player from winning. If no blocking move is available, chooses a random cell.
    medium: function () {
      let board = this.board;
      const opponent = this.symbol === "X" ? "O" : "X";

      // checks for and returns a move that will win the game or prevent the opponent from winning
      const checkForMove = (playerSymbol) => {
        for (const line of winningLines) {
          let emptyCellIdx = line.findIndex(([row, col]) => !board[row][col]);
          if (emptyCellIdx !== -1) {
            let compareVals = [];
            for (let i = 0; i < line.length; i++) {
              if (i !== emptyCellIdx) compareVals.push(line[i]);
            }

            const [val1, val2] = compareVals.map(
              ([row, col]) => board[row][col]
            );
            if (val1 && val1 === val2 && val1 === playerSymbol)
              return line[emptyCellIdx];
          }
        }
        return null;
      };

      // Check for the AI's winning move first
      let winningMove = checkForMove(this.symbol);
      if (winningMove) return winningMove;

      // If no winning move, check for a blocking move
      let blockingMove = checkForMove(opponent);
      if (blockingMove) return blockingMove;

      // If no winning or blocking move found, return a random move
      return this.strategies.easy();
    },
    // employs the minimax algorithm for optimal AI gameplay. You can't win vs this AI!
    hard: function () {
      let workingBoard = JSON.parse(JSON.stringify(this.board));
      let result =
        this.symbol === "X" ? maximize(workingBoard) : minimize(workingBoard);
      let optimalMove = result.move;
      return optimalMove;

      function utility(board) {
        let winningPlayer = game.winner(board);
        if (!winningPlayer) return 0;
        return winningPlayer.symbol === "X" ? 1 : -1;
      }

      function maximize(board) {
        // if the board is terminal, there is no optimal move to make, but we can return the utility value of the terminal board
        if (game.checkOver(board)) {
          return { value: utility(board), move: null };
        }

        let value = -Infinity;
        let optimalMove = null;

        // obtain the available moves from this level
        let options = gameBoard.openCells(board);
        let currentBoard = JSON.parse(JSON.stringify(board));

        for (let option of options) {
          let resultingBoard = JSON.parse(JSON.stringify(currentBoard));
          gameBoard.fillCell(game.turn(resultingBoard), option, resultingBoard);

          let result = minimize(resultingBoard);
          let resultingValue = result.value;

          if (resultingValue > value) {
            value = resultingValue;
            optimalMove = option;
          }
        }

        return { value, move: optimalMove };
      }

      function minimize(board) {
        // if the board is terminal, there is no optimal move to make, but we can return the utility value of the terminal board
        if (game.checkOver(board)) {
          return { value: utility(board), move: null };
        }

        let value = Infinity;
        let optimalMove = null;

        // obtain the available moves from this level
        let options = gameBoard.openCells(board);
        let currentBoard = JSON.parse(JSON.stringify(board));

        for (let option of options) {
          let resultingBoard = JSON.parse(JSON.stringify(currentBoard));
          gameBoard.fillCell(game.turn(resultingBoard), option, resultingBoard);

          let result = maximize(resultingBoard);
          let resultingValue = result.value;

          if (resultingValue < value) {
            value = resultingValue;
            optimalMove = option;
          }
        }

        return { value, move: optimalMove };
      }
    },
  };
  return player;
}

// This module manages the game board and its cells
// It receives the eventBus as a parameter to communicate with other modules
// through events, but it doesn't emit any events itself
const gameBoard = (function (eventBus) {
  // Initialize the gameCells as a 3x3 matrix filled with null values
  const gameCells = Array(3)
    .fill(null)
    .map(() => Array(3).fill(null));

  // Fills the game board cell specified as an array [row, col] with the player's symbol
  // If a board is provided, fills the cell in that board instead of the gameCells
  function fillCell(player, cell, board) {
    let cells = board || gameCells;
    let [row, col] = cell;
    if (cells[row][col]) {
      return false;
    } else {
      cells[row][col] = player;
      return cells;
    }
  }

  // Clears the gameCells by setting all values to null
  function clearCells() {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        gameCells[row][col] = null;
      }
    }
  }

  // Returns the gameCells
  function getCells() {
    return gameCells;
  }

  // Returns the indices of cells that are open (null) in the provided cellArray or gameCells
  function openCells(cellArray) {
    let cells = cellArray || gameCells;
    const open = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (cells[row][col] === null) {
          open.push([row, col]);
        }
      }
    }
    return open;
  }

  return { getCells, openCells, fillCell, clearCells };
})(eventBus);

// This module manages the game state, players, and game rules
// It uses the eventBus to communicate with other modules and the gameBoard module to interact with the board state
const game = (function (eventBus, board) {
  const X = "X";
  const O = "O";
  const PLAYERS = { x: null, o: null };
  const gameBoard = board;
  let GAME_OPTIONS = null;

  function initialize() {
    eventBus.on("startGame", start);
    eventBus.on("restart", restart);
    eventBus.on("playerSelects", playerSelects);
    eventBus.on("newGame", newGame);
  }

  // called when a new game is started. Resets the game options, players, and gameboard state
  function newGame() {
    GAME_OPTIONS = null;
    PLAYERS.x = null;
    PLAYERS.o = null;
    gameBoard.clearCells();
  }

  // Starts the game with given options
  // Options include game mode (PVP or PvAI), difficulty (easy/medium/hard) if PvAI, and the player's symbol (X/O) if PvAI
  function start(options) {
    const GAME_OPTIONS = options;
    let gameMode = options.gameMode;
    let names = options.playerNames;
    let p1, p2;

    if (gameMode === "AI") {
      let difficulty = options.difficulty;
      let aiSymbol = options.player === X ? O : X;
      let name = names[0];
      p1 = Player(options.player, "Human", name);
      let AI = AIPlayer(aiSymbol, difficulty, gameBoard);
      AI.initialize();
      if (p1.symbol === X) {
        PLAYERS.x = p1;
        PLAYERS.o = AI;
      } else {
        PLAYERS.o = p1;
        PLAYERS.x = AI;
      }
    } else {
      // initializes two human players if gamemode is PvP
      let chosenSymbols = GAME_OPTIONS.chosenSymbols;

      let name1 = names[0];
      let name2 = names[1];

      let p1Symbol = chosenSymbols.p1Symbol;
      let p2Symbol = chosenSymbols.p2Symbol;

      // if no symbols were chosen by the players p1 is X by default
      if (p1Symbol === "null" || p1Symbol === X) {
        p1 = Player(X, "Human", name1);
        p2 = Player(O, "Human", name2);
        PLAYERS.x = p1;
        PLAYERS.o = p2;
      } else if (p1Symbol === O) {
        p1 = Player(O, "Human", name1);
        p2 = Player(X, "Human", name2);
        PLAYERS.x = p2;
        PLAYERS.o = p1;
      }
    }

    eventBus.emit("turnChange", turn());
  }

  // Handles a player's cell selection
  // If the move is valid, emits a "moveMade" event and checks if the game is over or if the turn should change
  function playerSelects({ player, cellIndex }) {
    if (gameBoard.fillCell(player, cellIndex)) {
      eventBus.emit("moveMade", { player, cellIndex });
      // check if this move ended the game
      if (checkOver()) {
        eventBus.emit("gameOver", winner());
      } else {
        eventBus.emit("turnChange", turn());
      }
    }
  }

  // counts the current symbols on the board to determine which player goes next. X always starts first.
  function turn(board) {
    let boardCells = board || gameBoard.getCells();
    let arr = boardCells.flat();
    let xCount = arr.filter((cell) => cell === X).length;
    let oCount = arr.filter((cell) => cell === O).length;
    if (xCount > oCount) {
      return O;
    } else {
      return X;
    }
  }

  // restarts the game; same options
  function restart() {
    gameBoard.clearCells();
    eventBus.emit("turnChange", turn());
  }

  // checks if the game is over. Either the board is full or a winner is found
  function checkOver(board) {
    let boardCells = board || gameBoard.getCells();
    let arr = boardCells.flat();
    if (arr.filter((cell) => !cell).length === 0) {
      return true;
    } else {
      return winner(boardCells);
    }
  }

  // Returns the winning player if there is a winner or null otherwise
  function winner(board) {
    let boardCells = board || gameBoard.getCells();
    // check for a row win
    for (let i = 0; i < 3; i++) {
      if (
        boardCells[i][0] &&
        boardCells[i][0] === boardCells[i][1] &&
        boardCells[i][1] === boardCells[i][2]
      ) {
        let winningSymbol = boardCells[i][0];
        return winningSymbol === X ? PLAYERS.x : PLAYERS.o;
      }
    }

    // check for column win
    for (let i = 0; i < 3; i++) {
      if (
        boardCells[0][i] &&
        boardCells[0][i] === boardCells[1][i] &&
        boardCells[1][i] === boardCells[2][i]
      ) {
        let winningSymbol = boardCells[0][i];
        return winningSymbol === X ? PLAYERS.x : PLAYERS.o;
      }
    }

    // check for diagonal win
    if (
      boardCells[0][0] &&
      boardCells[0][0] === boardCells[1][1] &&
      boardCells[1][1] === boardCells[2][2]
    ) {
      let winningSymbol = boardCells[0][0];
      return winningSymbol === X ? PLAYERS.x : PLAYERS.o;
    }
    if (
      boardCells[0][2] &&
      boardCells[0][2] === boardCells[1][1] &&
      boardCells[1][1] === boardCells[2][0]
    ) {
      let winningSymbol = boardCells[1][1];
      return winningSymbol === X ? PLAYERS.x : PLAYERS.o;
    }

    return null;
  }

  // returns the player object corresponding to the given symbol (X/O)
  function getPlayer(symbol) {
    return symbol === X ? PLAYERS.x : PLAYERS.o;
  }
  initialize();

  return { checkOver, turn, getPlayer, winner, newGame };
})(eventBus, gameBoard);

const dom = (function (eventBus) {
  // ~~ GAME BOARD ELEMENTS ~~
  const gameSection = document.getElementById("game");
  const gameBoard = document.getElementById("gameboard");
  const boardCells = document.getElementsByClassName("cell");

  // ~~ GAME OPTION ELEMENTS ~~
  const gameOptions = document.getElementById("gameOptions");
  const gameModeChooser = document.querySelectorAll(
    'input[type="radio"][name="gamemode"]'
  );
  const pvpOptions = document.getElementById("pvpOptions");
  const aiOptions = document.getElementById("aiOptions");
  const radioButtons = document.querySelectorAll(
    'input[type="radio"]:not(.falseRadio)'
  );
  const falseRadioBttns = document.querySelectorAll(".falseRadio");
  const playerNameInputs = document.getElementsByClassName("playerName");
  const playerSymbolRadios = document.getElementsByClassName("playerSymbol");
  const player1X = document.querySelector('input[name="p1Symbol"][value="X"]');
  const player1O = document.querySelector('input[name="p1Symbol"][value="O"]');
  const player2X = document.querySelector('input[name="p2Symbol"][value="X"]');
  const player2O = document.querySelector('input[name="p2Symbol"][value="O"]');
  const gameModeHint = document.getElementById("gameModeHint");
  const symbolHint = document.getElementById("symbolHint");
  const difficultyHint = document.getElementById("difficultyHint");

  // ~~ GAME CONTROL ELEMENTS ~~
  const playBttn = document.getElementById("startGameBttn");
  const turnDisplay = document.getElementById("turnDisplay");
  const backToOptionsBttn = document.getElementById("backToOptions");
  const restartBttn = document.getElementById("restart");

  // Initialize event listeners and set initial states for the DOM elements
  function initialize() {
    gameOptions.addEventListener("submit", startGame);
    for (let radio of falseRadioBttns) {
      radio.checked = true;
    }
    for (let radio of radioButtons) {
      radio.addEventListener("change", renderCheckedRadioButtons);
    }
    for (let radio of gameModeChooser) {
      radio.addEventListener("change", changeGameMode);
    }

    for (let cell of boardCells) {
      cell.addEventListener("click", cellSelected);
    }

    for (let nameInput of playerNameInputs) {
      nameInput.addEventListener("input", limitNameLength);
    }

    for (let playerSymbolSelector of playerSymbolRadios) {
      playerSymbolSelector.parentNode.addEventListener(
        "click",
        updatePlayerSymbolSelected
      );
    }
    turnDisplay.style.display = "none";
    restartBttn.style.display = "none";
    backToOptionsBttn.style.display = "none";

    backToOptionsBttn.addEventListener("click", backToOptions);
    restartBttn.addEventListener("click", restartGame);

    eventBus.on("gameOver", gameOver);
    eventBus.on("moveMade", updateBoard);
    eventBus.on("turnChange", displayTurn);
  }

  // ~~ GAME FLOW FUNCTIONS ~~

  // Start the game based on the submitted game options
  function startGame(event) {
    clearBoard();
    event.preventDefault();
    let formData = new FormData(gameOptions);

    let playerNames = [];

    let gameMode = formData.get("gamemode");
    if (gameMode === "null") {
      gameModeHint.style.display = "block";
      return;
    } else if (gameMode === "AI") {
      var player = formData.get("player");
      if (player === "null") {
        symbolHint.style.display = "block";
        return;
      } else {
        symbolHint.style.display = "none";
      }

      var difficulty = formData.get("difficulty");
      if (difficulty === "null") {
        difficultyHint.style.display = "block";
        return;
      } else {
        difficultyHint.style.display = "none";
      }

      var humanName = formData.get("playerName").trim();
      if (humanName !== "null") playerNames.push(humanName);
    } else if (gameMode === "PVP") {
      var p1Symbol = formData.get("p1Symbol");
      var p2Symbol = formData.get("p2Symbol");
      var chosenSymbols = { p1Symbol, p2Symbol };
      var player1Name = formData.get("p1Name").trim();
      var player2Name = formData.get("p2Name").trim();
      if (player1Name !== "null") playerNames.push(player1Name);
      if (player2Name !== "null") playerNames.push(player2Name);
    }
    gameSection.style.display = "flex";
    gameOptions.style.display = "none";
    gameBoard.style.visibility = "visible";
    backToOptionsBttn.style.display = "block";
    turnDisplay.style.display = "block";
    eventBus.emit("newGame");
    eventBus.emit("startGame", {
      gameMode,
      player,
      difficulty,
      chosenSymbols,
      playerNames,
    });
  }

  // Restart the game with the current options
  function restartGame() {
    gameBoard.style.pointerEvents = "auto";
    clearBoard();
    eventBus.emit("restart");
  }

  // returns the player to the option selection screen
  function backToOptions() {
    restartGame();
    clearBoard();
    gameSection.style.display = "none";
    gameOptions.style.display = "block";
  }

  // called when a cell is selected by the player
  function cellSelected(event) {
    // obtain the cell index of the selected cell
    let cell = event.target;

    // check that the cell is open
    if (!cell.textContent) {
      let cellIndex = cell
        .getAttribute("data-cell-index")
        .split(",")
        .map((x) => Number(x));

      let [row, column] = cellIndex;
      eventBus.emit("playerSelects", { player: game.turn(), cellIndex });
    }
  }

  // ~~ GAME STATE UPDATE FUNCTIONS ~~

  // maintains the rule that if p1 selects x as its symbol, p2 recieves o as its symbol and vise versa
  function updatePlayerSymbolSelected(event) {
    let radioSelected = event.target.firstElementChild;

    if (radioSelected === player1X) {
      player2O.checked = true;
      player2O.dispatchEvent(new Event("change"));
    } else if (radioSelected === player1O) {
      player2X.checked = true;
      player2X.dispatchEvent(new Event("change"));
    } else if (radioSelected === player2X) {
      player1O.checked = true;
      player1O.dispatchEvent(new Event("change"));
    } else if (radioSelected === player2O) {
      player1X.checked = true;
      player1X.dispatchEvent(new Event("change"));
    }
  }

  // updates the dom representation of the gameboard
  function updateBoard({ player, cellIndex }) {
    cellIndex = cellIndex.join(",");
    let cell = document.querySelector(`.cell[data-cell-index="${cellIndex}"]`);

    cell.textContent = player;
  }

  // clears the dom representation of the game board
  function clearBoard() {
    for (cell of boardCells) {
      cell.textContent = null;
    }
  }

  // displays the turn for the players
  function displayTurn(turn) {
    turnDisplay.textContent = `${game.getPlayer(turn).name} MAKE YOUR MOVE`;
  }

  // Displays the winner of the game and disables further moves.
  function gameOver(winner) {
    if (winner) {
      turnDisplay.textContent = `GAME OVER. ${winner.name} WINS`;
    } else {
      turnDisplay.textContent = `GAME OVER. NO WINNER.`;
    }
    gameBoard.style.pointerEvents = "none";
    restartBttn.style.display = "block";
  }

  // ~~ DOM MANIPULATION FUNCTIONS ~~

  // Change the displayed game mode options based on the selected mode
  function changeGameMode(event) {
    let radioButton = event.target;
    gameModeHint.style.display = "none";
    if (radioButton.checked && radioButton.value == "PVP") {
      pvpOptions.style.display = "block";
      aiOptions.style.display = "none";
    } else if (radioButton.value === "AI") {
      aiOptions.style.display = "block";
      pvpOptions.style.display = "none";
    }
  }

  // limits the length of player input names
  function limitNameLength(event) {
    let maxLength = 20;
    let input = event.target;

    if (input.value.length > maxLength) {
      input.value = input.value.slice(0, maxLength + 1);
    }
  }

  // adds blue border to selected game options
  function renderCheckedRadioButtons(event) {
    const radiosWithSameName = document.querySelectorAll(
      `input[type="radio"][name="${event.target.name}"]`
    );
    for (let radio of radiosWithSameName) {
      if (radio.checked) {
        radio.parentNode.style.border = "2px solid blue";
      } else {
        radio.parentNode.style.border = "none";
      }
    }
  }

  initialize();
})(eventBus);
