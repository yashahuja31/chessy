const socket = io('http://127.0.0.1:9000', {
    withCredentials: true,
    transports: ['websocket', 'polling']
});

const chess = new Chess();
const boardelement = document.querySelector(".chessboard");

let draggedpiece = null;
let sourcesquare = null;
let playerrole = null;
let gameMoves = [];
let gameStatus = 'connecting';
let currentGameId = null;

// DOM elements
const gameStatusElement = document.getElementById('gameStatus');
const newGameButton = document.getElementById('newGameButton');
const resignButton = document.getElementById('resignButton');
const analyzeGameButton = document.getElementById('analyzeGameButton');

// Timer elements
let whiteTimerElement, blackTimerElement;

// Chat elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendMessageButton = document.getElementById('sendMessage');

// Initialize timers in the DOM
const initializeTimers = () => {
    const timerContainer = document.createElement('div');
    timerContainer.className = 'flex justify-between items-center mb-4 w-full max-w-md';
    
    // White timer (right side)
    whiteTimerElement = document.createElement('div');
    whiteTimerElement.className = 'bg-black text-white px-4 py-2 rounded-lg font-mono text-xl font-bold min-w-[100px] text-center';
    whiteTimerElement.textContent = '10:00';
    
    // Black timer (left side)  
    blackTimerElement = document.createElement('div');
    blackTimerElement.className = 'bg-white text-black border-2 border-black px-4 py-2 rounded-lg font-mono text-xl font-bold min-w-[100px] text-center';
    blackTimerElement.textContent = '10:00';
    
    const timerLabel1 = document.createElement('div');
    timerLabel1.className = 'text-center text-sm text-gray-600 mt-1';
    timerLabel1.textContent = 'Black';
    
    const timerLabel2 = document.createElement('div');
    timerLabel2.className = 'text-center text-sm text-gray-600 mt-1';
    timerLabel2.textContent = 'White';
    
    const leftTimerContainer = document.createElement('div');
    leftTimerContainer.appendChild(blackTimerElement);
    leftTimerContainer.appendChild(timerLabel1);
    
    const rightTimerContainer = document.createElement('div');
    rightTimerContainer.appendChild(whiteTimerElement);
    rightTimerContainer.appendChild(timerLabel2);
    
    timerContainer.appendChild(leftTimerContainer);
    timerContainer.appendChild(rightTimerContainer);
    
    // Insert timer before the chessboard
    const chessboardContainer = document.querySelector('.chessboard').parentElement;
    chessboardContainer.insertBefore(timerContainer, chessboardContainer.firstChild);
};

// Update game status display
const updateGameStatus = (status, message = '') => {
    gameStatus = status;
    const statusElement = gameStatusElement;
    
    statusElement.className = 'game-status max-w-md mx-auto ';
    
    switch (status) {
        case 'connecting':
            statusElement.className += 'status-waiting';
            statusElement.textContent = message || 'Connecting to server...';
            break;
        case 'waiting':
            statusElement.className += 'status-waiting';
            statusElement.textContent = message || 'Waiting for another player...';
            break;
        case 'playing':
            statusElement.className += 'status-playing';
            statusElement.textContent = message || 'Game in progress';
            break;
        case 'spectating':
            statusElement.className += 'status-spectating';
            statusElement.textContent = message || 'Watching game as spectator';
            break;
        case 'finished':
            statusElement.className += 'status-waiting';
            statusElement.textContent = message || 'Game finished';
            break;
    }
};

// Format time for display
const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Update timer display
const updateTimers = (times) => {
    if (whiteTimerElement && blackTimerElement) {
        whiteTimerElement.textContent = formatTime(times.white);
        blackTimerElement.textContent = formatTime(times.black);
        
        // Add visual indication for active player
        if (chess.turn() === 'w') {
            whiteTimerElement.classList.add('ring-4', 'ring-yellow-400');
            blackTimerElement.classList.remove('ring-4', 'ring-yellow-400');
        } else {
            blackTimerElement.classList.add('ring-4', 'ring-yellow-400');
            whiteTimerElement.classList.remove('ring-4', 'ring-yellow-400');
        }
        
        // Change color when time is low (under 1 minute)
        if (times.white < 60000) {
            whiteTimerElement.classList.add('bg-red-600');
            whiteTimerElement.classList.remove('bg-black');
        } else {
            whiteTimerElement.classList.add('bg-black');
            whiteTimerElement.classList.remove('bg-red-600');
        }
        
        if (times.black < 60000) {
            blackTimerElement.classList.add('bg-red-600', 'text-white');
            blackTimerElement.classList.remove('bg-white', 'text-black');
        } else {
            blackTimerElement.classList.add('bg-white', 'text-black');
            blackTimerElement.classList.remove('bg-red-600', 'text-white');
        }
    }
};

