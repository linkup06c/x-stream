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
// ESTADO X-STREAM
// COMPATÍVEL COM PLAYER ANTIGO
// =====================================


let transmissao = {


    ativo:false,


    // PLAYER ANTIGO USA ISSO

    video:"",



    // FILA NOVA

    fila:[],


    atual:0,



    atualizado:Date.now()


};








// =====================================
// HOME
// =====================================


app.get("/",(req,res)=>{


    res.send(
        "Servidor X-Stream online"
    );


});








// =====================================
// PLAYER TV
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
// ADICIONAR LINK
// =====================================


app.post("/enviar",(req,res)=>{


    const url =
    req.body.url;



    if(!url){


        return res.json({

            erro:
            "URL não enviada"

        });


    }




    const item = {


        url:url,


        nome:
        "Link "+
        (transmissao.fila.length+1)


    };




    transmissao.fila.push(item);





    // primeiro link inicia

    if(
        transmissao.fila.length === 1
    ){


        transmissao.atual=0;


        transmissao.video=url;


        transmissao.ativo=true;


    }




    transmissao.atualizado =
    Date.now();





    console.log(
        "Novo link:",
        url
    );





    res.json({

        sucesso:true,

        transmissao

    });



});









// =====================================
// STATUS PARA TV
// =====================================


app.get("/status",(req,res)=>{


    res.json(transmissao);


});









// =====================================
// CONTROLE
// PLAY / NEXT / PREVIOUS
// =====================================


app.post("/controle",(req,res)=>{


    const acao =
    req.body.acao;



    switch(acao){



        case "next":


            proximoVideo();


        break;




        case "previous":


           videoAnterior();


        break;



    }





    transmissao.atualizado =
    Date.now();




    res.json({

        sucesso:true,

        transmissao

    });



});









// =====================================
// SELECIONAR ITEM DA FILA
// =====================================


app.post("/selecionar",(req,res)=>{


    const index =
    Number(req.body.index);




    if(
        transmissao.fila[index]
    ){


        transmissao.atual=index;



        transmissao.video =
        transmissao.fila[index].url;



        transmissao.ativo=true;



    }





    transmissao.atualizado =
    Date.now();




    res.json({

        sucesso:true,

        transmissao

    });



});









// =====================================
// PRÓXIMO
// =====================================


function proximoVideo(){



    if(

        transmissao.atual <
        transmissao.fila.length-1

    ){



        transmissao.atual++;



        transmissao.video =

        transmissao.fila[
            transmissao.atual
        ].url;



        transmissao.ativo=true;



    }



}









// =====================================
// ANTERIOR
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



        transmissao.ativo=true;



    }



}









// =====================================
// REMOVER LINK
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
            transmissao.fila.length > 0
        ){


            transmissao.video =

            transmissao.fila[
                transmissao.atual
            ].url;



        }else{


            transmissao.video="";

            transmissao.ativo=false;

            transmissao.atual=0;


        }



    }





    transmissao.atualizado =
    Date.now();




    res.json({

        sucesso:true,

        transmissao

    });



});









// =====================================
// LIMPAR TODA FILA
// =====================================


app.post("/limpar",(req,res)=>{


    transmissao.fila=[];


    transmissao.video="";


    transmissao.atual=0;


    transmissao.ativo=false;


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

"X-Stream rodando na porta",

PORT

);


});