const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Libera a pasta public (onde fica o tv.html)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Estado Mestre Central
let masterState = {
  video: null,
  ativo: false,
  playing: false,
  reproduzindo: false,
  currentTime: 0,
  updatedAt: Date.now(),
  volume: 100,
  mudo: false,
  ultimoComando: null,
  comandoId: 0,
  fila: [],
  atual: 0
};

function getCurrentPosition() {
  if (!masterState.playing || !masterState.video) {
    return masterState.currentTime;
  }
  const elapsedSeconds = (Date.now() - masterState.updatedAt) / 1000;
  return masterState.currentTime + elapsedSeconds;
}

// Envia o estado + ação para todos os clientes WebSocket
function broadcastState(acaoExtra = null) {
  const currentPos = getCurrentPosition();
  const payload = JSON.stringify({
    tipo: acaoExtra ? "comando" : "sync-transmission",
    acao: acaoExtra,
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

// Rota HTTP Polling para a Smart TV
app.get('/status', (req, res) => {
  const currentPos = getCurrentPosition();
  res.json({
    ...masterState,
    ativo: !!masterState.video,
    currentTime: currentPos,
    position: currentPos
  });
});

// Envio de Vídeo
app.post('/enviar', (req, res) => {
  const url = req.body.url;
  if (url) {
    masterState.video = url;
    masterState.ativo = true;
    masterState.playing = true;
    masterState.reproduzindo = true;
    masterState.currentTime = 0;
    masterState.updatedAt = Date.now();
    broadcastState("play");
  }
  res.json({ success: true, state: masterState });
});

// Controle Remoto
app.post('/controle', (req, res) => {
  const acao = req.body.acao;

  if (acao) {
    switch (acao) {
      case 'play':
      case 'resume':
        // Alterna entre Play e Pause se for acionado repetidamente
        if (!masterState.video) break;
        masterState.playing = !masterState.playing;
        masterState.reproduzindo = masterState.playing;
        if (!masterState.playing) {
          masterState.currentTime = getCurrentPosition();
        }
        masterState.updatedAt = Date.now();
        break;

      case 'pause':
        masterState.currentTime = getCurrentPosition();
        masterState.playing = false;
        masterState.reproduzindo = false;
        masterState.updatedAt = Date.now();
        break;

      case 'power':
      case 'clear':
      case 'stop':
        masterState.video = null;
        masterState.ativo = false;
        masterState.playing = false;
        masterState.reproduzindo = false;
        masterState.currentTime = 0;
        masterState.updatedAt = Date.now();
        break;

      case 'mute':
        masterState.mudo = !masterState.mudo;
        break;

      case 'vol_up':
        masterState.volume = Math.min(100, masterState.volume + 10);
        break;

      case 'vol_down':
        masterState.volume = Math.max(0, masterState.volume - 10);
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
      case 'previous':
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

    masterState.ultimoComando = acao;
    masterState.comandoId = Date.now();

    // Notifica players WebSocket imediatamente
    broadcastState(acao);
  }

  res.json({ success: true, state: masterState });
});

// Conexão WebSocket
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    tipo: "sync-transmission",
    ...masterState,
    currentTime: getCurrentPosition(),
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
          updatedAt: Date.now()
        }));
      }
    } catch(e) {}
  });
});

// Serve o tv.html na raiz e na rota /tv
app.get(['/', '/tv'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'smarttv.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor X-Stream rodando na porta ${PORT}`);
});
