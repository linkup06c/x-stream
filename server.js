const express = require("express");
const http = require("http");
const { Server } = require("ws");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

app.use(cors());
app.use(express.json());

// Serve os arquivos da pasta 'public'
app.use(express.static(path.join(__dirname, "public")));

// =====================================
// ESTADO UNIFICADO DO X-STREAM
// =====================================
let transmissao = {
    ativo: false,
    video: "",
    fila: [],
    atual: 0,
    reproduzindo: true,
    volume: 100,
    mudo: false,
    seek: 0,
    currentTime: 0,     // Tempo exato para sincronia em tempo real
    updatedAt: Date.now(),
    ultimoComando: "",
    atualizado: Date.now()
};

// Lista de requisições da TV aguardando comandos (Long Polling)
let conexoesEsperando = [];

// Função para notificar a TV via Long Polling imediatamente
function notificarTV() {
    while (conexoesEsperando.length > 0) {
        const res = conexoesEsperando.shift();
        try {
            res.json(transmissao);
        } catch (e) {}
    }
    
    // Notifica também todos os clientes via WebSocket (para o outro player em tempo real)
    broadcast({
        tipo: 'sync-state',
        ...transmissao
    });
}

function obterTempoAtual() {
    if (!transmissao.reproduzindo) {
        return transmissao.currentTime;
    }
    const segundosDecorridos = (Date.now() - transmissao.updatedAt) / 1000;
    return transmissao.currentTime + segundosDecorridos;
}

// =====================================
// ROTAS DE NAVEGAÇÃO
// =====================================
app.get("/", (req, res) => {
    res.send("Servidor X-Stream unificado online");
});

app.get("/player", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "player.html"));
});

// =====================================
// STATUS PARA TV (LONG POLLING INSTANTÂNEO)
// =====================================
app.get("/status", (req, res) => {
    conexoesEsperando.push(res);

    req.setTimeout(8000, () => {
        const index = conexoesEsperando.indexOf(res);
        if (index !== -1) {
            conexoesEsperando.splice(index, 1);
            try {
                res.json(transmissao);
            } catch (e) {}
        }
    });
});

// =====================================
// ADICIONAR VÍDEO À FILA
// =====================================
app.post("/enviar", (req, res) => {
    const url = req.body.url;

    if (!url) {
        return res.status(400).json({ erro: "URL não enviada" });
    }

    const item = {
        url: url,
        nome: "Link " + (transmissao.fila.length + 1)
    };

    transmissao.fila.push(item);

    if (transmissao.fila.length === 1) {
        transmissao.atual = 0;
        transmissao.video = url;
        transmissao.ativo = true;
        transmissao.reproduzindo = true;
        transmissao.currentTime = 0;
        transmissao.updatedAt = Date.now();
    }

    transmissao.atualizado = Date.now();
    res.json({ sucesso: true, transmissao });

    notificarTV();
});

// =====================================
// CONTROLE REMOTO COMPLETO (100% DOS BOTÕES)
// =====================================
app.post("/controle", (req, res) => {
    const acao = req.body.acao;
    const tempoCliente = req.body.time;
    
    transmissao.ultimoComando = acao;

    // Atualiza o tempo base antes de modificar o estado de reprodução
    if (acao === 'play' || acao === 'pause' || acao === 'resume' || acao === 'seek') {
        transmissao.currentTime = tempoCliente !== undefined ? Number(tempoCliente) : obterTempoAtual();
        transmissao.updatedAt = Date.now();
    }

    switch (acao) {
        case "next":
            proximoVideo();
            break;
        case "previous":
            videoAnterior();
            break;
        case "play":
            // Alterna o estado reproduzindo
            transmissao.reproduzindo = !transmissao.reproduzindo;
            break;
        case "resume":
            transmissao.reproduzindo = true;
            break;
        case "pause":
            transmissao.reproduzindo = false;
            break;
        case "vol_up":
            if (transmissao.volume < 100) transmissao.volume += 10;
            if (transmissao.volume > 100) transmissao.volume = 100;
            transmissao.mudo = false;
            break;
        case "vol_down":
            if (transmissao.volume > 0) transmissao.volume -= 10;
            if (transmissao.volume < 0) transmissao.volume = 0;
            break;
        case "mute":
            transmissao.mudo = !transmissao.mudo;
            break;
        case "ff":
        case "seek_forward":
        case "right":
            transmissao.seek = 10;
            break;
        case "rw":
        case "seek_backward":
        case "left":
            transmissao.seek = -10;
            break;
        case "zerar_seek":
            transmissao.seek = 0;
            break;
        case "power":
            transmissao.ativo = !transmissao.ativo;
            if (!transmissao.ativo) transmissao.reproduzindo = false;
            break;
        case "clear":
            limparTodaFila();
            break;
    }

    transmissao.atualizado = Date.now();
    res.json({ sucesso: true, transmissao });

    notificarTV(); 
});

