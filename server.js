const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

/* SERVE A PASTA public */
app.use(express.static(path.join(__dirname, "public")));

let transmissao = {
    ativo: false,
    video: "",
    iniciado: 0
};

app.get("/", (req, res) => {
    res.send("Servidor X-Stream online");
});

/* PLAYER DA TV */
app.get("/player", function(req, res){
    res.sendFile(path.join(__dirname, "public", "player.html"));
});

app.post("/enviar", (req, res) => {

    const url = req.body.url;

    if (!url) {
        return res.json({
            erro: "URL não enviada"
        });
    }

    transmissao = {
        ativo: true,
        video: url,
        iniciado: Date.now()
    };

    console.log("Nova transmissão:", url);

    res.json({
        sucesso: true,
        transmissao
    });

});

app.get("/status", (req, res) => {
    res.json(transmissao);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log("Servidor rodando na porta:", PORT);

});