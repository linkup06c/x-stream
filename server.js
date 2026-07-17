const express = require("express");
const cors = require("cors");
const path = require("path");


const app = express();


app.use(cors());

app.use(express.json());


app.use(
    express.static(
        path.join(__dirname,"public")
    )
);



// =====================================
// ESTADO GLOBAL X-STREAM
// COMPATÍVEL COM PLAYER ANTIGO
// =====================================


let transmissao = {


    ativo:false,


    // COMPATIBILIDADE PLAYER ANTIGO

    video:"",



    // FILA NOVA

    fila:[],


    atual:0,



    // ESTADO GLOBAL

    estado:"paused",


    posicao:0,


    volume:1,


    comando:"",


    atualizado:Date.now()


};






// =====================================
// HOME
// =====================================


app.get("/",(req,res)=>{


    res.send(
        "Servidor X-Stream V3 online"
    );


});






// =====================================
// PLAYER
// =====================================


app.get("/player",(req,res)=>{


    res.sendFile(

        path.join(
            __dirname,
            "public",
            "player.html"
        )

    );


});







// =====================================
// ENVIAR NOVO VÍDEO
// =====================================


app.post("/enviar",(req,res)=>{


    const url=req.body.url;



    if(!url){


        return res.json({

            erro:
            "URL não enviada"

        });


    }




    transmissao.fila.push({

        url:url

    });




    transmissao.ativo=true;




    // PRIMEIRO VÍDEO

    if(
        transmissao.fila.length===1
    ){


        transmissao.atual=0;


        transmissao.video=url;


        transmissao.estado="playing";


    }





    transmissao.comando="novo";


    transmissao.atualizado=
    Date.now();




    console.log(
        "Nova mídia:",
        url
    );




    res.json({

        sucesso:true,


        transmissao

    });



});


// =====================================
// STATUS GLOBAL
// PLAYER E CENTRAL USAM AQUI
// =====================================


app.get("/status",(req,res)=>{


    res.json(transmissao);


});








// =====================================
// CONTROLE GLOBAL
// PLAY / PAUSE / SEEK / NEXT
// =====================================


app.post("/controle",(req,res)=>{


    const acao =
    req.body.acao;



    switch(acao){



        // =========================
        // PLAY
        // =========================


        case "play":


            transmissao.estado =
            "playing";


        break;





        // =========================
        // PAUSE
        // =========================


        case "pause":


            transmissao.estado =
            "paused";



            if(
                req.body.valor !== undefined
            ){


                transmissao.posicao =
                Number(
                    req.body.valor
                );


            }


        break;





        // =========================
        // ALTERAR TEMPO
        // =========================


        case "seek":



            if(
                req.body.valor !== undefined
            ){


                transmissao.posicao =
                Number(
                    req.body.valor
                );


            }


        break;





        // =========================
        // PRÓXIMO VÍDEO
        // =========================


        case "next":


            proximoVideo();


        break;






        // =========================
        // VÍDEO ANTERIOR
        // =========================


        case "previous":


            videoAnterior();


        break;





        // =========================
        // VOLUME
        // =========================


        case "volume":


            transmissao.volume =
            Number(
                req.body.valor
            );


        break;



    }




    transmissao.comando =
    acao;



    transmissao.atualizado =
    Date.now();




    res.json({

        sucesso:true,

        transmissao

    });



});








// =====================================
// ATUALIZAR POSIÇÃO AUTOMÁTICA
// PLAYER ENVIA TEMPO ATUAL
// =====================================


app.post("/atualizar-posicao",(req,res)=>{


    if(
        req.body.posicao !== undefined
    ){


        transmissao.posicao =
        Number(
            req.body.posicao
        );


    }




    transmissao.atualizado =
    Date.now();



    res.json({

        sucesso:true

    });



});








// =====================================
// PRÓXIMO DA FILA
// =====================================


function proximoVideo(){



    if(
        transmissao.atual <
        transmissao.fila.length - 1
    ){


        transmissao.atual++;



        transmissao.video =

        transmissao.fila[
            transmissao.atual
        ].url;



        transmissao.posicao=0;



        transmissao.estado="playing";



    }



}








// =====================================
// VÍDEO ANTERIOR
// =====================================


function videoAnterior(){



    if(
        transmissao.atual > 0
    ){


        transmissao.atual--;



        transmissao.video =

        transmissao.fila[
            transmissao.atual
        ].url;



        transmissao.posicao=0;



        transmissao.estado="playing";



    }



}



// =====================================
// LIMPAR FILA
// =====================================


app.post("/limpar",(req,res)=>{


    transmissao.fila=[];


    transmissao.atual=0;


    transmissao.video="";


    transmissao.ativo=false;


    transmissao.estado="paused";


    transmissao.posicao=0;


    transmissao.comando="limpar";


    transmissao.atualizado=
    Date.now();




    res.json({

        sucesso:true,

        transmissao

    });



});







// =====================================
// VER FILA
// =====================================


app.get("/fila",(req,res)=>{


    res.json({

        fila:
        transmissao.fila,


        atual:
        transmissao.atual


    });



});








// =====================================
// REMOVER ITEM DA FILA
// =====================================


app.post("/remover",(req,res)=>{


    const index =
    Number(req.body.index);




    if(
        transmissao.fila[index]
    ){


        transmissao.fila.splice(
            index,
            1
        );



        if(
            transmissao.atual >=
            transmissao.fila.length
        ){


            transmissao.atual =
            transmissao.fila.length-1;


        }



        if(
            transmissao.atual >=0 &&
            transmissao.fila.length
        ){


            transmissao.video =
            transmissao.fila[
                transmissao.atual
            ].url;


        }



    }





    transmissao.atualizado=
    Date.now();



    res.json({

        sucesso:true,

        transmissao

    });



});








// =====================================
// VÍDEO TERMINOU
// PLAYER CHAMA ESSA ROTA
// =====================================


app.post("/terminou",(req,res)=>{


    proximoVideo();



    transmissao.comando =
    "next";


    transmissao.atualizado =
    Date.now();




    res.json({

        sucesso:true,

        transmissao

    });



});








// =====================================
// STATUS SIMPLES DO SERVIDOR
// =====================================


app.get("/health",(req,res)=>{


    res.json({

        online:true,

        nome:"X-Stream V3"


    });



});








// =====================================
// INICIAR SERVIDOR
// =====================================


const PORT =

process.env.PORT || 3000;




app.listen(PORT,()=>{


    console.log(
        "X-Stream V3 rodando na porta",
        PORT
    );


});