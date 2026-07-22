const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. SERVE O PLAYER LOCAL (Tudo o que estiver na pasta 'public' fica acessível na raiz)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Estado Mestre Central (O cérebro que sincroniza tudo)
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

// Calcula a posição atual do vídeo matematicamente sem sobrecarregar a rede
function getCurrentPosition() {
  if (!masterState.playing || !masterState.video) {
    return masterState.currentTime;
  }
  const elapsedSeconds = (Date.now() - masterState.updatedAt) / 1000;
  return masterState.currentTime + elapsedSeconds;
}

// Dispara atualizações em tempo real via WebSocket para os players modernos (TV Box)
function broadcastState(actionExtra = null) {
  const currentPos = getCurrentPosition();
  const payload = JSON.stringify({
    type: actionExtra ? "command" : "sync-transmission",
    action: actionExtra,
    ...masterState,
    currentTime: currentPos,
    isPlaying: masterState.playing,
    reproduzindo: masterState.playing,
    updatedAt: Date.now()
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Rota HTTP Polling (Usada pela TV antiga / Sraf)
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

// Rota de Envio de Mídia (Alinhada com o novo APK: POST /stream)
app.post('/stream', (req, res) => {
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

// Rota de Controle Remoto (Alinhada com o novo APK: POST /control, esperando "action")
app.post('/control', (req, res) => {
  // Pega "action" (do novo app) ou "acao" (segurança retroativa)
  const action = req.body.action || req.body.acao;

  if (action) {
    switch (action) {
      case 'play':
      case 'resume':
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

    masterState.ultimoComando = action;
    masterState.comandoId = Date.now();
    broadcastState(action);
  }

  res.json({ success: true, state: masterState });
});

// Canal WebSocket para os Players Modernos (TV Box)
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: "sync-transmission",
    ...masterState,
    currentTime: getCurrentPosition(),
    updatedAt: Date.now()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'sync-request' || data.tipo === 'sync-request') {
        ws.send(JSON.stringify({
          type: "sync-transmission",
          ...masterState,
          currentTime: getCurrentPosition(),
          updatedAt: Date.now()
        }));
      }
    } catch(e) {}
  });
});

// Garante que qualquer acesso direto sirva o index.html da pasta public
app.get(['/', '/smart-tv', '/smart-tv.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor X-Stream rodando na porta ${PORT}`);
  console.log(`📺 Player local da TV Box configurado na pasta /public/index.html`);
});
