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
// ESTADO GLOBAL X-STREAM V3
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
// ENVIAR NOVA URL
// =====================================


app.post("/enviar",(req,res)=>{


    const url =
    req.body.url;



    if(!url){


        return res.json({

            sucesso:false,

            erro:
            "URL não enviada"

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


    }





    transmissao.estado="playing";


    transmissao.posicao=0;


    transmissao.comando="novo";


    transmissao.atualizado =
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
// =====================================


app.get("/status",(req,res)=>{


    res.json(

        transmissao

    );


});







// =====================================
// CONTROLE GLOBAL
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



            proximoVideo();



        break;





        case "previous":



            videoAnterior();



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


function proximoVideo(){



    if(
    transmissao.atual <
    transmissao.fila.length - 1
    ){


        transmissao.atual++;


    }



    transmissao.posicao=0;



}








// =====================================
// VÍDEO ANTERIOR
// =====================================


function videoAnterior(){



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

        sucesso:true,

        transmissao

    });



});







// =====================================
// REMOVER ITEM DA FILA
// =====================================


app.post("/remover",(req,res)=>{


    const index =
    Number(req.body.index);




    if(
    index >=0 &&
    index < transmissao.fila.length
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
            Math.max(
                0,
                transmissao.fila.length-1
            );


        }



    }




    if(
    transmissao.fila.length===0
    ){


        transmissao.ativo=false;


    }




    transmissao.comando="remover";


    transmissao.atualizado =
    Date.now();





    res.json({

        sucesso:true,

        transmissao

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







// =====================================
// SERVIDOR
// =====================================


const PORT =
process.env.PORT || 3000;




app.listen(PORT,()=>{


console.log(

"X-Stream V3 rodando na porta",

PORT

);


});

