const express = require("express");
const socket = require("socket.io");
const {Chess} = require("chess.js");
const http = require("http");
const path = require("path");
const cors = require('cors');
require('dotenv').config()

const port = process.env.PORT || 3000;

const app = express();

app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
    methods: ['GET', 'POST'],
    credentials: true
}));

const server = http.createServer(app);
const io = socket(server, {
    cors: {
        origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const chess = new Chess();
let players = {};
let currentplayer = 'W';

app.set("view engine", "html");

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.send("index");
});

io.on("connection", (uniquesocket) => {
    console.log("connection made/ connected");

    uniquesocket.on("user", () => {
        console.log("a user connected");
    });

    uniquesocket.emit("user joined");

    if (!players.white){
        players.white=uniquesocket.id;
        uniquesocket.emit("playerrole", "w");
    }
    else if (!players.black){
        players.black=uniquesocket.id;
        uniquesocket.emit("playerrole", "b");
    }
    else {
        uniquesocket.emit("spectatorrole");
    }
    

    uniquesocket.on("disconnect", () => {
        console.log("user disconnected");
        if(uniquesocket.id === players.white){
            delete players.white;
        }
        else if (uniquesocket.id == players.black){
            delete players.black;
        }
    });

    uniquesocket.on("move", (move) => {
        try{
            if(chess.turn() === "w" && uniquesocket.id !== players.white) return;
            if(chess.turn() === "b" && uniquesocket.id !== players.black) return;

            const result = chess.move(move);

            if(result){
                currentplayer = chess.turn();
                io.emit("move", move);
                io.emit("boardState", chess.fen());
                io.emit("turnChange", currentplayer);

                // to check for game over
                if (chess.isGameOver()) {
                    const winner = isCheckmate(chess.turn()) ? (chess.turn() === 'w' ? 'Black' : 'White') : 'Draw';
                    console.log(`Game Over: ${winner} wins!`); // Log to console
                    io.emit("gameOver", winner); // Emit game over event to both players
                }
            }
            else{
                console.log("Invalid move:", move);
                uniquesocket.emit("Invalid move", move);
            }
        }
        catch(err){
            console.log(err);
            uniquesocket.emit("Error", err);
        }
    });

    // Handle incoming chat messages
    uniquesocket.on('chatMessage', (message) => {
        io.emit('chatMessage', message); // Broadcast the message to all connected clients
    });
});

server.listen(port, () => {
    console.log(`listening on port ${port}`)
});                              

const isCheckmate = (color) => {
    if (!chess.in_check()) {
        return false;
    }
    const moves = chess.moves({ verbose: true });
    
    for (const move of moves) {
        chess.move(move); 
        if (!chess.in_check()) {
            chess.undo(); 
            return false; 
        }
        chess.undo(); 
    }

    return true; 
};