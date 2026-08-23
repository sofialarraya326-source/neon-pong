const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const WIDTH = 800;
const HEIGHT = 500;

const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 100;
const PADDLE_SPEED = 8;

const BALL_RADIUS = 10;
const BALL_SPEED = 5;

const MAX_SCORE = 10;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function createCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;

    do {
        code = "";

        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));

    return code;
}

function createGame() {
    return {
        player1: false,
        player2: false,

        name1: "",
        name2: "",

        paddle1Y: HEIGHT / 2 - PADDLE_HEIGHT / 2,
        paddle2Y: HEIGHT / 2 - PADDLE_HEIGHT / 2,

        ballX: WIDTH / 2,
        ballY: HEIGHT / 2,

        ballDX: BALL_SPEED,
        ballDY: BALL_SPEED,

        score1: 0,
        score2: 0,

        running: false
    };
}

function resetBall(game, direction) {
    game.ballX = WIDTH / 2;
    game.ballY = HEIGHT / 2;

    game.ballDX = BALL_SPEED * direction;
    game.ballDY =
        (Math.random() < 0.5 ? -1 : 1) *
        BALL_SPEED;
}

function sendState(room) {
    io.to(room.code).emit("gameState", room.game);
}

function sendPlayers(room) {
    io.to(room.code).emit("playersUpdate", {
        player1: room.game.player1,
        player2: room.game.player2,
        name1: room.game.name1,
        name2: room.game.name2
    });
}

function finishGame(room, winner) {
    room.game.running = false;

    io.to(room.code).emit("gameOver", {
        winner: winner
    });
}

function updateGame(room) {
    const game = room.game;

    if (!game.running) {
        return;
    }

    game.ballX += game.ballDX;
    game.ballY += game.ballDY;

    if (game.ballY - BALL_RADIUS <= 0) {
        game.ballY = BALL_RADIUS;
        game.ballDY = Math.abs(game.ballDY);
    }

    if (game.ballY + BALL_RADIUS >= HEIGHT) {
        game.ballY = HEIGHT - BALL_RADIUS;
        game.ballDY = -Math.abs(game.ballDY);
    }

    if (
        game.ballDX < 0 &&
        game.ballX - BALL_RADIUS <= 35 &&
        game.ballX + BALL_RADIUS >= 20 &&
        game.ballY >= game.paddle1Y &&
        game.ballY <= game.paddle1Y + PADDLE_HEIGHT
    ) {
        game.ballX = 35 + BALL_RADIUS;
        game.ballDX = Math.abs(game.ballDX);
    }

    if (
        game.ballDX > 0 &&
        game.ballX + BALL_RADIUS >= WIDTH - 35 &&
        game.ballX - BALL_RADIUS <= WIDTH - 20 &&
        game.ballY >= game.paddle2Y &&
        game.ballY <= game.paddle2Y + PADDLE_HEIGHT
    ) {
        game.ballX = WIDTH - 35 - BALL_RADIUS;
        game.ballDX = -Math.abs(game.ballDX);
    }

    if (game.ballX < 0) {
        game.score2++;

        if (game.score2 >= MAX_SCORE) {
            finishGame(room, 2);
            return;
        }

        resetBall(game, 1);
    }

    if (game.ballX > WIDTH) {
        game.score1++;

        if (game.score1 >= MAX_SCORE) {
            finishGame(room, 1);
            return;
        }

        resetBall(game, -1);
    }
}

io.on("connection", (socket) => {
    console.log("🟢 Jugador conectado:", socket.id);

    socket.on("createRoom", (name) => {
        name = String(name || "").trim().slice(0, 15);

        if (!name) {
            return;
        }

        const code = createCode();

        const room = {
            code: code,
            player1: socket.id,
            player2: null,
            game: createGame()
        };

        room.game.player1 = true;
        room.game.name1 = name;

        rooms.set(code, room);

        socket.join(code);

        socket.roomCode = code;
        socket.player = 1;

        socket.emit("roomCreated", {
            code: code,
            player: 1,
            name: name
        });

        sendPlayers(room);

        console.log("🏠 Sala creada:", code);
    });

    socket.on("joinRoom", (data) => {
        const code = String(data.code || "")
            .trim()
            .toUpperCase();

        const name = String(data.name || "")
            .trim()
            .slice(0, 15);

        const room = rooms.get(code);

        if (!room) {
            socket.emit("roomNotFound");
            return;
        }

        if (room.player2) {
            socket.emit("roomFull");
            return;
        }

        if (!name) {
            return;
        }

        room.player2 = socket.id;

        room.game.player2 = true;
        room.game.name2 = name;

        socket.join(code);

        socket.roomCode = code;
        socket.player = 2;

        socket.emit("roomJoined", {
            code: code,
            player: 2,
            name: name
        });

        room.game.running = true;
        room.game.score1 = 0;
        room.game.score2 = 0;

        room.game.paddle1Y =
            HEIGHT / 2 - PADDLE_HEIGHT / 2;

        room.game.paddle2Y =
            HEIGHT / 2 - PADDLE_HEIGHT / 2;

        resetBall(
            room.game,
            Math.random() < 0.5 ? -1 : 1
        );

        sendPlayers(room);
        sendState(room);

        console.log("🎮 Jugador 2 se unió:", code);
    });

    socket.on("move", (direction) => {
        const room = rooms.get(socket.roomCode);

        if (!room || !socket.player) {
            return;
        }

        const game = room.game;

        if (socket.player === 1) {
            if (direction === "up") {
                game.paddle1Y -= PADDLE_SPEED;
            }

            if (direction === "down") {
                game.paddle1Y += PADDLE_SPEED;
            }

            game.paddle1Y = Math.max(
                0,
                Math.min(
                    HEIGHT - PADDLE_HEIGHT,
                    game.paddle1Y
                )
            );
        }

        if (socket.player === 2) {
            if (direction === "up") {
                game.paddle2Y -= PADDLE_SPEED;
            }

            if (direction === "down") {
                game.paddle2Y += PADDLE_SPEED;
            }

            game.paddle2Y = Math.max(
                0,
                Math.min(
                    HEIGHT - PADDLE_HEIGHT,
                    game.paddle2Y
                )
            );
        }
    });

    socket.on("disconnect", () => {
        const room = rooms.get(socket.roomCode);

        if (!room) {
            return;
        }

        io.to(room.code).emit("roomDisconnected");

        rooms.delete(room.code);

        console.log("🔴 Sala cerrada:", room.code);
    });
});

setInterval(() => {
    for (const room of rooms.values()) {
        updateGame(room);

        if (room.game.running) {
            sendState(room);
        }
    }
}, 1000 / 60);

server.listen(PORT, "0.0.0.0", () => {
    console.log("=================================");
    console.log("🏓 NEON PONG");
    console.log("=================================");
    console.log("🟢 Servidor iniciado en puerto " + PORT);
});
