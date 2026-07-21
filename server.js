const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// =========================================================
// ESTADO MESTRE DA TRANSMISSÃO (O "Coração" que não para)
// =========================================================
let masterState = {
  video: null,          // URL da mídia atual
  playing: false,       // Está rodando ou pausado?
  position: 0,          // Posição salva em segundos
  lastUpdated: Date.now() // Timestamp da última alteração de estado
};

/**
 * Calcula em qual segundo o vídeo está NESTE EXATO MILISSEGUNDO,
 * baseado no relógio interno do servidor.
 */
function getCurrentPosition() {
  if (!masterState.playing || !masterState.video) {
    return masterState.position;
  }
  const elapsedSeconds = (Date.now() - masterState.lastUpdated) / 1000;
  return masterState.position + elapsedSeconds;
}

/**
 * Envia o estado mestre atualizado para TODOS os dispositivos conectados.
 */
function broadcastState() {
  const currentPos = getCurrentPosition();
  const payload = JSON.stringify({
    tipo: "sync-transmission",
    video: masterState.video,
    currentTime: currentPos,
    playing: masterState.playing,
    updatedAt: Date.now()
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// =========================================================
// GERENCIADOR WEBSOCKET (CONEXÕES EM TEMPO REAL)
// =========================================================
wss.on('connection', (ws) => {
  console.log('📺 Novo dispositivo sintonizou na transmissão.');

  // Assim que o dispositivo conecta, o servidor manda O PONTO EXATO da live
  ws.send(JSON.stringify({
    tipo: "sync-transmission",
    video: masterState.video,
    currentTime: getCurrentPosition(),
    playing: masterState.playing,
    updatedAt: Date.now()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Dispositivo pediu sincronização explícita
      if (data.tipo === 'sync-request') {
        ws.send(JSON.stringify({
          tipo: "sync-transmission",
          video: masterState.video,
          currentTime: getCurrentPosition(),
          playing: masterState.playing,
          updatedAt: Date.now()
        }));
        return;
      }

      // Nova Mídia enviada por qualquer dispositivo
      if (data.tipo === 'midia' && data.url) {
        masterState.video = data.url;
        masterState.playing = true;
        masterState.position = 0;
        masterState.lastUpdated = Date.now();
        console.log(' Nova mídia iniciada no servidor:', data.url);
        broadcastState();
        return;
      }

      // Comandos do Controle Remoto
      const acao = data.acao || data.type;
      if (acao) {
        console.log('Comando recebido no servidor:', acao);

        switch (acao) {
          case 'play':
          case 'resume':
          case 'resume-video':
            if (!masterState.playing) {
              masterState.playing = true;
              masterState.lastUpdated = Date.now();
            }
            break;

          case 'pause':
          case 'pause-video':
            if (masterState.playing) {
              masterState.position = getCurrentPosition(); // Congela o tempo onde parou
              masterState.playing = false;
              masterState.lastUpdated = Date.now();
            }
            break;

          case 'stop':
          case 'clear':
          case 'back-to-standby':
          case 'power':
            masterState.video = null;
            masterState.playing = false;
            masterState.position = 0;
            masterState.lastUpdated = Date.now();
            break;

          case 'seek':
          case 'seek-video':
            if (data.time !== undefined) {
              masterState.position = Number(data.time);
              masterState.lastUpdated = Date.now();
            }
            break;
        }

        // Transmite o novo estado para todos os players sintonizados
        broadcastState();
      }
    } catch (err) {
      console.error("Erro ao processar mensagem WebSocket:", err);
    }
  });

  ws.on('close', () => {
    console.log('Dispositivo desconectou (a transmissão continua rodando no servidor).');
  });
});

// =========================================================
// ROTAS HTTP (COMPATIBILIDADE COM O APP ANDROID)
// =========================================================
app.post('/enviar', (req, res) => {
  const url = req.body.url;
  if (url) {
    masterState.video = url;
    masterState.playing = true;
    masterState.position = 0;
    masterState.lastUpdated = Date.now();
    broadcastState();
  }
  res.json({ success: true, state: masterState });
});

app.post('/controle', (req, res) => {
  const acao = req.body.acao;
  if (acao) {
    if (acao === 'play' || acao === 'resume') {
      masterState.playing = true;
      masterState.lastUpdated = Date.now();
    } else if (acao === 'pause') {
      masterState.position = getCurrentPosition();
      masterState.playing = false;
      masterState.lastUpdated = Date.now();
    } else if (acao === 'stop' || acao === 'power') {
      masterState.video = null;
      masterState.playing = false;
      masterState.position = 0;
      masterState.lastUpdated = Date.now();
    }
    broadcastState();
  }
  res.json({ success: true, state: masterState });
});

app.get('/', (req, res) => {
  res.send('Servidor X-Stream Live rodando com sucesso!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor X-Stream rodando na porta ${PORT}`);
});
