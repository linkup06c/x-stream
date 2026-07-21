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
  fila: [],             // Lista de mídias [{ url: '...', titulo: '...' }]
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

// ==========================================
// ROTA DE POLLING E ENVIO BÁSICO (MANTIDOS)
// ==========================================
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

app.post('/enviar', (req, res) => {
  const { url, titulo } = req.body;
  if (url) {
    masterState.fila.push({ url: url, titulo: titulo || "Sem título" });

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

// ==========================================
// NOVAS ROTAS PARA GERENCIAMENTO TOTAL (API)
// ==========================================

// Obter estado atual completo do servidor
app.get('/api/estado', (req, res) => {
  res.json({ ...masterState, currentTime: getCurrentPosition() });
});

// Definir/Substituir a Fila completa (Array de URLs)
app.post('/api/fila', (req, res) => {
  const { fila, indice } = req.body;
  if (Array.isArray(fila)) {
    masterState.fila = fila;
    masterState.atual = indice !== undefined ? Number(indice) : 0;
    
    if (masterState.fila.length > 0) {
      masterState.video = masterState.fila[masterState.atual].url;
      masterState.ativo = true;
      masterState.playing = true;
      masterState.reproduzindo = true;
      masterState.currentTime = 0;
      masterState.updatedAt = Date.now();
    }
    broadcastState("set_queue");
    return res.json({ success: true, masterState });
  }
  res.status(400).json({ success: false, erro: "Formato inválido. Envie um array." });
});

// Limpar a fila e resetar o player instantaneamente
app.delete('/api/fila', (req, res) => {
  masterState.fila = [];
  masterState.atual = 0;
  masterState.video = null;
  masterState.ativo = false;
  masterState.playing = false;
  masterState.reproduzindo = false;
  masterState.currentTime = 0;
  masterState.updatedAt = Date.now();
  broadcastState("clear_queue");
  res.json({ success: true, mensagem: "Fila limpa com sucesso!" });
});

// Forçar reprodução direta (ignora a fila momentaneamente)
app.post('/api/tocar', (req, res) => {
  const { url } = req.body;
  if (url) {
    masterState.video = url;
    masterState.ativo = true;
    masterState.playing = true;
    masterState.reproduzindo = true;
    masterState.currentTime = 0;
    masterState.updatedAt = Date.now();
    broadcastState("direct_play");
    return res.json({ success: true, url });
  }
  res.status(400).json({ success: false, erro: "URL não informada" });
});

// ==========================================
// RECPÇÃO DE COMANDOS DO CONTROLE
// ==========================================
app.post('/controle', (req, res) => {
  const acao = req.body.acao;

  if (acao) {
    // PREVENÇÃO DE LOOP: Limpa o seek anterior antes de processar nova ação
    masterState.seek = 0; 

    switch (acao) {
      case 'toggle_play':
        if (!masterState.video) break;
        masterState.playing = !masterState.playing;
        masterState.reproduzindo = masterState.playing;
        if (!masterState.playing) {
          masterState.currentTime = getCurrentPosition();
        }
        masterState.updatedAt = Date.now();
        break;

      case 'play':
        if (!masterState.video || masterState.playing) break;
        masterState.playing = true;
        masterState.reproduzindo = true;
        masterState.updatedAt = Date.now();
        break;

      case 'pause':
        if (!masterState.playing) break;
        masterState.currentTime = getCurrentPosition();
        masterState.playing = false;
        masterState.reproduzindo = false;
        masterState.updatedAt = Date.now();
        break;

      case 'stop':
      case 'clear_queue':
        masterState.video = null;
        masterState.ativo = false;
        masterState.playing = false;
        masterState.reproduzindo = false;
        masterState.currentTime = 0;
        masterState.fila = [];
        masterState.atual = 0;
        masterState.updatedAt = Date.now();
        break;

      case 'toggle_mute':
        masterState.mudo = !masterState.mudo;
        break;

      case 'volume_up':
        masterState.volume = Math.min(100, masterState.volume + 10);
        break;

      case 'volume_down':
        masterState.volume = Math.max(0, masterState.volume - 10);
        break;

      case 'seek_forward':
        // Atualiza o currentTime oficial somando 15 segundos
        masterState.currentTime = getCurrentPosition() + 15;
        masterState.updatedAt = Date.now(); // Reseta a contagem de tempo a partir de agora
        masterState.seek = 15;
        break;

      case 'seek_backward':
        // Atualiza o currentTime oficial subtraindo 15 segundos (não deixando baixar de 0)
        masterState.currentTime = Math.max(0, getCurrentPosition() - 15);
        masterState.updatedAt = Date.now(); // Reseta a contagem de tempo a partir de agora
        masterState.seek = -15;
        break;

      case 'seek_reset':
        masterState.seek = 0;
        break;


      case 'next_track':
        if (masterState.fila && masterState.fila.length > 0) {
          masterState.atual = (masterState.atual < masterState.fila.length - 1) ? masterState.atual + 1 : 0;
          masterState.video = masterState.fila[masterState.atual].url;
          masterState.currentTime = 0;
          masterState.playing = true;
          masterState.reproduzindo = true;
          masterState.updatedAt = Date.now();
        }
        break;

      case 'prev_track':
        if (masterState.fila && masterState.fila.length > 0) {
          masterState.atual = (masterState.atual > 0) ? masterState.atual - 1 : masterState.fila.length - 1;
          masterState.video = masterState.fila[masterState.atual].url;
          masterState.currentTime = 0;
          masterState.playing = true;
          masterState.reproduzindo = true;
          masterState.updatedAt = Date.now();
        }
        break;

      case 'up':
      case 'down':
      case 'left':
      case 'right':
      case 'ok':
      case 'back':
      case 'home':
        // Repassa direto via broadcast
        break;
    }

    masterState.ultimoComando = acao;
    masterState.comandoId = Date.now();
    broadcastState(acao);
  }

  res.json({ success: true, state: masterState });
});

// ==========================================
// WEBSOCKET E ROTAS ESTÁTICAS
// ==========================================
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
