const express = require("express");
const socket = require("socket.io");
const {Chess} = require("chess.js");
const http = require("http");
const path = require("path");
const cors = require('cors');
require('dotenv').config()
const mongoose = require('mongoose');

const port = process.env.PORT || 9000;

const app = express();

app.use(cors({
    origin: ['http://127.0.0.1:9000', 'http://localhost:9000', 'http://localhost:5000', 'http://127.0.0.1:5000'],
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

const server = http.createServer(app);
const io = socket(server, {
    cors: {
        origin: ['http://localhost:9000', 'http://localhost:5000', 'http://127.0.0.1:9000', 'http://127.0.0.1:5000'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

let chess = new Chess();
let players = {};
let currentplayer = 'w';
let gameInProgress = false;
let gameStartTime = null;
let playerTimes = { white: 600000, black: 600000 };
let currentPlayerStartTime = null;
let gameInterval = null;
let gameMoves = []; // ADDED THIS LINE: Declare gameMoves array for server-side

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chess', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => {
    console.error('MongoDB connection error:', err);
    console.log('Continuing without database connection...');
});

const gameSchema = new mongoose.Schema({
    whitePlayer: String,
    blackPlayer: String,
    moves: [String],
    result: String,
    duration: Number,
    pgn: String,
    finalPosition: String,
    createdAt: { type: Date, default: Date.now }
});

const Game = mongoose.model('Game', gameSchema);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/analysis.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "analysis.html"));
});

app.get('/games', async (req, res) => {
    try {
        const games = await Game.find().sort({ createdAt: -1 }).limit(20);
        res.json(games);
    } catch (error) {
        console.error("Error fetching games:", error);
        res.status(500).json({ message: "Error fetching games" });
    }
});

app.get('/games/:id', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);
        if (!game) {
            return res.status(404).json({ message: "Game not found" });
        }
        res.json(game);
    } catch (error) {
        console.error("Error fetching game by ID:", error);
        res.status(500).json({ message: "Error fetching game" });
    }
});

const startGameTimer = () => {
    if (gameInterval) clearInterval(gameInterval);

    gameInterval = setInterval(() => {
        if (gameInProgress && currentPlayerStartTime) {
            const elapsed = Date.now() - currentPlayerStartTime;

            if (currentplayer === 'w') {
                playerTimes.white = Math.max(0, playerTimes.white - elapsed);
            } else {
                playerTimes.black = Math.max(0, playerTimes.black - elapsed);
            }

            if (playerTimes.white <= 0 || playerTimes.black <= 0) {
                const winner = playerTimes.white <= 0 ? 'Black' : 'White';
                const reason = 'time';
                io.emit("gameOver", { winner, reason, message: `${winner} wins on time!` });
                endGame(winner, reason);
                return;
            }

            currentPlayerStartTime = Date.now();
            io.emit("timeUpdate", playerTimes);
        }
    }, 100);
};

const endGame = async (winner, reason = 'unknown') => {
    gameInProgress = false;
    if (gameInterval) {
        clearInterval(gameInterval);
        gameInterval = null;
    }

    try {
        const duration = gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;
        const gameData = {
            whitePlayer: players.white || 'Disconnected',
            blackPlayer: players.black || 'Disconnected',
            moves: chess.history(), // Use chess.history() for saving
            result: `${winner} wins by ${reason}`,
            duration: duration,
            pgn: chess.pgn(),
            finalPosition: chess.fen()
        };

        if (mongoose.connection.readyState === 1) {
            const game = new Game(gameData);
            const savedGame = await game.save();
            console.log('Game saved to database with ID:', savedGame._id);
            io.emit("gameSaved", savedGame._id);
        } else {
            console.log('MongoDB not connected, game not saved');
            io.emit("gameSaved", null);
        }
    } catch (error) {
        console.error("Error saving game to database:", error);
        io.emit("gameSaved", null);
    }
};

const resetGame = () => {
    chess = new Chess();
    players = {};
    currentplayer = 'w';
    gameInProgress = false;
    gameStartTime = null;
    playerTimes = { white: 600000, black: 600000 };
    currentPlayerStartTime = null;
    gameMoves = []; // Reset gameMoves on new game

    if (gameInterval) {
        clearInterval(gameInterval);
        gameInterval = null;
    }
};

const checkGameState = () => {
    if (chess.isGameOver()) {
        let winner = 'Draw';
        let reason = '';

        if (chess.isCheckmate()) {
            winner = chess.turn() === 'w' ? 'Black' : 'White';
            reason = 'checkmate';
        } else if (chess.isStalemate()) {
            winner = 'Draw';
            reason = 'stalemate';
        } else if (chess.isThreefoldRepetition()) {
            winner = 'Draw';
            reason = 'threefold repetition';
        } else if (chess.isInsufficientMaterial()) {
            winner = 'Draw';
            reason = 'insufficient material';
        } else if (chess.isDraw()) {
            winner = 'Draw';
            reason = 'fifty-move rule';
        }
        return { isGameOver: true, winner, reason };
    }
    return { isGameOver: false };
};

