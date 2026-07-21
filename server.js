const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

// =====================================
// ESTADO X-STREAM
// COMPATÍVEL COM PLAYER E CONTROLE
// =====================================

let transmissao = {
    ativo: false,
    
    // PLAYER ANTIGO E NOVO
    video: "",
    
    // FILA NOVA
    fila: [],
    atual: 0,
    
    // CONTROLE DE PLAYER E MIDIA
    reproduzindo: true, // true = play, false = pause
    volume: 100,        // 0 a 100
    mudo: false,        // true/false
    
    // COMANDOS DE NAVEGAÇÃO D-PAD / TV (opcional para o player tratar)
    ultimoComando: "",

    atualizado: Date.now()
};

// =====================================
// HOME
// =====================================
app.get("/", (req, res) => {
    res.send("Servidor X-Stream online");
});

// =====================================
// PLAYER TV
// =====================================
app.get("/player", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "player.html"));
});

// =====================================
// ADICIONAR LINK
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

    // Primeiro link inicia automaticamente
    if (transmissao.fila.length === 1) {
        transmissao.atual = 0;
        transmissao.video = url;
        transmissao.ativo = true;
        transmissao.reproduzindo = true;
    }

    transmissao.atualizado = Date.now();
    console.log("Novo link recebido:", url);

    res.json({
        sucesso: true,
        transmissao
    });
});

// =====================================
// STATUS PARA TV E APP
// =====================================
app.get("/status", (req, res) => {
    res.json(transmissao);
});

// =====================================
// CONTROLE REMOTO COMPLETO
// TRATA TODOS OS BOTÕES DO APP ANDROID
// =====================================
app.post("/controle", (req, res) => {
    const acao = req.body.acao;
    console.log(`Comando recebido do controle: [${acao}]`);

    transmissao.ultimoComando = acao;

    switch (acao) {
        // --- NAVEGAÇÃO DE FILA ---
        case "next":
            proximoVideo();
            break;

        case "previous":
            videoAnterior();
            break;

        // --- PLAY / PAUSE ---
        case "play":
            transmissao.reproduzindo = !transmissao.reproduzindo; // Alterna Play / Pause
            break;

        // --- CONTROLE DE VOLUME ---
        case "vol_up":
            if (transmissao.volume < 100) transmissao.volume += 10;
            if (transmissao.volume > 100) transmissao.volume = 100;
            transmissao.mudo = false; // Ao mudar volume, remove o mudo
            break;

        case "vol_down":
            if (transmissao.volume > 0) transmissao.volume -= 10;
            if (transmissao.volume < 0) transmissao.volume = 0;
            break;

        case "mute":
            transmissao.mudo = !transmissao.mudo;
            break;

        // --- D-PAD / TECLAS DE NAVEGAÇÃO ---
        case "up":
        case "down":
        case "home":
        case "back":
        case "menu":
        case "info":
        case "source":
            // O comando fica registrado em 'ultimoComando' para o player.html reagir
            break;

        // --- AÇÕES ESPECIAIS ---
        case "power":
            transmissao.ativo = !transmissao.ativo;
            if (!transmissao.ativo) {
                transmissao.reproduzindo = false;
            }
            break;

        case "more":
        case "clear":
            limparTodaFila();
            break;

        default:
            console.log("Comando desconhecido:", acao);
    }

    transmissao.atualizado = Date.now();

    res.json({
        sucesso: true,
        transmissao
    });
});

// =====================================
// SELECIONAR ITEM DA FILA
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

    res.json({
        sucesso: true,
        transmissao
    });
});

// =====================================
// REMOVER LINK INDIVIDUAL
// =====================================
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

    res.json({
        sucesso: true,
        transmissao
    });
});

// =====================================
// LIMPAR TODA A FILA
// =====================================
app.post("/limpar", (req, res) => {
    limparTodaFila();

    res.json({
        sucesso: true,
        transmissao
    });
});

// =====================================
// OBTER FILA ATUAL
// =====================================
app.get("/fila", (req, res) => {
    res.json({
        fila: transmissao.fila,
        atual: transmissao.atual
    });
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

// =====================================
// START SERVER
// =====================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🚀 Servidor X-Stream rodando na porta", PORT);
});
