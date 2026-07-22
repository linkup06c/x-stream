const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const ESTADO_FILE = path.join(__dirname, 'estado.json');

// Função auxiliar para ler o JSON compartilhado de forma segura
function lerEstado() {
  try {
    if (fs.existsSync(ESTADO_FILE)) {
      const data = fs.readFileSync(ESTADO_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}
  
  // Estado padrão caso o arquivo não exista
  return {
    video: null,
    ativo: false,
    playing: false,
    reproduzindo: false,
    currentTime: 0,
    updatedAt: Date.now(),
    volume: 100,
    mudo: false,
    fila: [],
    atual: 0,
    comandoId: 0,
    acao: null
  };
}

// Calcula a posição atual com base no timestamp salvo
function getCurrentPosition(state) {
  if (!state.playing || !state.video) {
    return state.currentTime || 0;
  }
  const elapsedSeconds = (Date.now() - (state.updatedAt || Date.now())) / 1000;
  return (state.currentTime || 0) + elapsedSeconds;
}

// Rota de Status consumida pelo Player do App
app.get('/status', (req, res) => {
  const state = lerEstado();
  const currentPos = getCurrentPosition(state);
  res.json({
    ...state,
    ativo: !!state.video,
    playing: state.playing,
    reproduzindo: state.playing,
    currentTime: currentPos,
    position: currentPos
  });
});

// Broadcast via WebSocket para todos os players conectados no app
function broadcastState() {
  const state = lerEstado();
  state.currentTime = getCurrentPosition(state);
  
  const payload = JSON.stringify(state);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// WebSocket connection
wss.on('connection', (ws) => {
  const state = lerEstado();
  state.currentTime = getCurrentPosition(state);
  ws.send(JSON.stringify(state));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.tipo === 'sync-request') {
        const atualState = lerEstado();
        atualState.currentTime = getCurrentPosition(atualState);
        ws.send(JSON.stringify(atualState));
      }
    } catch(e) {}
  });
});

// Intervalo para verificar atualizações no JSON e propagar aos clientes
setInterval(() => {
  broadcastState();
}, 1000);

app.get(['/', '/smart-tv', '/smart-tv.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'smart-tv.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de Player X-Stream rodando na porta ${PORT}`);
});