// Piece Unicode mapping
const pieceUnicode = {
    'wp': '♙', 'wr': '♖', 'wn': '♘', 'wb': '♗', 'wq': '♕', 'wk': '♔',
    'bp': '♙', 'br': '♖', 'bn': '♘', 'bb': '♗', 'bq': '♕', 'bk': '♔'
};

// Render the chess board
const renderboard = () => {
    const board = chess.board();
    boardelement.innerHTML = "";

    board.forEach((row, rowindex) => {
        row.forEach((square, squareindex) => {
            const squareelement = document.createElement("div");
            squareelement.classList.add("square");

            const islight = (rowindex + squareindex) % 2 === 0;
            squareelement.classList.add(islight ? "light" : "dark");

            const squarename = String.fromCharCode(97 + squareindex) + (8 - rowindex);
            squareelement.dataset.square = squarename;

            if (square) {
                const pieceelement = document.createElement("div");
                pieceelement.classList.add("piece");
                pieceelement.classList.add(square.color === 'w' ? 'white' : 'black');
                pieceelement.innerText = pieceUnicode[square.color + square.type];
                pieceelement.draggable = playerrole === square.color;

                if (playerrole === square.color) {
                    pieceelement.classList.add('draggable');
                }

                pieceelement.addEventListener("dragstart", (e) => {
                    if (pieceelement.draggable) {
                        draggedpiece = pieceelement;
                        sourcesquare = squarename;
                        e.dataTransfer.effectAllowed = "move";
                    }
                });

                pieceelement.addEventListener("dragend", (e) => {
                    draggedpiece = null;
                    sourcesquare = null;
                });

                squareelement.appendChild(pieceelement);
            }

            squareelement.addEventListener("dragover", (e) => {
                e.preventDefault();
            });

            squareelement.addEventListener("drop", (e) => {
                e.preventDefault();
                if (draggedpiece) {
                    const targetsquare = squareelement.dataset.square;
                    handlemove(sourcesquare, targetsquare);
                }
            });

            // Click to move (for mobile/touch devices)
            squareelement.addEventListener('click', handleSquareClick);

            boardelement.appendChild(squareelement);
        });
    });

    // Flip board for black player
    if (playerrole === 'b') {
        boardelement.classList.add('flipped');
    } else {
        boardelement.classList.remove('flipped');
    }
};

let selectedSquare = null;

// Handle square clicks for touch/mobile devices
const handleSquareClick = (e) => {
    const square = e.currentTarget.dataset.square;
    const piece = e.currentTarget.querySelector('.piece');

    if (selectedSquare === null) {
        // First click - select piece
        if (piece && piece.classList.contains('draggable')) {
            selectedSquare = square;
            e.currentTarget.classList.add('ring-4', 'ring-blue-400');
        }
    } else {
        // Second click - attempt move
        const sourceSquareElement = document.querySelector(`[data-square="${selectedSquare}"]`);
        sourceSquareElement.classList.remove('ring-4', 'ring-blue-400');

        if (square === selectedSquare) {
            // Clicked same square - deselect
            selectedSquare = null;
        } else {
            // Attempt move
            handlemove(selectedSquare, square);
            selectedSquare = null;
        }
    }
};

// Handle piece moves
const handlemove = (source, target) => {
    console.log(`Attempting move from ${source} to ${target}`);
    
    // Check if it's the player's turn
    if (playerrole !== chess.turn()) {
        console.log("Not your turn!");
        addChatMessage("It's not your turn!");
        return;
    }

    try {
        // Create move object
        const moveData = {
            from: source,
            to: target,
            promotion: 'q' // Default promotion to queen
        };

        // Check if move is a pawn promotion
        const piece = chess.get(source);
        if (piece && piece.type === 'p') {
            const rank = target.charAt(1);
            if ((piece.color === 'w' && rank === '8') || (piece.color === 'b' && rank === '1')) {
                // Show promotion modal
                showPromotionModal(source, target);
                return;
            }
        }

        // Validate move locally first
        const move = chess.move(moveData);
        if (move) {
            // Revert the move (we just tested it)
            chess.undo();
            
            // Send move to server
            console.log("Sending move to server:", moveData);
            socket.emit("move", moveData);
        } else {
            console.log("Invalid move attempted");
            addChatMessage("Invalid move!");
        }
    } catch (error) {
        console.error("Error making move:", error);
        addChatMessage("Error making move!");
    }
};

// Promotion modal functions
let pendingPromotion = null;

