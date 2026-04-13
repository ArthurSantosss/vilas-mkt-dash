function extractPrepayBalance(str) {
  if (!str) return 0;
  if (!str.toLowerCase().includes('saldo') && !str.toLowerCase().includes('balance')) return 0;
  
  const match = str.match(/(?:R\$|\$|€|£)?\s*([\d.,]+)/);
  if (match && match[1]) {
    let numStr = match[1];
    if (numStr.includes(',') && numStr.indexOf(',') > numStr.indexOf('.')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else if (numStr.includes(',') && numStr.indexOf('.') === -1) {
        numStr = numStr.replace(',', '.');
    } else {
        numStr = numStr.replace(/,/g, '');
    }
    return Number.parseFloat(numStr) || 0;
  }
  return 0;
}

console.log(extractPrepayBalance("Saldo disponível (R$99,87 BRL)"));
console.log(extractPrepayBalance("Saldo disponível (R$1.099,87 BRL)"));
console.log(extractPrepayBalance("Saldo disponível (R$0,00 BRL)"));
console.log(extractPrepayBalance("Available Balance ($1,234.00)"));
console.log(extractPrepayBalance("Mastercard *1454"));
console.log(extractPrepayBalance("Saldo disponível (R$21,19 BRL)"));
