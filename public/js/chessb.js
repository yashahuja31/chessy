const socket = io('http://127.0.0.1:3000', {
    withCredentials: true,
    transports: ['websocket', 'polling']
});
const chess = new Chess();
const boardelement = document.querySelector(".chessboard");

let draggedpiece = null;
let sourcesquare = null;
let playerrole = null;

const renderboard = () => {
    const board = chess.board();
    boardelement.innerHTML = "";
    board.forEach((row, rowindex) => {
        row.forEach((square, squareindex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add(
                "square",
                (rowindex + squareindex) % 2 === 0 ? "light" : "dark"
            );

            squareElement.dataset.row = rowindex;
            squareElement.dataset.col = squareindex;

            if (square) {
                const piece = document.createElement("div");
                piece.classList.add(
                    "piece",
                    square.color === "w" ? "white" : "black",
                    "draggable"
                );

                piece.innerText = pieceunicode(square);
                piece.draggable = true;
                
                piece.draggable = (playerrole === square.color);

                piece.addEventListener("dragstart", (event) => {
                    if (piece.draggable) {
                        draggedpiece = piece;
                        sourcesquare = { row: rowindex, col: squareindex };
                        event.dataTransfer.setData("text/plain", "");
                    }
                });

                piece.addEventListener("dragend", (event) => {
                    draggedpiece = null;
                    sourcesquare = null;
                });

                squareElement.appendChild(piece);
            }

            squareElement.addEventListener("dragover", (event) => {
                event.preventDefault();
            });

            squareElement.addEventListener("drop", (event) => {
                event.preventDefault();
                if (draggedpiece) {
                    const targetsource = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.col),
                    };

                    handlemove(sourcesquare, targetsource);
                }
            });

            boardelement.appendChild(squareElement);
        });
    });
    if (playerrole === 'b'){
        boardelement.classList.add("flipped");
    }
    else{
        boardelement.classList.remove("flipped");
    }
};

const handlemove = (source, target) => {
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: 'q'
    };

    const piece = chess.get(move.from);
    if (piece.type === 'p' && (target.row === 0 || target.row === 7)) {
        console.log("Pawn promotion detected");
        const promotionModal = document.getElementById('promotionModal');
        promotionModal.classList.remove('hidden');
        promotionModal.classList.add('flex');

        const promotionOptions = document.querySelectorAll('.promotion-option');
        promotionOptions.forEach(option => {
            option.onclick = () => {
                console.log(`Promoting to: ${option.dataset.piece}`);
                move.promotion = option.dataset.piece;
                socket.emit("move", move);
                promotionModal.classList.add('hidden');
                promotionModal.classList.remove('flex');
            };
        });
    } else {
        socket.emit("move", move);
    }
};

const pieceunicode = (piece) => {
    const unicode = {
        p: "♙",
        r: "♖",
        n: "♘",
        b: "♗",
        q: "♕",
        k: "♔",
        P: "♟",
        R: "♜",
        N: "♞",
        B: "♝",
        Q: "♛",
        K: "♚",
    };

    return unicode[piece.type] || "";
};

socket.on("playerrole", (role) => {
    console.log("Player role received:", role);
    playerrole = role;
    renderboard();
});

socket.on("spectatorrole", () => {
    playerrole = null;
    renderboard();
});

socket.on("boardstate", (fen) => {
    chess.load(fen);
    renderboard();
});

socket.on("move", (move) => {
    chess.move(move);
    renderboard();
});

socket.on("turnChange", (turn) => {
    const pieces = document.querySelectorAll(".piece");
    pieces.forEach(piece => {
        const pieceColor = piece.classList.contains("white") ? "w" : "b";
        piece.draggable = (pieceColor === turn);
    });
});

socket.on("gameOver", (winner) => {
    alert(`Game Over: ${winner} wins!`);
    console.log(`Game Over: ${winner} wins!`);
});

// Send message on button click
document.getElementById('sendMessage').onclick = () => {
    const messageInput = document.getElementById('chatInput');
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('chatMessage', message); // Emit the message to the server
        messageInput.value = ''; // Clear the input
    }
};

// Listen for incoming chat messages
socket.on('chatMessage', (message) => {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.textContent = message; // Display the message
    chatMessages.appendChild(messageElement); // Add message to chat
    chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to the bottom
});

renderboard();
