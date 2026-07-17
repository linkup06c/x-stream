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
// ESTADO GLOBAL X-STREAM V5
// =====================================


let estado = {

    ativo:false,

    fila:[],

    atual:0,

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
        "X-Stream V5 Online"
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
// ADICIONAR URL
// =====================================


app.post("/enviar",(req,res)=>{


    const url =
    req.body.url;



    if(!url){


        return res.json({

            sucesso:false,

            erro:"URL não enviada"

        });


    }




    estado.fila.push({

        url:url

    });




    estado.ativo=true;



    if(
        estado.fila.length === 1
    ){


        estado.atual=0;

        estado.posicao=0;


    }




    estado.estado="playing";


    estado.comando="novo";


    estado.atualizado =
    Date.now();





    console.log(
        "Nova URL:",
        url
    );





    res.json({

        sucesso:true,

        estado

    });



});







// =====================================
// STATUS PARA PLAYERS
// =====================================


app.get("/status",(req,res)=>{


    res.json(

        estado

    );


});







// =====================================
// ATUALIZAR TEMPO REAL DO PLAYER
// =====================================


app.post("/atualizar-posicao",(req,res)=>{


    let posicao =
    Number(req.body.posicao);



    if(
        !isNaN(posicao)
    ){


        estado.posicao =
        posicao;


        estado.atualizado =
        Date.now();


    }




    res.json({

        sucesso:true

    });



});








// =====================================
// CONTROLES GLOBAIS
// =====================================


app.post("/controle",(req,res)=>{


    const acao =
    req.body.acao;



    switch(acao){



        case "play":


            estado.estado =
            "playing";


        break;





        case "pause":


            estado.estado =
            "paused";



            if(
            req.body.valor !== undefined
            ){


                estado.posicao =
                Number(req.body.valor);


            }



        break;





        case "seek":



            estado.posicao =
            Number(req.body.valor);



        break;






        case "next":


            proximo();


        break;






        case "previous":


            anterior();


        break;





        case "volume":


            estado.volume =
            Number(req.body.valor);


        break;



    }




    estado.comando =
    acao;



    estado.atualizado =
    Date.now();






    res.json({

        sucesso:true,

        estado

    });



});








// =====================================
// PRÓXIMO
// =====================================


function proximo(){



    if(
    estado.atual <
    estado.fila.length-1
    ){


        estado.atual++;


    }



    estado.posicao=0;



}








// =====================================
// ANTERIOR
// =====================================


function anterior(){



    if(
    estado.atual>0
    ){


        estado.atual--;


    }



    estado.posicao=0;



}








// =====================================
// LIMPAR
// =====================================


app.post("/limpar",(req,res)=>{


    estado.fila=[];


    estado.atual=0;


    estado.ativo=false;


    estado.estado="paused";


    estado.posicao=0;


    estado.comando="limpar";


    estado.atualizado =
    Date.now();




    res.json({

        sucesso:true

    });



});








// =====================================
// FILA
// =====================================


app.get("/fila",(req,res)=>{


    res.json({

        fila:
        estado.fila,


        atual:
        estado.atual


    });



});







// =====================================
// SERVIDOR
// =====================================


const PORT =
process.env.PORT || 3000;



app.listen(PORT,()=>{


console.log(

"X-Stream V5 rodando na porta",

PORT

);


});