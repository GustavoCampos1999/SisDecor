function ARREDONDAR_PARA_CIMA(num) {
  return Math.ceil(num);
}

function calcularOrcamento(dados) {

  const largura = parseFloat(dados.largura) || 0;
  const altura = parseFloat(dados.altura) || 0;
  const franzCortina = parseFloat(dados.franzCortina) || 0;
  const tecidoCortinaLargura = parseFloat(dados.tecidoCortina?.largura) || 0;
  const tecidoCortinaPreco = parseFloat(dados.tecidoCortina?.preco) || 0;
  const tecidoForroLargura = parseFloat(dados.tecidoForro?.largura) || 0;
  const tecidoForroPreco = parseFloat(dados.tecidoForro?.preco) || 0;
  const franzBlackout = parseFloat(dados.franzBlackout) || 0;
  const tecidoBlackoutLargura = parseFloat(dados.tecidoBlackout?.largura) || 0;
  const tecidoBlackoutPreco = parseFloat(dados.tecidoBlackout?.preco) || 0;
  
  const valorUnitarioConfecao = parseFloat(dados.valorConfecao) || 0;
  const valorUnitarioTrilho = parseFloat(dados.valorTrilho) || 0;
  
  const valorInstalacao = parseFloat(dados.valorInstalacao) || 0;
  const valorFrete = parseFloat(dados.valorFrete) || 0;
  const valorOutros = parseFloat(dados.valorOutros) || 0;

  const mb = parseFloat(dados.markupBase);
  const markup_Base = isNaN(mb) ? 1.0 : mb;
  const fatorMarkupTotal = 1 + markup_Base;
  
  let R = 0; 
  if (largura > 0 && altura > 0 && tecidoCortinaLargura > 0) {
    if (tecidoCortinaLargura - altura < 0.15) { 
        R = ARREDONDAR_PARA_CIMA(largura * franzCortina / tecidoCortinaLargura) * (altura + 0.2); 
    }
    else { R = largura * franzCortina; }
  }
  let Z = 0; 
  if (largura > 0 && altura > 0 && tecidoForroLargura > 0) {
    if (tecidoForroLargura - altura < 0.15) { Z = ARREDONDAR_PARA_CIMA(largura * franzCortina / tecidoForroLargura) * (altura + 0.2); }
    else { Z = largura * franzCortina; }
  }
  let AK = 0;
  if (largura > 0 && altura > 0 && tecidoBlackoutLargura > 0) {
    if (tecidoBlackoutLargura - altura < 0.05) { AK = ARREDONDAR_PARA_CIMA(largura * franzBlackout / tecidoBlackoutLargura) * (altura + 0.1); }
    else { AK = largura * franzBlackout; }
  }

  const custoTotalTecidos = R * tecidoCortinaPreco + Z * tecidoForroPreco + AK * tecidoBlackoutPreco;
  
  const custoTotalConfecao = valorUnitarioConfecao * largura;
  const custoTotalTrilho = valorUnitarioTrilho * largura;

  const CUSTO_BASE_MARCADO = custoTotalTecidos + custoTotalConfecao + custoTotalTrilho + valorOutros;
  const custoComMarkup = CUSTO_BASE_MARCADO * fatorMarkupTotal;
  const CUSTO_FINAL_TOTAL = custoComMarkup + valorInstalacao + valorFrete;

  return {
    qtdTecidoCortina: R,
    qtdTecidoForro: Z,
    qtdTecidoBlackout: AK,
    orcamentoBase: ARREDONDAR_PARA_CIMA(CUSTO_FINAL_TOTAL)
  };
}

module.exports = {
  calcularOrcamento
};