io.on("connection", (uniquesocket) => {
    console.log("A user connected:", uniquesocket.id);

    if (!players.white) {
        players.white = uniquesocket.id;
        uniquesocket.emit("playerrole", "w");
        console.log("Assigned White to:", uniquesocket.id);
    } else if (!players.black) {
        players.black = uniquesocket.id;
        uniquesocket.emit("playerrole", "b");
        console.log("Assigned Black to:", uniquesocket.id);
        if (!gameInProgress) {
            gameInProgress = true;
            gameStartTime = Date.now();
            currentPlayerStartTime = Date.now();
            startGameTimer();
            io.emit("gameStarted");
            console.log("Game started - both players connected");
        }
    } else {
        uniquesocket.emit("spectatorrole");
        console.log("Assigned Spectator to:", uniquesocket.id);
    }

    uniquesocket.emit("boardstate", chess.fen());
    uniquesocket.emit("turnChange", currentplayer);
    uniquesocket.emit("timeUpdate", playerTimes);

    if (gameInProgress) {
        uniquesocket.emit("gameStatus", "playing");
    } else if (Object.keys(players).length < 2) {
        uniquesocket.emit("gameStatus", "waiting");
    }

    uniquesocket.on("disconnect", () => {
        console.log("User disconnected:", uniquesocket.id);
        if (uniquesocket.id === players.white) {
            console.log("White player disconnected.");
            delete players.white;
            if (gameInProgress) {
                endGame('Black', 'disconnect');
                io.emit("gameOver", { winner: 'Black', reason: 'disconnect', message: "White disconnected - Black wins!" });
            }
        } else if (uniquesocket.id === players.black) {
            console.log("Black player disconnected.");
            delete players.black;
            if (gameInProgress) {
                endGame('White', 'disconnect');
                io.emit("gameOver", { winner: 'White', reason: 'disconnect', message: "Black disconnected - White wins!" });
            }
        }
        if (Object.keys(players).length < 2 && gameInProgress) {
            gameInProgress = false;
            io.emit("gameStatus", "waiting");
            io.emit("chatMessage", "A player disconnected. Waiting for another player to join...");
            if (gameInterval) {
                clearInterval(gameInterval);
                gameInterval = null;
            }
        }
        io.emit("playersUpdate", { white: !!players.white, black: !!players.black });
        console.log("Current players:", players);
    });

    uniquesocket.on("move", (move) => {
        console.log("Received move:", move);
        try {
            if (!gameInProgress) {
                uniquesocket.emit("invalidMove", "Game not in progress");
                return;
            }
            if (uniquesocket.id !== players[currentplayer === 'w' ? 'white' : 'black']) {
                uniquesocket.emit("invalidMove", "It's not your turn!");
                return;
            }

            const result = chess.move(move);
            if (result) {
                console.log("Move successful. New FEN:", chess.fen());
                gameMoves.push(result.san); // Store the move in SAN format

                currentplayer = chess.turn();
                currentPlayerStartTime = Date.now(); // Reset timer for next player

                io.emit("boardstate", chess.fen());
                io.emit("turnChange", currentplayer);
                io.emit("moveMade", result.san); // Emit the move made
                io.emit("timeUpdate", playerTimes);

                const gameState = checkGameState();
                if (gameState.isGameOver) {
                    io.emit("gameOver", { winner: gameState.winner, reason: gameState.reason, message: `${gameState.winner} wins by ${gameState.reason}!` });
                    endGame(gameState.winner, gameState.reason);
                }
            } else {
                console.log("Invalid move attempted by chess.js");
                uniquesocket.emit("invalidMove", "Invalid move!");
            }
        } catch (error) {
            console.error("Error processing move:", error);
            uniquesocket.emit("error", "Error processing move");
        }
    });

    uniquesocket.on("chatMessage", (message) => {
        io.emit("chatMessage", `[${uniquesocket.id.substring(0, 4)}]: ${message}`);
    });

    uniquesocket.on("newGame", () => {
        console.log("New game requested by:", uniquesocket.id);
        resetGame(); // Reset game state

        // Reassign white player if available
        let newWhitePlayer = null;
        if (players.white) {
            newWhitePlayer = players.white;
            players = { white: null, black: null }; // Clear players temporarily
            players.white = newWhitePlayer;
            io.to(newWhitePlayer).emit("playerrole", "w");
            console.log("Reassigned White to:", newWhitePlayer);
        } else {
            players = { white: null, black: null }; // Clear players
        }

        // Notify all clients of the reset
        io.emit("gameReset");
        io.emit("boardstate", chess.fen());
        io.emit("turnChange", currentplayer);
        io.emit("timeUpdate", playerTimes);
        io.emit("gameStatus", "waiting");
        io.emit("playersUpdate", { white: !!players.white, black: !!players.black });

        // Send chat message
        io.emit("chatMessage", "New game started! Waiting for second player...");

        console.log("Game reset complete. White assigned to:", newWhitePlayer);
    });

    uniquesocket.on('resign', () => {
        console.log("Resign requested by:", uniquesocket.id);

        if (!gameInProgress) {
            uniquesocket.emit("error", "No active game to resign from");
            return;
        }

        let winner = '';
        if (uniquesocket.id === players.white) {
            winner = 'Black';
        } else if (uniquesocket.id === players.black) {
            winner = 'White';
        } else {
            uniquesocket.emit("error", "Only players can resign");
            return;
        }

        const message = `${uniquesocket.id === players.white ? 'White' : 'Black'} resigned - ${winner} wins!`;
        io.emit("gameOver", { winner, reason: 'resignation', message });
        endGame(winner, 'resignation');
    });
});
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Open http://localhost:${port} in your browser to play`);
});