const showPromotionModal = (source, target) => {
    const modal = document.getElementById('promotionModal');
    pendingPromotion = { source, target };
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

const hidePromotionModal = () => {
    const modal = document.getElementById('promotionModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    pendingPromotion = null;
};

// Handle promotion piece selection
document.querySelectorAll('.promotion-option').forEach(button => {
    button.addEventListener('click', (e) => {
        if (pendingPromotion) {
            const piece = e.target.dataset.piece;
            const moveData = {
                from: pendingPromotion.source,
                to: pendingPromotion.target,
                promotion: piece
            };
            
            console.log("Sending promotion move to server:", moveData);
            socket.emit("move", moveData);
            hidePromotionModal();
        }
    });
});

// Add message to chat
const addChatMessage = (message, isSystem = false) => {
    const messageElement = document.createElement('div');
    messageElement.className = `mb-2 p-2 rounded ${isSystem ? 'bg-blue-50 text-blue-800 italic' : 'bg-gray-100'}`;
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

// Chat functionality
const sendChatMessage = () => {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit('chatMessage', message);
        chatInput.value = '';
    }
};

sendMessageButton.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

// Button event listeners
newGameButton.addEventListener('click', () => {
    console.log("New game button clicked");
    socket.emit('newGame');
});

resignButton.addEventListener('click', () => {
    if (gameStatus === 'playing' && (playerrole === 'w' || playerrole === 'b')) {
        if (confirm('Are you sure you want to resign?')) {
            console.log("Resign button clicked");
            socket.emit('resign');
        }
    } else {
        addChatMessage("You can only resign during an active game as a player.");
    }
});

analyzeGameButton.addEventListener('click', () => {
    if (currentGameId) {
        window.open(`/analysis.html?gameId=${currentGameId}`, '_blank');
    } else {
        addChatMessage("No game available for analysis yet.");
    }
});

// Socket event handlers
socket.on("connect", () => {
    console.log("Connected to server");
    updateGameStatus('connecting', 'Connected! Waiting for game assignment...');
});

socket.on("disconnect", () => {
    console.log("Disconnected from server");
    updateGameStatus('connecting', 'Disconnected from server. Reconnecting...');
});

socket.on("playerrole", (role) => {
    console.log("Assigned role:", role);
    playerrole = role;
    updateGameStatus('waiting', `You are ${role === 'w' ? 'White' : 'Black'}. Waiting for opponent...`);
    renderboard();
});

socket.on("spectatorrole", () => {
    console.log("Assigned as spectator");
    playerrole = 'spectator';
    updateGameStatus('spectating');
    renderboard();
});

socket.on("boardstate", (fen) => {
    console.log("Board state received:", fen);
    chess.load(fen);
    renderboard();
});

socket.on("move", (move) => {
    console.log("Move received from server:", move);
    try {
        const moveResult = chess.move(move);
        if (moveResult) {
            gameMoves.push(move);
            renderboard();
        }
    } catch (error) {
        console.error("Error applying server move:", error);
    }
});

socket.on("turnChange", (turn) => {
    console.log("Turn changed to:", turn);
    const turnText = turn === 'w' ? 'White' : 'Black';
    if (gameStatus === 'playing') {
        if (turn === playerrole) {
            updateGameStatus('playing', `Your turn (${playerrole === 'w' ? 'White' : 'Black'})`);
        } else if (playerrole === 'spectator') {
            updateGameStatus('spectating', `${turnText}'s turn`);
        } else {
            updateGameStatus('playing', `Opponent's turn (${turnText})`);
        }
    }
});

socket.on("gameStarted", () => {
    console.log("Game started");
    updateGameStatus('playing');
    gameMoves = [];
});

socket.on("gameStatus", (status) => {
    console.log("Game status:", status);
    if (status === 'waiting') {
        updateGameStatus('waiting');
    } else if (status === 'playing') {
        updateGameStatus('playing');
    }
});

socket.on("gameReset", () => {
    console.log("Game reset");
    chess.reset();
    gameMoves = [];
    currentGameId = null;
    updateGameStatus('waiting', 'New game started! Waiting for players...');
    renderboard();
});

socket.on("gameOver", (data) => {
    console.log("Game over:", data);
    updateGameStatus('finished', data.message);
    addChatMessage(`Game Over: ${data.message}`, true);
});

socket.on("gameSaved", (gameId) => {
    console.log("Game saved with ID:", gameId);
    currentGameId = gameId;
    if (gameId) {
        addChatMessage(`Game saved! You can analyze it using the Analyze Game button.`, true);
    }
});

socket.on("timeUpdate", (times) => {
    updateTimers(times);
});

socket.on("invalidMove", (message) => {
    console.log("Invalid move:", message);
    addChatMessage(`Invalid move: ${message}`);
});

socket.on("error", (message) => {
    console.error("Server error:", message);
    addChatMessage(`Error: ${message}`);
});

socket.on("chatMessage", (message) => {
    addChatMessage(message);
});

socket.on("playersUpdate", (players) => {
    console.log("Players update:", players);
    const whiteConnected = players.white ? "✓" : "✗";
    const blackConnected = players.black ? "✓" : "✗";
    addChatMessage(`Players: White ${whiteConnected} | Black ${blackConnected}`, true);
});

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, initializing chess game");
    initializeTimers();
    renderboard();
    updateGameStatus('connecting');
});
