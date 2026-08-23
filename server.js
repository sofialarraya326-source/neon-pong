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

// =========================
// ARCHIVOS DEL JUEGO
// =========================

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =========================
// SALAS
// =========================

const rooms = new Map();

function generateRoomCode() {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    do {
        code = "";

        for (let i = 0; i < 4; i++) {
            code += characters[
                Math.floor(Math.random() * characters.length)
            ];
        }
    } while (rooms.has(code));

    return code;
}

// =========================
// ESTADO DEL JUEGO
// =========================

function createGameState() {
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

// =========================
// REINICIAR PELOTA
// =========================

function resetBall(game, direction = 1) {
    game.ballX = WIDTH / 2;
    game.ballY = HEIGHT / 2;

    game.ballDX = BALL_SPEED * direction;

    game.ballDY =
        (Math.random() > 0.5 ? 1 : -1) * BALL_SPEED;
}

// =========================
// ENVIAR ESTADO
// =========================

function sendGameState(room) {
    io.to(room.code).emit("gameState", room.game);
}

function sendPlayers(room) {
    io.to(room.code).emit("playersUpdate", room.game);
}

// =========================
// MOTOR DEL PONG
// =========================

function updateGame(room) {
    const game = room.game;

    if (!game.running) {
        return;
    }

    game.ballX += game.ballDX;
    game.ballY += game.ballDY;

    // Rebote arriba
    if (game.ballY - BALL_RADIUS <= 0) {
        game.ballY = BALL_RADIUS;
        game.ballDY = Math.abs(game.ballDY);
    }

    // Rebote abajo
    if (game.ballY + BALL_RADIUS >= HEIGHT) {
        game.ballY = HEIGHT - BALL_RADIUS;
        game.ballDY = -Math.abs(game.ballDY);
    }

    // Paleta izquierda
    if (
        game.ballDX < 0 &&
        game.ballX - BALL_RADIUS <= 20 + PADDLE_WIDTH &&
        game.ballX + BALL_RADIUS >= 20 &&
        game.ballY >= game.paddle1Y &&
        game.ballY <= game.paddle1Y + PADDLE_HEIGHT
    ) {
        game.ballX =
            20 + PADDLE_WIDTH + BALL_RADIUS;

        game.ballDX = Math.abs(game.ballDX);
    }

    // Paleta derecha
    if (
        game.ballDX > 0 &&
        game.ballX + BALL_RADIUS >= WIDTH - 35 &&
        game.ballX - BALL_RADIUS <=
            WIDTH - 35 + PADDLE_WIDTH &&
        game.ballY >= game.paddle2Y &&
        game.ballY <= game.paddle2Y + PADDLE_HEIGHT
    ) {
        game.ballX =
            WIDTH - 35 - BALL_RADIUS;

        game.ballDX = -Math.abs(game.ballDX);
    }

    // Punto jugador 2
    if (game.ballX < 0) {
        game.score2++;

        checkWinner(room);

        if (game.running) {
            resetBall(game, 1);
        }
    }

    // Punto jugador 1
    if (game.ballX > WIDTH) {
        game.score1++;

        checkWinner(room);

        if (game.running) {
            resetBall(game, -1);
        }
    }
}

// =========================
// GANADOR
// =========================

function checkWinner(room) {
    const game = room.game;

    let winner = null;

    if (game.score1 >= MAX_SCORE) {
        winner = 1;
    }

    if (game.score2 >= MAX_SCORE) {
        winner = 2;
    }

    if (winner !== null) {
        game.running = false;

        io.to(room.code).emit("gameOver", {
            winner
        });
    }
}

// =========================
// CONEXIONES
// =========================

io.on("connection", (socket) => {
    console.log(
        "🟢 Jugador conectado:",
        socket.id
    );

    // =====================
    // CREAR PARTIDA
    // =====================

    socket.on("createRoom", (name) => {
        name = String(name || "")
            .trim()
            .slice(0, 15);

        if (!name) {
            return;
        }

        const code = generateRoomCode();

        const room = {
            code,
            player1: socket.id,
            player2: null,
            game: createGameState()
        };

        room.game.player1 = true;
        room.game.name1 = name;

        rooms.set(code, room);

        socket.join(code);

        socket.roomCode = code;
        socket.player = 1;
        socket.playerName = name;

        socket.emit("roomCreated", {
            code,
            player: 1,
            name
        });

        sendPlayers(room);

        console.log(
            `🏠 Sala ${code} creada por ${name}`
        );
    });

    // =====================
    // UNIRSE
    // =====================

    socket.on("joinRoom", ({ code, name }) => {
        code = String(code || "")
            .trim()
            .toUpperCase();

        name = String(name || "")
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
        socket.playerName = name;

        socket.emit("roomJoined", {
            code,
            player: 2,
            name
        });

        sendPlayers(room);

        // Comenzar partida
        room.game.running = true;

        room.game.score1 = 0;
        room.game.score2 = 0;

        room.game.paddle1Y =
            HEIGHT / 2 - PADDLE_HEIGHT / 2;

        room.game.paddle2Y =
            HEIGHT / 2 - PADDLE_HEIGHT / 2;

        resetBall(
            room.game,
            Math.random() > 0.5 ? 1 : -1
        );

        sendGameState(room);

        console.log(
            `🎮 ${name} se unió a la sala ${code}`
        );
    });

    // =====================
    // MOVIMIENTO
    // =====================

    socket.on("move", (direction) => {
        const code = socket.roomCode;
        const room = rooms.get(code);

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

    // =====================
    // DESCONECTAR
    // =====================

    socket.on("disconnect", () => {
        const code = socket.roomCode;
        const room = rooms.get(code);

        if (!room) {
            return;
        }

        console.log(
            `🔴 Jugador salió de la sala ${code}`
        );

        io.to(code).emit("roomDisconnected");

        rooms.delete(code);
    });
});

// =========================
// MOTOR DEL SERVIDOR
// =========================

setInterval(() => {
    for (const room of rooms.values()) {
        updateGame(room);

        if (room.game.running) {
            sendGameState(room);
        }
    }
}, 1000 / 60);

// =========================
// SERVIDOR
// =========================

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "================================="
        );

        console.log(
            "🏓 NEON PONG"
        );

        console.log(
            "================================="
        );

        console.log(
            `🟢 Servidor iniciado en puerto ${PORT}`
        );
    }
);
