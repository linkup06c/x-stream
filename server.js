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
  reproduzindo: false,  // Compatibilidade
  currentTime: 0,       // Tempo em segundos
  updatedAt: Date.now(),// Timestamp de sincronização
  volume: 100,
  mudo: false,
  seek: 0,
  ultimoComando: null,
  comandoId: 0,
  fila: [],             // Lista de mídias [{ url: '...' }]
  atual: 0
};

function getCurrentPosition() {
  if (!masterState.playing || !masterState.video) {
    return masterState.currentTime;
  }
  const elapsedSeconds = (Date.now() - masterState.updatedAt) / 1000;
  return masterState.currentTime + elapsedSeconds;
}

// Dispara atualizações via WebSocket
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

// Envio de nova mídia com Fila em Sequência
app.post('/enviar', (req, res) => {
  const url = req.body.url;
  if (url) {
    masterState.fila.push({ url: url });
    
    // Se nada estiver tocando, inicia imediatamente a nova mídia
    if (!masterState.video || !masterState.ativo) {
      masterState.atual = masterState.fila.length - 1;
      masterState.video = url;
      masterState.ativo = true;
      masterState.playing = true;
      masterState.reproduzindo = true;
      masterState.currentTime = 0;
      masterState.updatedAt = Date.now();
    }
    broadcastState("enviar");
  }
  res.json({ success: true, state: masterState });
});

// Recepção de comandos do Controle Remoto com TODAS as funções
app.post('/controle', (req, res) => {
  const acao = req.body.acao;

  if (acao) {
    switch (acao) {
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

      // Avançar e Voltar 15 Segundos
      case 'forward_15':
        masterState.seek = 15;
        break;

      case 'rewind_15':
        masterState.seek = -15;
        break;

      case 'zerar_seek':
        masterState.seek = 0;
        break;

      // Avançar Fila com Ciclo Infinito (Se chegar ao fim, volta pro 1º)
      case 'next':
        if (masterState.fila && masterState.fila.length > 0) {
          if (masterState.atual < masterState.fila.length - 1) {
            masterState.atual++;
          } else {
            masterState.atual = 0; // Volta para o início do ciclo
          }
          masterState.video = masterState.fila[masterState.atual].url;
          masterState.currentTime = 0;
          masterState.playing = true;
          masterState.reproduzindo = true;
          masterState.updatedAt = Date.now();
        }
        break;

      // Voltar Fila com Ciclo
      case 'prev':
      case 'previous':
        if (masterState.fila && masterState.fila.length > 0) {
          if (masterState.atual > 0) {
            masterState.atual--;
          } else {
            masterState.atual = masterState.fila.length - 1; // Vai para o último
          }
          masterState.video = masterState.fila[masterState.atual].url;
          masterState.currentTime = 0;
          masterState.playing = true;
          masterState.reproduzindo = true;
          masterState.updatedAt = Date.now();
        }
        break;

      // Comandos Navegacionais (D-PAD / Teclado Smart TV)
      case 'up':
      case 'down':
      case 'left':
      case 'right':
      case 'ok':
      case 'back':
      case 'home':
        // Comandos repassados via broadcast/polling para a interface do Player
        break;
    }

    masterState.ultimoComando = acao;
    masterState.comandoId = Date.now();
    broadcastState(acao);
  }

  res.json({ success: true, state: masterState });
});

// WebSocket para conexões secundárias
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

app.get(['/', '/smart-tv', '/smart-tv.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'smart-tv.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor X-Stream rodando na porta ${PORT}`);
});
