const readline = require('readline');

// Configura a interface interativa do terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const SUI_NODE = 'https://fullnode.mainnet.sui.io';

// Função auxiliar para fazer as requisições
async function fetchSui(method, params) {
    const response = await fetch(SUI_NODE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: method,
            params: params
        })
    });
    return response.json();
}

// Lógica principal
async function main(poolId) {
    try {
        console.log(`\nBuscando dados para o ID: ${poolId}...`);
        
        // Passo 1: Pegar o getObject para extrair a transação anterior
        const objectData = await fetchSui('sui_getObject', [
            poolId, 
            { showType: true, showContent: true, showPreviousTransaction: true }
        ]);

        const tx = objectData.result?.data?.previousTransaction;

        if (!tx) {
            console.error("Não foi possível encontrar a transação anterior para este ID.");
            return;
        }

        console.log(`TX encontrada: ${tx}`);
        console.log("Buscando timestamp do bloco...");

        // Passo 2: Buscar o bloco da transação usando o hash obtido
        const txData = await fetchSui('sui_getTransactionBlock', [
            tx, 
            { showInput: false, showEffects: false, showEvents: false }
        ]);

        const timestampMs = txData.result?.timestampMs;

        if (!timestampMs) {
            console.error("Não foi possível encontrar o timestamp para esta transação.");
            return;
        }

        // Resultado Final
        console.log("\n========================================");
        console.log(`Hash da TX:   ${tx}`);
        console.log(`Timestamp Ms: ${timestampMs}`);
        console.log(`Data/Hora:    ${new Date(parseInt(timestampMs)).toLocaleString()}`);
        console.log("========================================\n");

    } catch (error) {
        console.error("Ocorreu um erro durante a execução:", error.message);
    }
}

// Aqui é onde o script pausa e pede a sua entrada
rl.question('Cole aqui o ID da Position/Pool e aperte Enter: ', (answer) => {
    const poolId = answer.trim(); // Remove espaços em branco acidentais
    
    if (!poolId) {
        console.log("Você não digitou nenhum ID. Encerrando.");
        rl.close();
        return;
    }

    // Executa a busca e fecha a interface do terminal quando terminar
    main(poolId).finally(() => {
        rl.close();
    });
});