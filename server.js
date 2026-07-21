const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 🟢 LIBERA A PASTA PUBLIC (Onde deve ficar o arquivo tv.html)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// =========================================================
// ESTADO MESTRE DA TRANSMISSÃO (Servidor Central)
// =========================================================
let masterState = {
  video: null,          // URL do vídeo/áudio atual
  ativo: false,         // Transmissão ativa?
  playing: false,       // Rodando ou pausado?
  reproduzindo: false,  // Campo de compatibilidade com a TV
  currentTime: 0,       // Tempo em segundos
  updatedAt: Date.now(),// Timestamp do servidor
  volume: 100,          // Volume 0 a 100
  mudo: false,
  seek: 0,
  fila: [],
  atual: 0
};

/**
 * Retorna o tempo exato em segundos do vídeo no milissegundo atual
 */
function getCurrentPosition() {
  if (!masterState.playing || !masterState.video) {
    return masterState.currentTime;
  }
  const elapsedSeconds = (Date.now() - masterState.updatedAt) / 1000;
  return masterState.currentTime + elapsedSeconds;
}

/**
 * Notifica clientes WebSocket (Player Secundário / App)
 */
function broadcastState() {
  const currentPos = getCurrentPosition();
  const payload = JSON.stringify({
    tipo: "sync-transmission",
    ...masterState,
    currentTime: currentPos,
    reproduzindo: masterState.playing,
    updatedAt: Date.now()
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// =========================================================
// ROTA GET /status (HTTP POLLING DA SMART TV E TV BOX)
// =========================================================
app.get('/status', (req, res) => {
  const currentPos = getCurrentPosition();
  
  res.json({
    ...masterState,
    video: masterState.video,
    ativo: !!masterState.video,
    playing: masterState.playing,
    reproduzindo: masterState.playing,
    currentTime: currentPos,
    position: currentPos,
    updatedAt: masterState.updatedAt
  });
});

// =========================================================
// ROTAS POST DE CONTROLE E ENVIO
// =========================================================
app.post('/enviar', (req, res) => {
  const url = req.body.url;
  if (url) {
    masterState.video = url;
    masterState.ativo = true;
    masterState.playing = true;
    masterState.reproduzindo = true;
    masterState.currentTime = 0;
    masterState.updatedAt = Date.now();
    broadcastState();
  }
  res.json({ success: true, state: masterState });
});

app.post('/controle', (req, res) => {
  const acao = req.body.acao;

  if (acao) {
    switch (acao) {
      case 'play':
      case 'resume':
        if (!masterState.playing) {
          masterState.playing = true;
          masterState.reproduzindo = true;
          masterState.updatedAt = Date.now();
        }
        break;

      case 'pause':
        if (masterState.playing) {
          masterState.currentTime = getCurrentPosition();
          masterState.playing = false;
          masterState.reproduzindo = false;
          masterState.updatedAt = Date.now();
        }
        break;

      case 'zerar_seek':
        masterState.seek = 0;
        break;

      case 'next':
        if (masterState.fila && masterState.fila.length > 0 && masterState.atual < masterState.fila.length - 1) {
          masterState.atual++;
          masterState.video = masterState.fila[masterState.atual].url;
          masterState.currentTime = 0;
          masterState.playing = true;
          masterState.reproduzindo = true;
          masterState.updatedAt = Date.now();
        }
        break;

      case 'prev':
        if (masterState.fila && masterState.fila.length > 0 && masterState.atual > 0) {
          masterState.atual--;
          masterState.video = masterState.fila[masterState.atual].url;
          masterState.currentTime = 0;
          masterState.playing = true;
          masterState.reproduzindo = true;
          masterState.updatedAt = Date.now();
        }
        break;
    }

    broadcastState();
  }

  res.json({ success: true, state: masterState });
});

// =========================================================
// WEBSOCKET (SEGUNDO PLAYER / APP WEBSOFT)
// =========================================================
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    tipo: "sync-transmission",
    ...masterState,
    currentTime: getCurrentPosition(),
    reproduzindo: masterState.playing,
    updatedAt: Date.now()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.tipo === 'sync-request') {
        ws.send(JSON.stringify({
          tipo: "sync-transmission",
          ...masterState,
          currentTime: getCurrentPosition(),
          reproduzindo: masterState.playing,
          updatedAt: Date.now()
        }));
      }
    } catch(e) {}
  });
});

// =========================================================
// ROTA PRINCIPAL: ABRE O HTML DA TV E TV BOX DIRECT
// =========================================================
app.get(['/', '/tv'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'smarttv.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor X-Stream rodando na porta ${PORT}`);
});
