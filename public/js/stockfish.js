
self.onmessage = function(event) {
    const message = event.data;
    // console.log("Stockfish Worker received:", message); // Uncomment for worker debugging

    if (message.startsWith('position')) {
        //acknowledge the position command
    } else if (message.startsWith('go')) {
        // simulates a brief thinking time before responding with a dummy evaluation
        setTimeout(() => {
            // Generate some dummy evaluation to make the analysis page function
            const randomEvalType = Math.random() > 0.8 ? 'mate' : 'cp';
            // Simulate evaluation: cp between -200 and +200, or mate in 1-5 moves
            const randomCpValue = Math.floor(Math.random() * 400) - 200;
            const randomMateValue = Math.floor(Math.random() * 5) + 1; // Mate in 1 to 5 moves

            const scoreType = randomEvalType;
            const scoreValue = randomEvalType === 'mate' ? randomMateValue : randomCpValue;

            // Dummy best move (e.g., e2e4)
            const dummyBestMove = "e2e4"; // Always return e2e4 for simplicity

            self.postMessage(`info depth 15 score ${scoreType} ${scoreValue} pv ${dummyBestMove}`);
            self.postMessage(`bestmove ${dummyBestMove} ponder d7d5`); // Dummy best move and ponder
        }, 50); // Simulate very brief thinking time
    } else if (message === 'uci') {
        self.postMessage('id name Placeholder Stockfish JS');
        self.postMessage('id author Gemini AI Placeholder');
        self.postMessage('uciok');
    } else if (message === 'isready') {
        self.postMessage('readyok');
    } else if (message === 'ucinewgame') {
        //reset internal state if needed
    } else if (message === 'stop') {
        //stops the engine thinking
    }
};

self.postMessage('uci');
