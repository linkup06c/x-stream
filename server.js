const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Libera arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Estado Mestre Central
let masterState = {
  video: null,          // URL do vídeo/áudio atual
  ativo: false,         // Transmissão ativa?
  playing: false,       // Rodando ou pausado?
  reproduzindo: false,  // Compatibilidade com Smart TV
  currentTime: 0,       // Tempo em segundos
  updatedAt: Date.now(),// Timestamp de sincronização
  volume: 100,
  mudo: false,
  seek: 0,
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

// Dispara atualizações via WebSocket para clientes compatíveis
function broadcastState(acaoExtra = null) {
  const currentPos = getCurrentPosition();
  const payload = JSON.stringify({
    tipo: acaoExtra ? "comando" : "sync-transmission",
    x-stm: acaoExtra,
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

// Rota HTTP Polling usada pela Smart TV
app.get('/status', (req, res) => {
  const currentPos = getCurrentPosition();
  res.json({
    ...masterState,
    ativo: !!masterState.video,
    playing: masterState.playing,
    reproduzindo: masterState.playing,
    currentTime: currentPos,
    position: currentPos
  });
});

// Envio de nova mídia
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

// Recepção de comandos do Controle Remoto
app.post('/controle', (req, res) => {
  const x-stm = req.body.x-stm;

  if (x-stm) {
    switch (x-stm) {
      case 'play':
      case 'resume':
        if (!masterState.video) break;
        // Alterna (toggle) entre play e pause se clicado consecutivamente
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

    masterState.ultimoComando = x-stm;
    masterState.comandoId = Date.now();
    broadcastState(x-stm);
  }

  res.json({ success: true, state: masterState });
});

// WebSocket para o Player Secundário / WebSoft
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

// Rota principal e atalhos para abrir o arquivo smart-tv.html
app.get(['/', '/smart-tv', '/smart-tv.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'smart-tv.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor X-Stream rodando na porta ${PORT}`);
});