// =====================================
// GERENCIAMENTO DA FILA
// =====================================
app.post("/selecionar", (req, res) => {
    const index = Number(req.body.index);
    if (transmissao.fila[index]) {
        transmissao.atual = index;
        transmissao.video = transmissao.fila[index].url;
        transmissao.ativo = true;
        transmissao.reproduzindo = true;
        transmissao.currentTime = 0;
        transmissao.updatedAt = Date.now();
    }
    transmissao.atualizado = Date.now();
    res.json({ sucesso: true, transmissao });
    notificarTV();
});

app.post("/remover", (req, res) => {
    const index = Number(req.body.index);
    if (transmissao.fila[index]) {
        transmissao.fila.splice(index, 1);
        if (transmissao.atual >= transmissao.fila.length) {
            transmissao.atual = transmissao.fila.length - 1;
        }
        if (transmissao.fila.length > 0) {
            transmissao.video = transmissao.fila[transmissao.atual].url;
        } else {
            transmissao.video = "";
            transmissao.ativo = false;
            transmissao.atual = 0;
            transmissao.reproduzindo = false;
        }
    }
    transmissao.atualizado = Date.now();
    res.json({ sucesso: true, transmissao });
    notificarTV();
});

app.post("/limpar", (req, res) => {
    limparTodaFila();
    res.json({ sucesso: true, transmissao });
    notificarTV();
});

app.get("/fila", (req, res) => {
    res.json({ fila: transmissao.fila, atual: transmissao.atual });
});

// =====================================
// WEBSOCKET PARA O SEGUNDO PLAYER (TEMPO REAL ABSOLUTO)
// =====================================
wss.on('connection', (ws) => {
    // Envia o estado atual imediatamente para o player que conectar
    ws.send(JSON.stringify({
        tipo: 'init-state',
        ...transmissao,
        currentTimeCalculado: obterTempoAtual()
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.acao) {
                // Se o player enviar comando via WS, repassa para o estado global
                transmissao.ultimoComando = data.acao;
                if (data.currentTime !== undefined) {
                    transmissao.currentTime = Number(data.currentTime);
                    transmissao.updatedAt = Date.now();
                }
                notificarTV();
            }
        } catch (e) {}
    });
});

// Pulso de sincronia global (Tick) a cada 3 segundos para eliminar qualquer drift entre os players
setInterval(() => {
    if (transmissao.ativo && transmissao.reproduzindo) {
        broadcast({
            tipo: 'sync-tick',
            currentTime: obterTempoAtual(),
            updatedAt: Date.now()
        });
    }
}, 3000);

function broadcast(data) {
    const payload = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(payload);
        }
    });
}

// =====================================
// FUNÇÕES AUXILIARES
// =====================================
function proximoVideo() {
    if (transmissao.atual < transmissao.fila.length - 1) {
        transmissao.atual++;
        transmissao.video = transmissao.fila[transmissao.atual].url;
        transmissao.ativo = true;
        transmissao.reproduzindo = true;
        transmissao.currentTime = 0;
        transmissao.updatedAt = Date.now();
    }
}

function videoAnterior() {
    if (transmissao.atual > 0) {
        transmissao.atual--;
        transmissao.video = transmissao.fila[transmissao.atual].url;
        transmissao.ativo = true;
        transmissao.reproduzindo = true;
        transmissao.currentTime = 0;
        transmissao.updatedAt = Date.now();
    }
}

function limparTodaFila() {
    transmissao.fila = [];
    transmissao.video = "";
    transmissao.atual = 0;
    transmissao.ativo = false;
    transmissao.reproduzindo = false;
    transmissao.currentTime = 0;
    transmissao.updatedAt = Date.now();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("🚀 Servidor unificado X-Stream rodando na porta", PORT);
});
