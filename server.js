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
// ESTADO X-STREAM SIMPLE V4
// =====================================


let transmissao = {

    ativo:false,

    fila:[],

    atual:0,

    atualizado:Date.now()

};




// =====================================
// HOME
// =====================================


app.get("/",(req,res)=>{


    res.send(
        "X-Stream Simple V4 online"
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
// STATUS
// =====================================


app.get("/status",(req,res)=>{


    res.json(transmissao);


});




// =====================================
// ADICIONAR LINK
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

        url:url,

        nome:
        "Link " + 
        (transmissao.fila.length + 1)

    });





    transmissao.ativo=true;



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
// PRÓXIMO VÍDEO
// =====================================


app.post("/next",(req,res)=>{


    proximo();



    res.json({

        sucesso:true,

        transmissao

    });



});





function proximo(){


    if(
        transmissao.atual <
        transmissao.fila.length - 1
    ){


        transmissao.atual++;


    }else{


        // chegou no final

        transmissao.atual=0;


    }



    transmissao.atualizado =
    Date.now();



}






// =====================================
// VÍDEO ANTERIOR
// =====================================


app.post("/previous",(req,res)=>{


    anterior();



    res.json({

        sucesso:true,

        transmissao

    });



});





function anterior(){



    if(
        transmissao.atual > 0
    ){


        transmissao.atual--;


    }



    transmissao.atualizado =
    Date.now();


}






// =====================================
// REMOVER ITEM
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
            transmissao.fila.length - 1;


        }



        if(
            transmissao.fila.length===0
        ){


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
// LIMPAR TUDO
// =====================================


app.post("/limpar",(req,res)=>{


    transmissao = {


        ativo:false,


        fila:[],


        atual:0,


        atualizado:Date.now()


    };



    res.json({

        sucesso:true,

        transmissao

    });



});






// =====================================
// QUANDO PLAYER TERMINA
// =====================================


app.post("/terminou",(req,res)=>{


    proximo();



    res.json({

        sucesso:true,

        transmissao

    });



});







// =====================================
// SERVIDOR
// =====================================


const PORT =
process.env.PORT || 3000;



app.listen(PORT,()=>{


    console.log(
        "X-Stream Simple V4 rodando:",
        PORT
    );


});