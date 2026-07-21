const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Libera arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Estado Mestre Central com suporte a Fila Circular
let masterState = {
  video: null,          // URL do vídeo/áudio atual
  ativo: false,         // Transmissão ativa?
  playing: false,       // Rodando ou pausado?
  reproduzindo: false,  // Compatibilidade Smart TV
  currentTime: 0,       // Tempo em segundos
  updatedAt: Date.now(),// Timestamp de sincronização
  volume: 100,
  mudo: false,
  seek: 0,
  ultimoComando: null,
  comandoId: 0,
  fila: [],             // Fila de mídias [{ url: "..." }]
  atual: 0              // Índice da mídia atual
};

// Calcula a posição real do vídeo baseada no tempo decorrido no servidor
function getCurrentPosition() {
  if (!masterState.playing || !masterState.video) {
    return masterState.currentTime;
  }
  const elapsedSeconds = (Date.now() - masterState.updatedAt) / 1000;
  return masterState.currentTime + elapsedSeconds;
}

// Transmite o estado mestre para todos os clientes WebSocket
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

// Avança para a próxima mídia (Looping Infinito)
function proximaMidia() {
  if (!masterState.fila || masterState.fila.length === 0) return;

  // Se chegou ao fim, volta para a primeira (0)
  masterState.atual = (masterState.atual + 1) % masterState.fila.length;
  masterState.video = masterState.fila[masterState.atual].url;
  masterState.currentTime = 0;
  masterState.playing = true;
  masterState.reproduzindo = true;
  masterState.updatedAt = Date.now();
  broadcastState("next");
}

// Volta para a mídia anterior (Looping Infinito)
function midiaAnterior() {
  if (!masterState.fila || masterState.fila.length === 0) return;

  masterState.atual = (masterState.atual - 1 + masterState.fila.length) % masterState.fila.length;
  masterState.video = masterState.fila[masterState.atual].url;
  masterState.currentTime = 0;
  masterState.playing = true;
  masterState.reproduzindo = true;
  masterState.updatedAt = Date.now();
  broadcastState("prev");
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

// Envio de Mídia / Adição na Fila
app.post('/enviar', (req, res) => {
  const { url, limparFila } = req.body;

  if (url) {
    if (limparFila) {
      masterState.fila = [{ url: url }];
      masterState.atual = 0;
    } else {
      // Adiciona à fila existente
      masterState.fila.push({ url: url });
      // Se não havia mídia tocando, começa pela recém-adicionada
      if (!masterState.video) {
        masterState.atual = masterState.fila.length - 1;
      }
    }

    masterState.video = masterState.fila[masterState.atual].url;
    masterState.ativo = true;
    masterState.playing = true;
    masterState.reproduzindo = true;
    masterState.currentTime = 0;
    masterState.updatedAt = Date.now();
    broadcastState("play");
  }

  res.json({ success: true, state: masterState });
});

// Recepção de Comandos do Controle Remoto
app.post('/controle', (req, res) => {
  const { acao, url } = req.body;

  if (acao) {
    switch (acao) {
      case 'play':
      case 'resume':
        if (!masterState.video && masterState.fila.length > 0) {
          masterState.video = masterState.fila[masterState.atual].url;
        }
        if (masterState.video) {
          masterState.playing = true;
          masterState.reproduzindo = true;
          masterState.updatedAt = Date.now();
        }
        break;

      case 'pause':
        masterState.currentTime = getCurrentPosition();
        masterState.playing = false;
        masterState.reproduzindo = false;
        masterState.updatedAt = Date.now();
        break;

      case 'toggle_play':
        if (!masterState.video && masterState.fila.length > 0) {
          masterState.video = masterState.fila[masterState.atual].url;
          masterState.playing = true;
        } else if (masterState.video) {
          masterState.playing = !masterState.playing;
          if (!masterState.playing) {
            masterState.currentTime = getCurrentPosition();
          }
        }
        masterState.reproduzindo = masterState.playing;
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
        masterState.fila = [];
        masterState.atual = 0;
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
        proximaMidia();
        break;

      case 'prev':
      case 'previous':
        midiaAnterior();
        break;
    }

    masterState.ultimoComando = acao;
    masterState.comandoId = Date.now();
    broadcastState(acao);
  }

  res.json({ success: true, state: masterState });
});

// WebSocket para os Players
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
      } else if (data.acao === 'next') {
        proximaMidia();
      } else if (data.acao === 'prev') {
        midiaAnterior();
      }
    } catch(e) {}
  });
});

app.get(['/', '/smart-tv', '/smart-tv.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'smart-tv.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor X-Stream rodando na porta ${PORT}`);
});
