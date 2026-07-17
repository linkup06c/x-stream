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
// ESTADO GLOBAL X-STREAM V4
// =====================================


let transmissao = {


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
        "Servidor X-Stream V4 online"
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
// RECEBER NOVA URL
// =====================================


app.post("/enviar",(req,res)=>{


    const url =
    req.body.url;



    if(!url){


        return res.json({

            sucesso:false,

            erro:"URL vazia"

        });


    }






    transmissao.fila.push({

        url:url

    });







    transmissao.ativo=true;




    if(
    transmissao.fila.length === 1
    ){


        transmissao.atual=0;


        transmissao.posicao=0;


    }





    transmissao.estado="playing";


    transmissao.comando="novo";


    transmissao.atualizado =
    Date.now();






    console.log(
        "Nova URL:",
        url
    );







    res.json({

        sucesso:true,

        transmissao

    });



});








// =====================================
// STATUS GLOBAL
// =====================================


app.get("/status",(req,res)=>{


    res.json(

        transmissao

    );


});








// =====================================
// RECEBER POSIÇÃO REAL DO PLAYER
// =====================================


app.post("/atualizar-posicao",(req,res)=>{


    let posicao =
    Number(req.body.posicao);



    if(
    !isNaN(posicao)
    ){


        transmissao.posicao =
        posicao;


        transmissao.atualizado =
        Date.now();


    }





    res.json({

        sucesso:true,

        posicao:
        transmissao.posicao

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


            transmissao.estado =
            "playing";


        break;






        case "pause":


            transmissao.estado =
            "paused";



            if(
            req.body.valor !== undefined
            ){


                transmissao.posicao =
                Number(req.body.valor);


            }



        break;







        case "seek":



            transmissao.posicao =
            Number(req.body.valor);



        break;







        case "next":


            proximo();


        break;







        case "previous":


            anterior();


        break;






        case "volume":



            transmissao.volume =
            Number(req.body.valor);



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
// PRÓXIMO VÍDEO
// =====================================


function proximo(){



    if(
    transmissao.atual <
    transmissao.fila.length-1
    ){


        transmissao.atual++;


    }



    transmissao.posicao=0;



}








// =====================================
// ANTERIOR
// =====================================


function anterior(){



    if(
    transmissao.atual > 0
    ){


        transmissao.atual--;


    }



    transmissao.posicao=0;



}









// =====================================
// LIMPAR FILA
// =====================================


app.post("/limpar",(req,res)=>{


    transmissao.fila=[];


    transmissao.atual=0;


    transmissao.ativo=false;


    transmissao.estado="paused";


    transmissao.posicao=0;


    transmissao.comando="limpar";



    transmissao.atualizado =
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
        transmissao.fila,


        atual:
        transmissao.atual

    });



});








const PORT =
process.env.PORT || 3000;



app.listen(PORT,()=>{


console.log(

"X-Stream V4 rodando na porta",

PORT

);


});
