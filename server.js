const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));

/* =========================
   CONFIGURACIÓN DEL JUEGO
========================= */

const WIDTH = 800;
const HEIGHT = 500;

const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 100;

const PADDLE_SPEED = 7;

const BALL_RADIUS = 10;
const BALL_SPEED = 5;

const MAX_SCORE = 10;


/* =========================
   ESTADO DEL JUEGO
========================= */

const game = {
    players: {
        player1: null,
        player2: null
    },

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


/* =========================
   REINICIAR PELOTA
========================= */

function resetBall(direction = 1) {

    game.ballX = WIDTH / 2;
    game.ballY = HEIGHT / 2;

    game.ballDX = BALL_SPEED * direction;

    game.ballDY =
        (Math.random() > 0.5 ? 1 : -1) *
        (BALL_SPEED * 0.7);
}


/* =========================
   ESTADO PARA LOS CLIENTES
========================= */

function getGameState() {

    return {
        player1: Boolean(game.players.player1),
        player2: Boolean(game.players.player2),

        paddle1Y: game.paddle1Y,
        paddle2Y: game.paddle2Y,

        ballX: game.ballX,
        ballY: game.ballY,

        score1: game.score1,
        score2: game.score2,

        running: game.running
    };
}


/* =========================
   ENVIAR ESTADO
========================= */

function broadcastState() {

    io.emit("gameState", getGameState());

}


/* =========================
   LÓGICA DE LA PELOTA
========================= */

function updateBall() {

    if (!game.running) {
        return;
    }


    game.ballX += game.ballDX;
    game.ballY += game.ballDY;


    /* Rebote arriba */

    if (
        game.ballY - BALL_RADIUS <= 0
    ) {

        game.ballY = BALL_RADIUS;

        game.ballDY =
            Math.abs(game.ballDY);

    }


    /* Rebote abajo */

    if (
        game.ballY + BALL_RADIUS >= HEIGHT
    ) {

        game.ballY =
            HEIGHT - BALL_RADIUS;

        game.ballDY =
            -Math.abs(game.ballDY);

    }


    /* =========================
       PALETA 1
    ========================= */

    const paddle1X = 20;

    if (
        game.ballDX < 0 &&
        game.ballX - BALL_RADIUS <=
            paddle1X + PADDLE_WIDTH &&
        game.ballX + BALL_RADIUS >=
            paddle1X &&
        game.ballY >= game.paddle1Y &&
        game.ballY <=
            game.paddle1Y + PADDLE_HEIGHT
    ) {

        game.ballX =
            paddle1X +
            PADDLE_WIDTH +
            BALL_RADIUS;

        game.ballDX =
            Math.abs(game.ballDX) + 0.2;

        const hitPosition =
            (
                game.ballY -
                (
                    game.paddle1Y +
                    PADDLE_HEIGHT / 2
                )
            ) /
            (PADDLE_HEIGHT / 2);

        game.ballDY =
            hitPosition * BALL_SPEED;

    }


    /* =========================
       PALETA 2
    ========================= */

    const paddle2X =
        WIDTH - 20 - PADDLE_WIDTH;

    if (
        game.ballDX > 0 &&
        game.ballX + BALL_RADIUS >=
            paddle2X &&
        game.ballX - BALL_RADIUS <=
            paddle2X + PADDLE_WIDTH &&
        game.ballY >= game.paddle2Y &&
        game.ballY <=
            game.paddle2Y + PADDLE_HEIGHT
    ) {

        game.ballX =
            paddle2X -
            BALL_RADIUS;

        game.ballDX =
            -Math.abs(game.ballDX) - 0.2;

        const hitPosition =
            (
                game.ballY -
                (
                    game.paddle2Y +
                    PADDLE_HEIGHT / 2
                )
            ) /
            (PADDLE_HEIGHT / 2);

        game.ballDY =
            hitPosition * BALL_SPEED;

    }


    /* =========================
       PUNTO JUGADOR 2
    ========================= */

    if (game.ballX < -20) {

        game.score2++;

        resetBall(1);

        checkWinner();

    }


    /* =========================
       PUNTO JUGADOR 1
    ========================= */

    if (game.ballX > WIDTH + 20) {

        game.score1++;

        resetBall(-1);

        checkWinner();

    }

}


/* =========================
   GANADOR
========================= */

function checkWinner() {

    if (
        game.score1 >= MAX_SCORE ||
        game.score2 >= MAX_SCORE
    ) {

        game.running = false;

        const winner =
            game.score1 >= MAX_SCORE
                ? 1
                : 2;

        io.emit(
            "gameOver",
            {
                winner
            }
        );

        setTimeout(() => {

            game.score1 = 0;
            game.score2 = 0;

            resetBall(
                Math.random() > 0.5
                    ? 1
                    : -1
            );

            if (
                game.players.player1 &&
                game.players.player2
            ) {
                game.running = true;
            }

            broadcastState();

        }, 3000);

    }

}


/* =========================
   MOVIMIENTO
========================= */

function movePaddle(player, direction) {

    if (player === 1) {

        if (direction === "up") {
            game.paddle1Y -= PADDLE_SPEED;
        }

        if (direction === "down") {
            game.paddle1Y += PADDLE_SPEED;
        }

        game.paddle1Y =
            Math.max(
                0,
                Math.min(
                    HEIGHT - PADDLE_HEIGHT,
                    game.paddle1Y
                )
            );

    }


    if (player === 2) {

        if (direction === "up") {
            game.paddle2Y -= PADDLE_SPEED;
        }

        if (direction === "down") {
            game.paddle2Y += PADDLE_SPEED;
        }

        game.paddle2Y =
            Math.max(
                0,
                Math.min(
                    HEIGHT - PADDLE_HEIGHT,
                    game.paddle2Y
                )
            );

    }

}


/* =========================
   CONEXIONES
========================= */

io.on("connection", (socket) => {

    console.log(
        "🟢 Dispositivo conectado:",
        socket.id
    );


    let player = null;


    /* Jugador 1 */

    if (!game.players.player1) {

        game.players.player1 =
            socket.id;

        player = 1;

    }

    /* Jugador 2 */

    else if (!game.players.player2) {

        game.players.player2 =
            socket.id;

        player = 2;

    }


    /* Sala llena */

    else {

        socket.emit("roomFull");

        socket.disconnect();

        return;

    }


    console.log(
        `🏓 Jugador ${player} conectado`
    );


    socket.emit(
        "playerAssigned",
        player
    );


    io.emit(
        "playersUpdate",
        {
            player1:
                Boolean(game.players.player1),

            player2:
                Boolean(game.players.player2)
        }
    );


    /* Empezar cuando hay 2 */

    if (
        game.players.player1 &&
        game.players.player2
    ) {

        game.running = true;

        resetBall(
            Math.random() > 0.5
                ? 1
                : -1
        );

        console.log(
            "🔥 ¡Los dos jugadores están listos!"
        );

    }


    /* =========================
       MOVIMIENTO
    ========================= */

    socket.on(
        "move",
        (direction) => {

            if (
                direction !== "up" &&
                direction !== "down"
            ) {
                return;
            }

            movePaddle(
                player,
                direction
            );

        }
    );


    /* =========================
       DESCONEXIÓN
    ========================= */

    socket.on(
        "disconnect",
        () => {

            console.log(
                `🔴 Jugador ${player} se desconectó`
            );


            if (player === 1) {
                game.players.player1 = null;
            }

            if (player === 2) {
                game.players.player2 = null;
            }


            game.running = false;


            io.emit(
                "playersUpdate",
                {
                    player1:
                        Boolean(game.players.player1),

                    player2:
                        Boolean(game.players.player2)
                }
            );


            broadcastState();

        }
    );

});


/* =========================
   LOOP DEL JUEGO
========================= */

setInterval(() => {

    updateBall();

    broadcastState();

}, 1000 / 60);


/* =========================
   SERVIDOR
========================= */

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
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

        console.log(
            `💻 http://localhost:${PORT}`
        );

        console.log("");
    }
);