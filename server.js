const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// Serve os arquivos da pasta 'public' (onde fica o player.html e o controle.html)
app.use(express.static(path.join(__dirname, "public")));

// ===================================== 
// ESTADO DO X-STREAM
// =====================================
let transmissao = {
    ativo: false,
    video: "",
    fila: [],
    atual: 0,
    reproduzindo: true,
    volume: 100,
    mudo: false,
    seek: 0, // Segundos para pular (+10 ou -10)
    ultimoComando: "",
    atualizado: Date.now()
};

// Lista de requisições da TV aguardando comandos (Long Polling)
let conexoesEsperando = [];

// Função para notificar a TV imediatamente
function notificarTV() {
    while (conexoesEsperando.length > 0) {
        const res = conexoesEsperando.shift();
        try {
            res.json(transmissao);
        } catch (e) {}
    }
}

// =====================================
// ROTAS DE NAVEGAÇÃO
// =====================================
app.get("/", (req, res) => {
    res.send("Servidor X-Stream online");
});

app.get("/player", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "player.html"));
});

// =====================================
// STATUS PARA TV (LONG POLLING INSTANTÂNEO)
// =====================================
app.get("/status", (req, res) => {
    conexoesEsperando.push(res);

    // Se nenhum comando for enviado em 8 segundos, responde para manter a conexão ativa
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
    }

    transmissao.atualizado = Date.now();
    res.json({ sucesso: true, transmissao });

    notificarTV();
});

// =====================================
// CONTROLE REMOTO COMPLETO
// =====================================
app.post("/controle", (req, res) => {
    const acao = req.body.acao;
    transmissao.ultimoComando = acao;

    switch (acao) {
        case "next":
            proximoVideo();
            break;
        case "previous":
            videoAnterior();
            break;
        case "play":
            transmissao.reproduzindo = !transmissao.reproduzindo;
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
        case "right": // Avançar 10 segundos
            transmissao.seek = 10;
            break;
        case "rw":
        case "seek_backward":
        case "left": // Voltar 10 segundos
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

    notificarTV(); // ⚡ Dispara o comando imediatamente para a TV!
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
// FUNÇÕES AUXILIARES
// =====================================
function proximoVideo() {
    if (transmissao.atual < transmissao.fila.length - 1) {
        transmissao.atual++;
        transmissao.video = transmissao.fila[transmissao.atual].url;
        transmissao.ativo = true;
        transmissao.reproduzindo = true;
    }
}

function videoAnterior() {
    if (transmissao.atual > 0) {
        transmissao.atual--;
        transmissao.video = transmissao.fila[transmissao.atual].url;
        transmissao.ativo = true;
        transmissao.reproduzindo = true;
    }
}

function limparTodaFila() {
    transmissao.fila = [];
    transmissao.video = "";
    transmissao.atual = 0;
    transmissao.ativo = false;
    transmissao.reproduzindo = false;
    transmissao.atualizado = Date.now();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("🚀 Servidor X-Stream rodando na porta", PORT);
});
